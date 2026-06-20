/**
 * PiAgentLoopEngine — 基于 pi-agent-core 的新一代循环引擎（Phase 1: Agent + agentLoop）
 *
 * 设计原则：
 * - ★ 不再手搓 Agent 运行时，全面使用 pi-agent-core 基础设施
 * - 保留业务创新层：CompletionGuard（目标驱动）、CriticAgent（评估）、WriterAgent（写作）
 *
 * 架构映射：
 *   我们的 LoopModule        →  agentLoop() + 手动 Critic 评估
 *   我们的手搓 while 循环    →  agentLoop 的 shouldStopAfterTurn 回调
 *   我们的 console.log 日志   →  AgentEvent 事件系统
 *   我们的 retryWithBackoff   →  内置 maxRetries + streamOptions
 *
 * 执行流程（每次迭代）：
 *   1. LLM 调用生成内容（通过 pi-ai 的 streamSimple）
 *   2. CriticAgent.evaluate(output)       →  独立评估
 *   3. CompletionGuard.check(output)     →  目标完成度检查
 *   4. shouldStopAfterTurn()?             →  决定是否继续
 *   5. 若继续: 注入 feedback 到下一轮 context
 */
import type { Agent, AgentEvent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { GradingCriteria, GradingResult, StrategicDecision } from "./loop-module/grading-criteria.js";
import type { AcceptanceGoal, StopCondition, CompletionGuardConfig } from "./completion-guard/types.js";
import type { PlanStep } from "./types.js";
import type { DepartmentConfig } from "./department/types.js";
import { type StopReason } from "./stop-policy/policy.js";
export interface PiAgentLoopEngineConfig {
    /** 最大迭代次数（安全阀，主停止由 CompletionGuard 控制） */
    maxIterations: number;
    /** 是否启用退化保护 */
    enableDegradationGuard: boolean;
    /** 连续多少轮无改善触发停止 */
    stagnationThreshold: number;
    /** 部门配置 */
    departmentConfig?: DepartmentConfig;
    enableCompletionGuard?: boolean;
    acceptanceCriteria?: AcceptanceGoal[];
    completionGuardConfig?: Partial<CompletionGuardConfig>;
    minQualityScore?: number;
    llmProviderFn?: (prompt: string) => Promise<string>;
    /**
     * ★ pi-ai Model（启用 agentLoop 驱动时需要）。
     * 若提供，run() 将使用 pi-agent-core 的 runAgentLoop 驱动迭代；
     * 否则退回到兼容的手搓循环。
     */
    model?: Model<any>;
    onIterationStart?: (iteration: number) => void;
    onWriterOutput?: (content: string, iteration: number) => void;
    onCriticResult?: (score: number, passed: boolean, suggestions: string[], iteration: number) => void;
    onGoalProgress?: (verified: number, total: number, stopCondition: string) => void;
}
export interface PiAgentIteration<TOutput = any> {
    iteration: number;
    output: TOutput;
    evaluation: GradingResult;
    strategicDecision: StrategicDecision;
    stopReason: StopReason;
    durationMs: number;
    /** pi-agent-core 事件摘要（用于 TUI 渲染） */
    events: string[];
}
export interface PiAgentLoopResult<TOutput = any> {
    iterations: PiAgentIteration<TOutput>[];
    bestOutput: TOutput | null;
    finalScore: number;
    passed: boolean;
    excellent: boolean;
    totalIterations: number;
    totalDurationMs: number;
    evolutionSummary?: {
        patternFound: string;
        suggestions: string[];
    };
    goalSnapshot?: Array<{
        goalId: string;
        status: string;
    }>;
    stopCondition?: StopCondition;
    completionProgress?: {
        totalGoals: number;
        verifiedGoals: number;
        progressPercent: number;
    };
    /** 标记：此结果来自 pi-agent-core 引擎 */
    _piPowered: true;
}
export interface IPiWriterAgent<Plan = any, Output = any> {
    generate(plan: Plan, feedback?: string): Promise<Output>;
}
export interface IPiCriticAgent<Output = any> {
    evaluate(output: Output, criteria: GradingCriteria, originalTask: string): Promise<GradingResult>;
}
/**
 * 基于 pi-agent-core 的新一代循环引擎
 *
 * 与旧 LoopModule 的区别：
 * - 使用 pi-agent-core 的 Agent 事件系统替代 console.log
 * - 内置 streaming / retry / abort 支持
 * - 结构化 AgentMessage 替代原始字符串拼接
 * - 保留 CompletionGuard 目标驱动停止条件（作为 shouldStopAfterTurn 注入）
 */
export declare class PiAgentLoopEngine<TPlan = PlanStep, TOutput = any> {
    private config;
    private writer;
    private critic;
    private criteria;
    private completionGuard?;
    private agent;
    private eventListeners;
    private stopPolicy;
    constructor(params: {
        writer: IPiWriterAgent<TPlan, TOutput>;
        critic: IPiCriticAgent<TOutput>;
        criteria?: GradingCriteria;
        config?: Partial<PiAgentLoopEngineConfig>;
    });
    /**
     * 初始化 pi-agent-core Agent
     *
     * 创建一个轻量级 Agent 实例用于状态管理和事件发布。
     * 实际的 LLM 调用仍由我们的 WriterAgent 完成（通过 generate 方法），
     * 但利用 Agent 的事件系统和消息管理能力。
     */
    initialize(): Promise<void>;
    /**
     * 执行目标驱动的 Inner Loop
     *
     * 流程：
     * 1. Writer 生成产出
     * 2. Critic 评估产出
     * 3. CompletionGuard 检查目标完成度
     * 4. shouldStop? → 继续或停止
     * 5. 若继续: 注入 feedback → 下轮迭代
     */
    run(plan: TPlan, originalTask: string): Promise<PiAgentLoopResult<TOutput>>;
    /**
     * 兼容性手搓循环（model 未提供时退回到此路径）
     */
    private runLegacy;
    /** agentLoop 驱动模式下的跨 turn 状态 */
    private agentLoopState?;
    /**
     * 使用 pi-agent-core 的 runAgentLoop 驱动 Writer → Critic 循环。
     *
     * 设计：把 Writer 和 Critic 实现为 AgentTool，由 agentLoop 负责 turn 调度、
     * 事件流和重试；我们在 shouldStopAfterTurn / prepareNextTurn 钩子中
     * 注入 StopPolicy 决策和 Critic feedback。
     */
    private runWithAgentLoop;
    private agentLoopIterations;
    private buildWriteTool;
    private buildEvaluateTool;
    private agentLoopShouldStop;
    private agentLoopPrepareNextTurn;
    /**
     * 订阅 pi-agent-core Agent 事件
     *
     * 用于将事件转发到 pi-tui 渲染层
     * 支持的事件类型：agent_start, agent_end, turn_start, turn_end,
     * message_start, message_update, message_end, tool_execution_*, etc.
     */
    onEvent(listener: (event: AgentEvent) => void): () => void;
    /** 构建 System Prompt */
    private buildSystemPrompt;
    /** 统一停止条件判断（由 StopPolicy 决定） */
    private shouldStop;
    /** 格式化评估反馈 */
    private formatFeedback;
    /** 战略决策 */
    private makeStrategicDecision;
    /** 空评估（失败兜底） */
    private emptyEvaluation;
    /** 获取 Agent 实例（用于高级用法） */
    getAgent(): Agent | null;
}
//# sourceMappingURL=pi-agent-adapter.d.ts.map