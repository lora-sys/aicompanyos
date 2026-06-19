/**
 * TeamManager — 团队经理（编排器）
 *
 * 组合 TaskAnalyzer + TeamComposer + WorkerRegistry，
 * 提供 composeTeam() 和 createWorkerFactories() 两个核心方法。
 *
 * 这是纯编排层：
 * - 不执行 LLM 调用
 * - 不创建 Agent 实例
 * - 只做特征提取 + 规则匹配 + 工厂生成
 *
 * 文件位置：packages/loop-engine/src/team/team-manager.ts
 */
import { TaskAnalyzer } from "./task-analyzer.js";
import { TeamComposer } from "./team-composer.js";
// ============================================================
// TeamManager 实现
// ============================================================
/**
 * 团队经理 — 动态团队编排的核心类
 *
 * 使用方式：
 * ```typescript
 * const manager = new TeamManager({ rules: MY_RULES });
 * const team = await manager.composeTeam("写一篇深度技术文章", { departmentId: "content-production" });
 * const factories = manager.createWorkerFactories(team);
 * // factories 可直接用于 LoopHarness.registerAgent()
 * ```
 */
export class TeamManager {
    analyzer;
    composer;
    constructor(config) {
        this.analyzer = config.customAnalyzer ?? new TaskAnalyzer();
        this.composer = new TeamComposer(config.rules);
    }
    /**
     * 分析任务特征 + 组建团队（核心方法）
     *
     * 流程：
     * 1. TaskAnalyzer.analyze(input) → TaskFeatures
     * 2. TeamComposer.compose(features) → TeamWorkerDef[]
     * 3. 转换为 ITeam 对象
     *
     * @param taskInput 用户的原始任务输入
     * @param context 团队上下文
     * @returns 组装好的团队
     */
    async composeTeam(taskInput, context) {
        // Step 1: 提取任务特征
        const features = this.analyzer.analyze(taskInput);
        console.log(`[TeamManager] 任务特征提取完成:`);
        console.log(`  domain=${features.domain}, complexity=${features.complexity}`);
        console.log(`  needsResearch=${features.needsResearch}, hasVisualContent=${features.hasVisualContent}`);
        console.log(`  length=${features.length}, qualityTier=${features.qualityTier}`);
        console.log(`  estimatedSteps=${features.estimatedSteps}, confidence=${features.confidence}`);
        // Step 2: 应用用户偏好覆盖
        const adjustedFeatures = this.applyUserPreferences(features, context.userPreferences);
        // Step 3: 匹配规则，获取团队定义
        const workerDefs = this.composer.compose(adjustedFeatures);
        // Step 4: 转换为完整 ITeam
        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const workers = this.composer.defsToWorkers(workerDefs, taskId);
        const matchedRuleId = this.composer.dryRun(adjustedFeatures) ?? "unknown";
        const team = {
            id: `team-${taskId.slice(0, 12)}`,
            taskId,
            workers,
            goal: this.generateGoal(adjustedFeatures, taskInput),
            features: adjustedFeatures,
            matchedRuleId,
            createdAt: new Date(),
        };
        console.log(`[TeamManager] 团队组建完成: "${team.id}" (${workers.length} 个 Worker, ` +
            `规则="${matchedRuleId}")`);
        for (const w of workers) {
            console.log(`  - [${w.required ? "必需" : "可选"}] ${w.role} (${w.agentType})${w.configOverride ? " [自定义配置]" : ""}`);
        }
        return team;
    }
    /**
     * 将团队的 Worker 配置转换为 LoopHarness 所需的工厂函数 Map
     *
     * 注意：此方法返回的是**空的 Map**（只有 key）。
     * 实际的 Factory 函数由调用方在注册 Agent 时提供。
     * 这是因为 TeamManager 不持有 Agent 的具体实现，
     * 工厂函数的实现属于 departments 层或 CLI 层。
     *
     * @param team composeTeam() 返回的团队
     * @returns agentType 字符串 → 空占位（需调用方填充实际 factory）
     */
    createWorkerFactories(team) {
        const factories = new Map();
        for (const worker of team.workers) {
            // 这里只记录 agentType，实际的 factory 由调用方注入
            // 设计理由：TeamManager 是纯编排层，不依赖具体的 Agent 实现
            if (!factories.has(worker.agentType)) {
                // 占位：返回 null 作为标记，调用方需要替换为真实 factory
                factories.set(worker.agentType, null);
            }
        }
        return factories;
    }
    /**
     * 获取内部的分析器（用于自定义规则或调试）
     */
    getAnalyzer() {
        return this.analyzer;
    }
    /**
     * 获取内部的组合器（用于查看规则等）
     */
    getComposer() {
        return this.composer;
    }
    // ============================================================
    // 私有辅助方法
    // ============================================================
    /** 应用用户偏好到特征上 */
    applyUserPreferences(features, prefs) {
        if (!prefs)
            return features;
        const adjusted = { ...features };
        if (prefs.preferFastMode) {
            adjusted.qualityTier = "draft";
            adjusted.complexity = "low";
        }
        if (prefs.preferHighQuality) {
            adjusted.qualityTier = "premium";
        }
        return adjusted;
    }
    /** 生成团队目标描述 */
    generateGoal(features, originalInput) {
        const parts = [`完成任务: "${originalInput.slice(0, 100)}${originalInput.length > 100 ? "..." : ""}"`];
        if (features.needsResearch)
            parts.push("包含调研环节");
        if (features.hasVisualContent)
            parts.push("包含视觉设计");
        if (features.qualityTier === "premium")
            parts.push("高质量产出");
        return parts.join("；");
    }
}
//# sourceMappingURL=team-manager.js.map