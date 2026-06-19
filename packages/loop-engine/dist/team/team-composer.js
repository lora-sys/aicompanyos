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
// ============================================================
// TeamComposer 实现
// ============================================================
/**
 * 团队组合器 — 规则匹配引擎
 *
 * 使用方式：
 * ```typescript
 * const composer = new TeamComposer(rules);
 * const workers = composer.compose(features);
 * ```
 */
export class TeamComposer {
    /** 排序后的规则表（按 priority 升序） */
    sortedRules;
    /** 是否有兜底规则 */
    hasFallbackRule;
    constructor(rules) {
        // 按 priority 升序排序（数字越小越先匹配）
        this.sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
        // 检查是否有兜底规则
        this.hasFallbackRule = rules.some((r) => r.priority >= 998);
        if (!this.hasFallbackRule) {
            console.warn("[TeamComposer] 警告：没有兜底规则（match 始终返回 true 或 priority>=999）。建议添加默认规则以避免无法组队。");
        }
    }
    /**
     * 根据任务特征匹配规则并返回团队定义
     *
     * @param features TaskAnalyzer 提取的任务特征
     * @returns 团队成员定义数组
     * @throws 如果没有兜底规则且没有任何规则命中
     */
    compose(features) {
        for (const rule of this.sortedRules) {
            try {
                if (rule.match(features)) {
                    console.log(`[TeamComposer] 命中规则 "${rule.id}" (priority=${rule.priority}): ${rule.reasoning}`);
                    return rule.team;
                }
            }
            catch (e) {
                // 规则 match() 抛出异常时跳过，继续尝试下一条
                console.warn(`[TeamComposer] 规则 "${rule.id}" match() 异常:`, e);
                continue;
            }
        }
        // 没有任何规则命中且没有兜底规则
        throw new Error(`[TeamComposer] 没有规则匹配当前任务特征（domain=${features.domain}, ` +
            `complexity=${features.complexity}, needsResearch=${features.needsResearch}）。` +
            `请添加兜底规则或检查规则覆盖率。`);
    }
    /**
     * 将 TeamWorkerDef[] 转换为完整的 IWorker[]
     *
     * @param defs 团队成员定义
     * @param taskId 关联的任务 ID
     * @returns 完整的 IWorker 数组
     */
    defsToWorkers(defs, taskId) {
        return defs.map((def, index) => ({
            id: `${def.role}-${taskId.slice(0, 8)}-${index}`,
            role: def.role,
            agentType: this.roleToAgentType(def.role),
            configOverride: def.configOverride,
            required: def.priority === "essential",
        }));
    }
    /**
     * 获取所有规则（只读）
     */
    getRules() {
        return this.sortedRules;
    }
    /**
     * 检查规则是否覆盖了给定的特征组合（用于测试）
     *
     * @param features 要测试的特征
     * @returns 命中的规则 ID，如果没有命中返回 null
     */
    dryRun(features) {
        for (const rule of this.sortedRules) {
            try {
                if (rule.match(features)) {
                    return rule.id;
                }
            }
            catch {
                continue;
            }
        }
        return null;
    }
    // ============================================================
    // 私有辅助方法
    // ============================================================
    /** WorkerRole → agentType 映射（默认实现，可被子类覆盖） */
    roleToAgentType(role) {
        const mapping = {
            writer: "writer",
            critic: "critic",
            researcher: "researcher",
            "uiux-designer": "ui-ux",
            reviewer: "reviewer",
        };
        return mapping[role] ?? role;
    }
}
//# sourceMappingURL=team-composer.js.map