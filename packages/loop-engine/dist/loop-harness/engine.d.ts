/**
 * Loop Engineering Harness — 双层嵌套循环执行引擎
 *
 * 核心设计：
 * - LoopHarness 是 LoopModule 的 thin wrapper
 * - Inner Loop（Step 级）: 委托给 LoopModule.run() 执行 Writer → Critic 循环
 * - Outer Loop（Plan 级）: 全部 steps 完成 → Verify → 不达标 → Replan → 重新执行
 *
 * 关键原则：
 * - "物理层焊死"：Critic 的完整输出直接注入 Writer 的下一次输入
 * - 退化保护：重写后 score 反而下降则终止，保留最佳版本
 * - Evidence Chain：每轮迭代都记录到证据链
 *
 * v0.2.0 变更：移除 @deprecated 的 ExecutionOrchestrator fallback 路径。
 * Writer-Critic 反馈环统一走 LoopModule 主路径。
 * ExecutionOrchestrator 仅保留用于非 Writer step（如 ui-ux）的顺序执行。
 */
import type { LoopContext, ExecutionPlan, PlanStep } from "../types.js";
import type { LLMProvider } from "../interrogate/types.js";
import type { DepartmentConfig, ProcessedOutput } from "../department/types.js";
import type { StepExecutionResult, AgentExecutor, OrchestratorAgentContext } from "../orchestrator/types.js";
import type { ToolRegistry } from "../tool-registry/registry.js";
import type { IGeneratorAgent, IEvaluatorAgent, GradingCriteria } from "../loop-module/index.js";
import { PiAgentLoopEngine } from "../pi-agent-adapter.js";
interface CriticOutputData {
    overallScore: number;
    dimensions: Record<string, {
        score: number;
        comment: string;
    }>;
    passed: boolean;
    suggestions: Array<{
        type: string;
        severity: string;
        location?: string;
        description: string;
        suggestion: string;
    }>;
    reasoning: string;
}
/** Writer 输出类型（兼容 LoopModule 的泛型输出） */
interface WriterOutput {
    content?: string;
    [key: string]: unknown;
}
/** Inner Loop 配置 */
export interface LoopHarnessConfig {
    /** Inner Loop: 单步最大重写次数 */
    maxRewrites: number;
    /** Inner Loop: 质量阈值（Critic score >= 此值才通过） */
    qualityThreshold: number;
    /** Outer Loop: 全局最大 replan 次数 */
    maxReplans: number;
    /** 是否启用退化保护（score 下降则停止重写） */
    enableDegradationGuard: boolean;
    /** 部门配置（内容产出部/研发部/运营部等的不同配置剖面） */
    departmentConfig?: DepartmentConfig;
    /**
     * ★ ADR-005: 输出后处理器（由 CLI 层传入，避免循环依赖）
     *
     * 签名: (rawContent: string, context: { rawContent, metadata?, taskId? }) => Promise<ProcessedOutput>
     *
     * LoopHarness 不直接依赖 @aicos/content-production，
     * 而是通过此函数实现 OutputPipeline 的执行。
     */
    outputProcessor?: (rawContent: string, context: {
        rawContent: string;
        metadata?: Record<string, unknown>;
        taskId?: string;
    }) => Promise<ProcessedOutput>;
    /** 是否使用基于 pi-agent-core 的新一代循环引擎（默认 false 保持向后兼容） */
    usePiAgentCore?: boolean;
    /** Inner Loop 每次迭代开始时回调 */
    onIterationStart?: (iteration: number, stepId: string) => void;
    /** Writer 产出完成时回调 */
    onWriterOutput?: (content: string, iteration: number) => void;
    /** Critic 评估完成时回调 */
    onCriticResult?: (score: number, passed: boolean, suggestions: string[], iteration: number) => void;
    /** CompletionGuard 目标进度回调 */
    onGoalProgress?: (verified: number, total: number, stopCondition: string) => void;
    /** 单步执行完成时回调 */
    onStepComplete?: (stepId: string, score: number, passed: boolean) => void;
}
/**
 * 动态 Few-shot 样例
 *
 * 从 Memory 历史数据提取的真实评估记录，
 * 用于补充 GradingCriteria 中的静态 examples。
 * 由 CLI 层通过 setDynamicExamples() 注入。
 */
