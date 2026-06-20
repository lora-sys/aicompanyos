/**
 * Loop Module — 可复用的循环执行引擎
 *
 * 基于 Planner → Generator → Evaluator + Evolution 三/四 Agent 架构
 *
 * 核心设计（参考 frontend design harness 的最佳实践）：
 * 1. 固定评估标准 (GradingCriteria) — 任务开始前定义，全程不变
 * 2. Context Reset — 每次迭代清空上下文，通过 IterationHandoff 传递状态
 * 3. Strategic Decision — 每轮评估后：refine（精炼）或 pivot（转向）或 accept（接受）
 * 4. Evolution Module — 学习评分趋势，自动调整策略
 * 5. Degradation Guard — 分数下降则终止，保留最佳版本
 *
 * 与 monolithic LoopHarness 的区别：
 * - LoopHarness: 内部硬编码 Writer/Critic 的调用逻辑
 * - LoopModule: 抽象接口，任何实现 Planner/Generator/Evaluator 的 Agent 都可以接入
 */
import type { GradingCriteria, GradingResult, StrategicDecision, IterationHandoff } from "./grading-criteria.js";
import type { AcceptanceGoal, StopCondition, CompletionGuardConfig } from "../completion-guard/types.js";
/** 规划器：将任务拆解为执行计划 */
export interface IPlannerAgent<Input = any, Plan = any> {
    /** 生成执行计划 */
    plan(input: Input, context?: Record<string, unknown>): Promise<Plan>;
}
/** 生成器：根据计划 + 反馈生成产出 */
export interface IGeneratorAgent<Plan = any, Output = any> {
    /**
     * 生成产出
     * @param plan 当前步骤的计划
     * @param feedback 来自上一次 Evaluator 的反馈（首次为空）
     * @param handoff 迭代状态交接（包含历史趋势、战略方向等）
     */
    generate(plan: Plan, feedback?: string, handoff?: IterationHandoff): Promise<Output>;
}
/** 评估器：按照固定标准评估产出 */
export interface IEvaluatorAgent<Output = any> {
    /**
     * 评估产出
     * @param output 待评估的产出
     * @param criteria 固定评估标准
     * @param originalTask 原始任务（用于 topic accuracy 检测）
     */
    evaluate(output: Output, criteria: GradingCriteria, originalTask: string): Promise<GradingResult>;
}
/** 自进化器：学习迭代模式，优化策略 */
export interface IEvolutionAgent {
    /**
     * 分析迭代历史，给出策略建议
     * @param history 所有迭代的评估结果
     * @returns 建议的战略决策和原因
     */
    analyze(history: GradingResult[]): Promise<{
        decision: StrategicDecision;
        reason: string;
        patternInsights?: string[];
    }>;
}
export interface LoopModuleConfig {
    /** 最大迭代次数（含首次）— 作为安全阀保留，主停止由 CompletionGuard 控制 */
    maxIterations: number;
    /** 是否启用退化保护 */
    enableDegradationGuard: boolean;
    /** 是否启用自进化分析 */
    enableEvolution: boolean;
    /** 连续多少轮分数无改善触发 pivot */
    stagnationThreshold: number;
    /** Context Reset: 是否在每次迭代间重置 Generator 上下文 */
    useContextReset: boolean;
    /** 是否启用 CompletionGuard（目标驱动停止条件） */
    enableCompletionGuard?: boolean;
    /** AcceptanceCriteria — 验收目标列表 */
    acceptanceCriteria?: AcceptanceGoal[];
    /** CompletionGuard 配置 */
    completionGuardConfig?: Partial<CompletionGuardConfig>;
    /** LLM Provider 包装函数 — 用于验证阶段的 LLM 断言 */
    llmProviderFn?: (prompt: string) => Promise<string>;
}
export interface LoopIteration<TOutput = any> {
    /** 迭代轮次 (1-based) */
    round: number;
    /** 生成器的产出 */
    output: TOutput;
    /** 评估结果 */
    evaluation: GradingResult;
    /** 战略决策 */
    strategicDecision: StrategicDecision;
    /** 终止原因 */
    stopReason: import("../stop-policy/policy.js").StopReason;
    /** 本轮耗时 ms */
    durationMs: number;
}
/** LoopModule 完整执行结果 */
export interface LoopModuleResult<TOutput = any> {
    /** 所有迭代记录 */
    iterations: LoopIteration<TOutput>[];
    /** 最终使用的产出（最佳版本） */
    bestOutput: TOutput | null;
    /** 最终评分 */
    finalScore: number;
    /** 最终是否通过 */
    passed: boolean;
    /** 最终是否优秀 */
    excellent: boolean;
    /** 总迭代次数 */
    totalIterations: number;
    /** 总耗时 ms */
    totalDurationMs: number;
    /** Evolution 分析结果（如果启用） */
    evolutionSummary?: {
        patternFound: string;
        suggestions: string[];
    };
    /** 目标完成度快照 */
    goalSnapshot?: Array<{
        goalId: string;
        status: "pending" | "verifying" | "verified" | "failed" | "blocked" | "skipped";
    }>;
    /** 结构化停止条件（替代 stopReason 字符串） */
    stopCondition?: StopCondition;
    /** 完成进度 */
    completionProgress?: {
        totalGoals: number;
        verifiedGoals: number;
        progressPercent: number;
    };
}
/**
 * Loop Module — 可复用的循环执行引擎
 *
 * 使用方式：
 * ```typescript
 * const loop = new LoopModule({
 *   planner: myPlanner,
 *   generator: myWriterAgent,
 *   evaluator: myCriticAgent,
 *   evolution: myEvolutionAgent, // optional
 *   criteria: DEFAULT_WRITING_CRITERIA,
 * });
 *
 * const result = await loop.run("写一篇关于 AI Agent 的技术博客");
 * console.log(result.passed, result.finalScore, result.totalIterations);
 * ```
 */
export declare class LoopModule<TInput = string, TPlan = any, TOutput = any> {
    private planner;
    private generator;
    private evaluator;
    private evolution?;
    private criteria;
    private config;
    /** ADR-004: 目标驱动完成度守护者 */
    private completionGuard?;
    /** 最新一轮 CompletionGuard 检查结果（供 shouldStop() 读取） */
    private latestGuardResult;
    /** 统一停止策略模块 */
    private stopPolicy;
    constructor(params: {
        planner: IPlannerAgent<TInput, TPlan>;
        generator: IGeneratorAgent<TPlan, TOutput>;
        evaluator: IEvaluatorAgent<TOutput>;
        evolution?: IEvolutionAgent;
        criteria?: GradingCriteria;
        config?: Partial<LoopModuleConfig>;
    });
    /** 获取当前配置（只读） */
    getConfig(): Readonly<LoopModuleConfig>;
    getCriteria(): Readonly<GradingCriteria>;
    run(input: TInput): Promise<LoopModuleResult<TOutput>>;
    /** 构建 IterationHandoff（Context Reset 状态交接） */
    private buildHandoff;
    /** 格式化反馈文本（注入到 Generator） */
    private formatFeedback;
    /** 做出战略决策 */
    private makeStrategicDecision;
    /**
     * ★ ADR-004 目标驱动：统一停止条件判断
     *
     * 现在委托给 StopPolicy 模块处理，LoopModule 只负责读取最后一次迭代记录
     * 并调用 stopPolicy.evaluate()。
     */
    private shouldStop;
    /** 推断当前战略方向 */
    private inferCurrentStrategy;
    /** 创建空的评估结果（当 Evaluator 失败时） */
    private emptyEvaluation;
}
//# sourceMappingURL=engine.d.ts.map