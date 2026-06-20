import { EvolutionMode } from "./types.js";
export class EvolutionAgent {
    static AGENT_NAME = "evolution";
    static SYSTEM_PROMPT = `你是一个自我反思与模式学习引擎。你的任务是：
1. 回顾完整的执行证据链（Evidence Chain）
2. 识别重复出现的模式和偏好
3. 检测异常信号
4. 生成对系统进化文档的增量更新建议

你关注以下维度的进化：
- design.mdx: 视觉 DNA / Design System 更新
- user.md: 用户偏好画像更新
- self.md: 系统自我认知 / 经验积累`;
    patternExtractor;
    diffGenerator;
    autoMerger;
    anomalyDetector;
    llmProvider;
    constructor(deps) {
        this.patternExtractor = deps.patternExtractor;
        this.diffGenerator = deps.diffGenerator;
        this.autoMerger = deps.autoMerger;
        this.anomalyDetector = deps.anomalyDetector;
        this.llmProvider = deps.llmProvider;
    }
    // 执行进化（主入口）
    async run(params) {
        const startTime = Date.now();
        const { evidenceChain, evolutionDocs, taskId, taskSuccess, taskMetrics, criticSummary, guardSummary } = params;
        // 1. 记录指标并检测异常信号
        this.anomalyDetector.recordMetrics(taskId, taskMetrics);
        const signalsDetected = this.anomalyDetector.detect(taskId);
        // 2. 如果任务执行时间已经较长（>120s），启用轻量级模式跳过 LLM 深度分析
        if (taskMetrics.executionDuration > 120_000) {
            this.patternExtractor.setLightweightMode(true);
        }
        // 3. 决定进化模式
        const mode = this.decideMode(taskMetrics, signalsDetected);
        // 4. 执行对应模式的进化流程
        const evolveParams = {
            evidenceChain,
            evolutionDocs,
            taskId,
            taskSuccess,
        };
        const result = mode === EvolutionMode.DEEP
            ? await this.deepEvolve(evolveParams, criticSummary, guardSummary)
            : await this.regularEvolve(evolveParams, criticSummary, guardSummary);
        result.durationMs = Date.now() - startTime;
        result.signalsDetected = signalsDetected;
        result.mode = mode;
        return result;
    }
    // 常规进化流程
    async regularEvolve(params, criticSummary, guardSummary) {
        const { evidenceChain, evolutionDocs, taskId, taskSuccess } = params;
        // 提取模式
        const patterns = await this.patternExtractor.extractPatterns(evidenceChain);
        // 获取当前文档
        const [currentDesign, currentUser, currentSelf] = await Promise.all([
            evolutionDocs.getDesignMDX(),
            evolutionDocs.getUserMD(),
            evolutionDocs.getSelfMD(),
        ]);
        // 生成差异
        const safePatterns = {
            preferences: patterns.preferences ?? { newPreferences: [], topicTendencies: [], stylePreferences: [] },
            toolUsage: patterns.toolUsage ?? { usageEfficiencyTips: [], failedTools: [], frequentlyUsedTools: [] },
            uxDecisions: patterns.uxDecisions ?? { layoutPreferences: [], colorDecisions: [], typographyDecisions: [] },
            successPatterns: patterns.successPatterns ?? [],
            failurePatterns: patterns.failurePatterns ?? [],
        };
        const designDiffs = currentDesign ? this.diffGenerator.generateDesignDiff(currentDesign, safePatterns.uxDecisions) : [];
        const userDiffs = currentUser ? this.diffGenerator.generateUserDiff(currentUser, safePatterns.preferences) : [];
        const selfDiff = this.diffGenerator.generateSelfDiff(currentSelf ?? { experiences: [], totalTasksCompleted: 0, totalSuccessRate: 0, capabilities: [], limitations: [], lastUpdated: "", knownCapabilities: [], knownLimitations: [] }, safePatterns, taskSuccess, this.inferTaskType(evidenceChain), criticSummary, guardSummary);
        // 合并低风险变更
        const mergeResult = await this.autoMerger.mergeAll({ designDiffs, userDiffs, selfDiff });
        return {
            mode: EvolutionMode.REGULAR,
            designUpdates: mergeResult.designBlocksUpdated > 0 ? designDiffs.map((d) => ({ blockType: d.blockType, diff: d.reason })) : [],
            userUpdates: mergeResult.userFieldsUpdated > 0 ? userDiffs.map((d) => ({ key: d.key, oldValue: d.currentValue, newValue: d.suggestedValue })) : [],
            selfExperience: {
                taskType: selfDiff.taskType,
                pattern: selfDiff.pattern,
                lesson: selfDiff.lesson,
                capabilityDelta: selfDiff.capabilityDelta,
            },
            durationMs: 0, // 由 run() 填充
            signalsDetected: [], // 由 run() 填充
        };
    }
    // 深度进化流程（更全面的分析）
    async deepEvolve(params, criticSummary, guardSummary) {
        // 深度进化与常规进化的区别：
        // - 进行更全面的 LLM 分析
        // - 降低合并阈值以允许更多变更
        // - 生成更详细的经验记录
        // 先执行常规流程作为基础
        const baseResult = await this.regularEvolve(params, criticSummary, guardSummary);
        // 深度分析：使用 LLM 对整个证据链进行综合反思
        const deepLesson = await this.deepReflect(params.evidenceChain, params.taskSuccess);
        if (deepLesson) {
            baseResult.selfExperience.lesson += `\n[深度分析] ${deepLesson}`;
        }
        return baseResult;
    }
    // 决定进化模式
    decideMode(metrics, signals) {
        // 信号触发 → DEEP
        if (signals.some((s) => s.triggered))
            return EvolutionMode.DEEP;
        // Metrics 异常也触发深度进化
        if (metrics.replanCount >= 2)
            return EvolutionMode.DEEP;
        if (metrics.executionDuration > 180_000)
            return EvolutionMode.DEEP; // 3分钟
        if (!metrics.consensusPassed)
            return EvolutionMode.DEEP;
        if ((metrics.userModifications ?? 0) > 0)
            return EvolutionMode.DEEP;
        return EvolutionMode.REGULAR;
    }
    // 推断任务类型
    inferTaskType(evidenceChain) {
        const decisions = evidenceChain.getEntriesByType("decision");
        if (decisions.length === 0)
            return "unknown";
        // 从决策中推断主要任务类型
        const agentTypes = new Set(decisions.map((d) => d.agentType));
        if (agentTypes.has("ui-ux"))
            return "ui-ux-design";
        if (agentTypes.has("writer"))
            return "content-creation";
        if (agentTypes.has("critic"))
            return "review";
        return "general";
    }
    // 深度反思（仅深度进化时调用）
    async deepReflect(evidenceChain, taskSuccess) {
        const allEntries = evidenceChain.getEntries();
        if (allEntries.length === 0)
            return null;
        const summary = allEntries
            .map((e) => `[${e.type}] ${JSON.stringify(e).slice(0, 200)}`)
            .join("\n");
        const response = await this.llmProvider.chat([
            {
                role: "system",
                content: `基于以下完整的任务执行证据链，进行深度反思。任务${taskSuccess ? "成功" : "失败"}。\n` +
                    `请用一句话总结最值得记住的经验教训。只输出这句话，不要其他内容。`,
            },
            { role: "user", content: summary.slice(0, 4000) }, // 截断防止过长
        ]);
        return response.trim() || null;
    }
}
//# sourceMappingURL=agent.js.map