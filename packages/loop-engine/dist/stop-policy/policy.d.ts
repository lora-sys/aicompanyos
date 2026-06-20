/**
 * StopPolicy — 统一的循环停止策略模块
 *
 * 将分散在 LoopModule 和 PiAgentLoopEngine 中的停止判断逻辑集中到此处。
 * 采用 5 级优先级：
 *   P0: CompletionGuard 目标驱动
 *   P1: 质量门槛 (excellent / passed)
 *   P2: 退化保护 (分数下降超过阈值)
 *   P3: 停滞检测 (连续 N 轮无改善)
 *   P4: 安全阀 (maxIterations)
 *
 * 设计原则：
 * - 策略可配置，不同部门/档位可用不同参数
 * - 单一 truth source，避免两个引擎逻辑分歧
 * - 纯函数（依赖注入），易于测试
 */
import type { GradingResult } from "../loop-module/grading-criteria.js";
import type { CompletionCheckResult } from "../completion-guard/types.js";
/** 停止原因联合类型 */
export type StopReason = "goals_verified" | "goals_blocked" | "effort_exceeded" | "excellent" | "passed" | "degradation" | "stagnation_pivot" | "max_iterations" | "error" | "continue";
/** 停止决策结果 */
export interface StopDecision {
    /** 是否停止 */
    stop: boolean;
    /** 停止原因 */
    reason: StopReason;
    /** 人类可读说明 */
    explanation: string;
}
/** 停止策略配置 */
export interface StopPolicyConfig {
    /** 最大迭代次数（安全阀） */
    maxIterations: number;
    /** 是否启用退化保护 */
    enableDegradationGuard: boolean;
    /** 退化阈值：分数下降超过此值才视为退化（避免评分波动误判） */
    degradationThreshold: number;
    /** 是否启用停滞检测 */
    enableStagnationDetection: boolean;
    /** 停滞阈值：连续多少轮无改善触发停滞 */
    stagnationThreshold: number;
    /** 改善阈值：超过此分数变化才视为"有改善" */
    improvementThreshold: number;
    /** 最低质量分数：CompletionGuard all_goals_verified 后仍需达到此质量才停止 */
    minQualityScore?: number;
}
export declare const DEFAULT_STOP_POLICY_CONFIG: StopPolicyConfig;
/** 停止策略上下文 */
export interface StopContext {
    /** 当前迭代次数（从 1 开始） */
    iteration: number;
    /** 最新一轮评分 */
    evaluation: GradingResult;
    /** 当前最佳分数 */
    bestScore: number;
    /** 上一轮分数 */
    lastScore: number;
    /** 当前停滞计数 */
    stagnationCount: number;
    /** CompletionGuard 最新结果 */
    guardResult: CompletionCheckResult | null;
    /** 是否有错误 */
    hasError: boolean;
}
/**
 * 统一停止策略
 *
 * 返回 StopDecision，调用方根据 stop 决定是否终止循环。
 */
export declare function evaluateStop(ctx: StopContext, config: StopPolicyConfig): StopDecision;
/**
 * 判断本轮分数是否带来显著改善
 *
 * 用于更新 stagnationCount：
 * - 创新高 → 重置停滞
 * - 显著改善（> improvementThreshold）→ 不增加停滞
 * - 否则 → 增加停滞
 */
export declare function isSignificantImprovement(currentScore: number, bestScore: number, lastScore: number, improvementThreshold: number): "new_best" | "improved" | "stagnant";
export declare class StopPolicy {
    private config;
    constructor(config?: Partial<StopPolicyConfig>);
    evaluate(ctx: StopContext): StopDecision;
    getConfig(): Readonly<StopPolicyConfig>;
}
//# sourceMappingURL=policy.d.ts.map