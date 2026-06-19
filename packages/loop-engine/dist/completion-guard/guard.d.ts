/**
 * CompletionGuard — 目标驱动的完成度守护者
 *
 * 核心职责：
 * 1. 管理 AcceptanceGoal[] 的生命周期（pending → verifying → verified/failed/blocked）
 * 2. 每轮迭代后执行验证流水线
 * 3. 根据目标状态产生 StopCondition
 * 4. 将验证证据记录到 EvidenceChain
 *
 * 设计原则：
 * - "目标没完成，就继续；证据不足，就验证；真正阻塞，才停下；完整完成，才交付"
 */
import type { AcceptanceGoal, GoalStatus, CompletionGuardConfig, CompletionCheckResult, CompletionProgress, VerificationContext } from "./types.js";
import { VerificationPipeline } from "./pipeline.js";
/** EvidenceChain 类型声明（避免循环依赖） */
interface EvidenceChainLike {
    verifications?: {
        record(params: {
            goalId: string;
            method: string;
            passed: boolean;
            durationMs: number;
            evidenceSummary: {
                methodType: string;
                passed: boolean;
                keyOutput: string;
            };
            round: number;
            taskId: string;
        }): unknown;
    };
}
export declare class CompletionGuard {
    private goals;
    private config;
    private pipeline;
    private evidenceChain;
    private effortSpent;
    private roundCount;
    private taskId;
    /** v0.3.1+: 最新质量分数（由 LoopModule 每轮迭代后注入） */
    private currentQualityScore;
    constructor(goals: AcceptanceGoal[], config?: Partial<CompletionGuardConfig>, evidenceChain?: EvidenceChainLike, pipeline?: VerificationPipeline);
    /**
     * 执行一轮完整的验证检查
     *
     * 流程：
     * 1. 收集 pending + failed(可重试) 的 goals
     * 2. 按 priority 排序 (critical > major > minor)
     * 3. 并发执行验证
     * 4. 更新目标状态
     * 5. 记录证据到 EvidenceChain
     * 6. 计算 stopCondition
     */
    check(currentOutput?: unknown, context?: Partial<VerificationContext>): Promise<CompletionCheckResult>;
    /**
     * 仅验证指定的目标（增量验证）
     *
     * 当已知某些目标受本次产出变化影响时使用
     */
    checkGoals(goalIds: string[], currentOutput?: unknown, context?: Partial<VerificationContext>): Promise<CompletionCheckResult>;
    /** 获取当前所有目标状态的只读快照 */
    getGoalSnapshot(): ReadonlyMap<string, GoalStatus>;
    /** 获取完成进度摘要 */
    getProgress(): CompletionProgress;
    /** 重置指定目标的状态（用于 replan 后重新验证） */
    resetGoals(goalIds: string[]): void;
    /** 获取已花费的努力值 */
    getEffortSpent(): number;
    /**
     * v0.3.1+: 设置最新质量分数
     *
     * 由 LoopModule 在每轮 Critic 评估后调用。
     * 当 config.minQualityScore 已设置时，此值会影响 all_goals_verified 的判定。
     *
     * @param score Critic 评估的加权总分 (0-100)
     */
    setQualityScore(score: number): void;
    /** 获取当前质量分数（用于调试） */
    getQualityScore(): number | undefined;
    /**
     * 执行单个目标的验证
     *
     * 按 verifyBy 数组顺序尝试，任一通过即视为通过
     */
    private verifyGoal;
    /**
     * 计算当前停止条件
     *
     * 优先级：
     * 1. ALL verified     → all_goals_verified (交付)
     * 2. ANY blocked      → any_goal_blocked (阻塞)
     * 3. effort exhausted → max_effort_exceeded (最大努力)
     * 4. 否则             → null (继续)
     */
    private determineStopCondition;
    /** 获取当前可验证的目标列表（按 priority 排序） */
    private getVerifiableGoals;
    /** 计算目标的权重（用于 effort 计算） */
    private goalWeight;
    /** 计算一轮验证消耗的努力值 */
    private calculateEffort;
    /**
     * 分析失败是否构成阻塞
     *
     * 简单启发式：
     * - command 执行返回特定错误码（如依赖缺失 ENOENT）
     * - 连续多次失败且错误信息相同
     */
    private analyzeBlocker;
    /** 记录验证证据到 EvidenceChain */
    private recordEvidence;
}
export {};
//# sourceMappingURL=guard.d.ts.map