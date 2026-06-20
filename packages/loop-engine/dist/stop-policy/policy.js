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
export const DEFAULT_STOP_POLICY_CONFIG = {
    maxIterations: 5,
    enableDegradationGuard: true,
    degradationThreshold: 10,
    enableStagnationDetection: true,
    stagnationThreshold: 2,
    improvementThreshold: 3,
    minQualityScore: undefined,
};
/**
 * 统一停止策略
 *
 * 返回 StopDecision，调用方根据 stop 决定是否终止循环。
 */
export function evaluateStop(ctx, config) {
    const { iteration, evaluation, bestScore, lastScore, stagnationCount, guardResult, hasError } = ctx;
    // P-1: 错误
    if (hasError) {
        return { stop: true, reason: "error", explanation: "迭代执行出错" };
    }
    // P0: CompletionGuard 目标驱动
    if (guardResult?.stopCondition) {
        const reason = guardResult.stopCondition.reason;
        if (reason === "any_goal_blocked") {
            return { stop: true, reason: "goals_blocked", explanation: `目标阻塞: ${guardResult.stopCondition.blockedGoals.map(g => g.goalId).join(", ")}` };
        }
        if (reason === "max_effort_exceeded") {
            return { stop: true, reason: "effort_exceeded", explanation: `努力值耗尽: ${guardResult.stopCondition.effortSpent}/${guardResult.stopCondition.maxEffort}` };
        }
        if (reason === "all_goals_verified") {
            // 目标都 verified 了，检查质量门槛
            const qualityGate = config.minQualityScore ?? 0;
            if (qualityGate > 0 && evaluation.totalScore < qualityGate) {
                return {
                    stop: false,
                    reason: "continue",
                    explanation: `目标已验证但质量分数 ${evaluation.totalScore} 低于最低门槛 ${qualityGate}，继续迭代`,
                };
            }
            return {
                stop: true,
                reason: "goals_verified",
                explanation: `所有目标已验证通过，质量分数 ${evaluation.totalScore}`,
            };
        }
    }
    // P1: 质量门槛
    if (evaluation.excellent) {
        return { stop: true, reason: "excellent", explanation: `达到优秀线: ${evaluation.totalScore}` };
    }
    if (evaluation.passed) {
        return { stop: true, reason: "passed", explanation: `达到通过线: ${evaluation.totalScore}` };
    }
    // P4: 安全阀（必须在退化/停滞之前，确保任何情况都有上限）
    if (iteration >= config.maxIterations) {
        return { stop: true, reason: "max_iterations", explanation: `达到最大迭代次数 ${config.maxIterations}` };
    }
    // P2: 退化保护（需要至少一轮历史 + 启用开关 + 超过阈值）
    if (config.enableDegradationGuard && iteration > 1) {
        const drop = lastScore - evaluation.totalScore;
        if (drop > config.degradationThreshold) {
            return {
                stop: true,
                reason: "degradation",
                explanation: `分数下降 ${drop} 分（超过阈值 ${config.degradationThreshold}），从 ${lastScore} 到 ${evaluation.totalScore}`,
            };
        }
    }
    // P3: 停滞检测
    if (config.enableStagnationDetection && stagnationCount >= config.stagnationThreshold) {
        return {
            stop: true,
            reason: "stagnation_pivot",
            explanation: `连续 ${stagnationCount} 轮无显著改善（阈值 ${config.stagnationThreshold}）`,
        };
    }
    return { stop: false, reason: "continue", explanation: "未达到任何停止条件，继续迭代" };
}
/**
 * 判断本轮分数是否带来显著改善
 *
 * 用于更新 stagnationCount：
 * - 创新高 → 重置停滞
 * - 显著改善（> improvementThreshold）→ 不增加停滞
 * - 否则 → 增加停滞
 */
export function isSignificantImprovement(currentScore, bestScore, lastScore, improvementThreshold) {
    if (currentScore > bestScore)
        return "new_best";
    if (currentScore > lastScore + improvementThreshold)
        return "improved";
    return "stagnant";
}
export class StopPolicy {
    config;
    constructor(config) {
        this.config = { ...DEFAULT_STOP_POLICY_CONFIG, ...config };
    }
    evaluate(ctx) {
        return evaluateStop(ctx, this.config);
    }
    getConfig() {
        return this.config;
    }
}
//# sourceMappingURL=policy.js.map