export interface DynamicExample {
    /** 样例描述（如"任务要求写 Rust 异步编程，文章深入分析了 Pin vs async fn 的性能差异"） */
    description: string;
    /** 该产出获得的评分 */
    score: number;
    /** 评分理由（如"有深入的 trade-off 分析和生产级代码示例"） */
    reason: string;
}
/** Inner Loop 单步迭代结果 */
export interface StepLoopIteration {
    /** 迭代轮次 (1 = 首次执行, 2+ = 重写) */
    round: number;
    /** Writer 输出 */
    writerOutput: StepExecutionResult;
    /** Critic 审核结果 (可能为空，如果 Critic 执行失败) */
    criticOutput?: CriticOutputData;
    /** 是否通过质量门 */
    passed: "quality_met" | "max_rewrites" | "degradation" | "error" | "continue" | "stable_plateau";
    /** 终止原因 */
    reason: "quality_met" | "max_rewrites" | "degradation" | "error" | "continue" | "stable_plateau";
    /** 本轮耗时 ms */
    durationMs: number;
}
/** Inner Loop 完整结果（单个 Step 的所有迭代） */
export interface StepLoopResult {
    /** Step ID */
    stepId: string;
    /** 所有迭代记录 */
    iterations: StepLoopIteration[];
    /** 最终使用的输出（最佳版本） */
    finalOutput: StepExecutionResult;
    /** 最终 Critic 评分 */
    finalScore: number;
    /** 是否最终通过 */
    passed: boolean;
    /** 总耗时 ms */
    totalDurationMs: number;
}
/** Harness 完整执行结果 */
export interface HarnessExecutionResult {
    /** 所有 Step 的执行结果 */
    stepResults: StepLoopResult[];
    /** 所有步骤的最终输出 */
    finalOutputs: Record<string, unknown>;
    /** 是否全部通过 */
    allPassed: boolean;
    /** 总迭代次数（含重写） */
    totalIterations: number;
    /** 总耗时 ms */
    totalDurationMs: number;
    /** 经过部门配置的后处理链处理后的交付物（仅当 departmentConfig.outputPipeline 存在时有值） */
    processedOutput?: import("../department/types.js").ProcessedOutput;
}
/**
 * Loop Engineering Harness
 *
 * 包装 LoopModule，在 Step 级别实现 Writer-Critic 反馈环。
 * 每个 Writer step 执行后自动触发 Critic 审核，
 * 如果评分不达标则用 Critic 的完整反馈注入 Writer 重写。
 *
 * 所有 Writer-Critic 配对 step 均通过 LoopModule.run() 执行，
 * 非 Writer step（如 ui-ux）仍通过 ExecutionOrchestrator 顺序执行。
 */
