/**
 * TeamComposer — 团队组合规则匹配引擎
 *
 * 核心逻辑：
 * - 维护一个有序规则表（按 priority 升序）
 * - 对 TaskFeatures 从上到下匹配
 * - 第一个命中的规则决定团队组合
 * - 必须有一条兜底规则（priority=999, match 始终返回 true）
 *
 * 文件位置：packages/loop-engine/src/team/team-composer.ts
 */
import type { TaskFeatures, TeamCompositionRule, TeamWorkerDef, IWorker } from "./types.js";
/**
 * 团队组合器 — 规则匹配引擎
 *
 * 使用方式：
 * ```typescript
 * const composer = new TeamComposer(rules);
 * const workers = composer.compose(features);
 * ```
 */
export declare class TeamComposer {
    /** 排序后的规则表（按 priority 升序） */
    private sortedRules;
    /** 是否有兜底规则 */
    private hasFallbackRule;
    constructor(rules: TeamCompositionRule[]);
    /**
     * 根据任务特征匹配规则并返回团队定义
     *
     * @param features TaskAnalyzer 提取的任务特征
     * @returns 团队成员定义数组
     * @throws 如果没有兜底规则且没有任何规则命中
     */
    compose(features: TaskFeatures): TeamWorkerDef[];
    /**
     * 将 TeamWorkerDef[] 转换为完整的 IWorker[]
     *
     * @param defs 团队成员定义
     * @param taskId 关联的任务 ID
     * @returns 完整的 IWorker 数组
     */
    defsToWorkers(defs: TeamWorkerDef[], taskId: string): IWorker[];
    /**
     * 获取所有规则（只读）
     */
    getRules(): readonly TeamCompositionRule[];
    /**
     * 检查规则是否覆盖了给定的特征组合（用于测试）
     *
     * @param features 要测试的特征
     * @returns 命中的规则 ID，如果没有命中返回 null
     */
    dryRun(features: TaskFeatures): string | null;
    /** WorkerRole → agentType 映射（默认实现，可被子类覆盖） */
    private roleToAgentType;
}
//# sourceMappingURL=team-composer.d.ts.map