export declare class LoopHarness {
    private loopModule;
    private orchestrator;
    private config;
    private llmProvider;
    private toolRegistry;
    private writerFactory?;
    private criticFactory?;
    private criteria;
    private currentProfile?;
    private dynamicExamples?;
    private piAgentEngine;
    private piEventForwarder;
    constructor(toolRegistry: ToolRegistry, llmProvider: LLMProvider, config?: Partial<LoopHarnessConfig>);
    /** 获取当前配置（只读） */
    getConfig(): Readonly<LoopHarnessConfig>;
    /**
     * ★ 获取 pi-agent-core 引擎实例（用于 CLI/TUI 事件订阅）
     *
     * 仅在 usePiAgentCore=true 时有值。
     * 可用于订阅 AgentEvent（agent_start/turn_end/tool_execution_* 等）并转发到 TUI 渲染层。
     */
    getPiAgentEngine(): PiAgentLoopEngine<PlanStep, WriterOutput> | null;
    /**
     * ★ 设置 pi-agent-core 事件转发回调
     *
     * CLI/TUI 层调用此方法注册事件监听器。
     * 当 PiAgentLoopEngine 产生 AgentEvent 时，自动转发到此回调。
     *
     * @example
     * ```ts
     * loopHarness.setPiEventForwarder((event) => {
     *   if (event.type === "turn_end") {
     *     tui.renderIteration(event.message);
     *   }
     * });
     * ```
     */
    setPiEventForwarder(forwarder: (event: any) => void): void;
    /**
     * 注册 Agent 工厂
     *
     * writer / critic 类型注册为 IGeneratorAgent / IEvaluatorAgent 工厂 → LoopModule 主路径
     * 其他类型（如 ui-ux）注册为 AgentExecutor 工厂 → ExecutionOrchestrator 顺序执行
     */
    registerAgent(agentType: string, factory: (ctx: OrchestratorAgentContext) => AgentExecutor | IGeneratorAgent<any, any> | IEvaluatorAgent): void;
    /**
     * 设置评估标准（GradingCriteria）
     *
     * 必须在使用前调用此方法设置标准。
     * 如果不设置，将使用 DEFAULT_WRITING_CRITERIA。
     */
    setCriteria(criteria: GradingCriteria): void;
    /**
     * 设置动态 Few-shot 样例 (v0.2.0)
     *
     * 由 CLI 层从 Memory 历史数据中提取同类型任务的高/低分评估记录，
     * 注入到 GradingCriteria 中作为额外的校准样例（追加在静态 examples 之后）。
     *
     * @param examples 动态样例数组，每个包含 description / score / reason
     */
    setDynamicExamples(examples: DynamicExample[]): void;
    /**
     * ★ ADR-005: 设置部门配置
     *
     * 由 CLI 层在用户选择内容格式后调用。
     * 注入 DepartmentConfig 到 LoopHarness，影响：
     * - extractGoalsForStep(): 部门 GoalTemplate 优先于通用模板
     * - getOrCreateModule(): 部门验收标准和质量门槛注入 LoopModule
     * - executeWithLoop(): OutputPipeline 后处理执行
     */
    setDepartmentConfig(config: import("../department/types.js").DepartmentConfig): void;
    /**
     * ★ ADR-005: 设置输出后处理器回调
     *
     * 由 CLI 层传入，避免 loop-engine 直接依赖 content-production 包。
     * 回调签名与 LoopHarnessConfig.outputProcessor 一致。
     */
    setOutputProcessor(processor: NonNullable<LoopHarnessConfig["outputProcessor"]>): void;
    /**
     * 检查是否可以使用 LoopModule 主路径
     */
    private canUseLoopModule;
    /**
     * 延迟创建/获取 LoopModule 实例
     */
    private getOrCreateLoopModule;
    /**
     * 构建感知任务档位的 GradingCriteria
     *
     * v0.2.0:
     * - 根据 TaskProfile 覆盖阈值（passThreshold / excellenceThreshold）
     * - 将动态 Few-shot 样例（从 Memory 历史提取）追加到各维度的 examples 中
     * - 保留用户通过 setCriteria() 设置的自定义标准或 DEFAULT_WRITING_CRITERIA 的维度定义
     */
    private buildProfileAwareCriteria;
    /**
     * 执行完整计划（带 Inner Loop）
     *
     * 对每个 Writer step（有后续 Critic step 配对）：
     *   → 使用 LoopModule.run() 执行 Generator → Evaluator 循环
     *
     * 非 Writer step（如 ui-ux）：
     *   → 通过 ExecutionOrchestrator 顺序执行
     */
    executeWithLoop(plan: ExecutionPlan, context: LoopContext, agentContext?: OrchestratorAgentContext): Promise<HarnessExecutionResult>;
    /**
     * 使用 LoopModule 或 PiAgentLoopEngine 执行 Writer → Critic 反馈循环
     *
     * 流程：
     * 1. 检查 usePiAgentCore 配置标志
     * 2. 若启用 → 使用 PiAgentLoopEngine（pi-agent-core 驱动）
     * 3. 否则 → 使用 LoopModule（原有手搓引擎，向后兼容）
     * 4. 将结果统一转换为 StepLoopResult 格式
     */
    private executeWithLoopModule;
    /**
     * 将 LoopModuleResult 转换为 StepLoopResult
     */
    private convertToStepLoopResult;
    /**
     * 延迟创建/获取 PiAgentLoopEngine 实例
     *
     * 复用已注册的 writer/critic 工厂，
     * 将 IGeneratorAgent/IEvaluatorAgent 适配为 IPiWriterAgent/IPiCriticAgent 接口。
     */
    private getOrCreatePiAgentEngine;
    /**
     * 将 PiAgentLoopResult 转换为 StepLoopResult 格式
     *
     * 与 convertToStepLoopResult() 结构一致，确保下游代码无感知。
     */
    private convertPiResultToStepLoopResult;
    /**
     * ★ ADR-005: 从 finalOutputs 中提取原始文本内容
     *
     * 用于 OutputPipeline 的输入。
     * 优先提取 content 字段，其次尝试序列化整个 output 对象。
     */
    private extractRawContent;
    /**
     * 查找 Writer step 后紧跟的 Critic step
     */
    private findFollowingCriticStep;
    /**
     * ★ ADR-004/005: 从 PlanStep 中提取验收目标
     *
     * 数据来源优先级：
     * 1. step.metadata.acceptanceGoals — Planner 显式定义的目标（最高优先）
     * 2. DepartmentConfig.goalTemplates — 部门专属模板（新! 第二优先）
     * 3. GoalTemplateRegistry 自动匹配 — 根据步骤描述自动生成（兜底）
     */
    private static goalTemplateRegistry;
    private extractGoalsForStep;
}
export {};
//# sourceMappingURL=engine.d.ts.map