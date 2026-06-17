// 单次 LLM 调用超时时间（ms）
const LLM_CALL_TIMEOUT_MS = 30_000;
// 默认最大 LLM 调用次数
const DEFAULT_MAX_LLM_CALLS = 3;
// 执行时间阈值（ms），超过后启用轻量级模式
const LIGHTWEIGHT_MODE_THRESHOLD_MS = 120_000;
// 批量分析 Prompt：将三类分析合并为一次 LLM 调用
const BATCH_ANALYSIS_PROMPT = `你是一个进化模式分析引擎。请根据以下三类数据分别提取模式，以 JSON 格式返回一个包含三个顶级键的对象：

{
  "preferences": { "writingStyleChanges": {...}, "topicTendencies": [...], "newPreferences": [...] },
  "toolUsage": { "frequentTools": [...], "failedTools": [...], "usageEfficiencyTips": [...] },
  "uxDecisions": { "colorChanges": {...}, "typographyChanges": {...}, "layoutPreferences": [...] }
}

如果某类数据为空或无法分析，对应键设为空对象 {} 或空数组 []。
只返回 JSON，不要其他文字。`;
export class PatternExtractor {
    llmProvider;
    llmCallCount = 0;
    maxLLMCalls;
    lightweightMode;
    constructor(llmProvider, config = {}) {
        this.llmProvider = llmProvider;
        this.maxLLMCalls = config.maxLLMCalls ?? DEFAULT_MAX_LLM_CALLS;
        this.lightweightMode = config.lightweightMode ?? false;
    }
    /** 设置轻量级模式（跳过 LLM 分析，仅使用规则引擎） */
    setLightweightMode(enabled) {
        this.lightweightMode = enabled;
    }
    // 从 Evidence Chain 中提取模式
    async extractPatterns(evidenceChain) {
        // 获取各类记录
        const decisions = evidenceChain.getEntriesByType("decision");
        const toolCalls = evidenceChain.getEntriesByType("tool_call");
        const allEntries = evidenceChain.getEntries();
        // 轻量级模式或 LLM 调用额度已用尽 → 使用规则引擎 fallback（零 LLM 调用）
        if (this.lightweightMode || this.llmCallCount >= this.maxLLMCalls) {
            return this.ruleBasedExtract(decisions, toolCalls, allEntries);
        }
        // 批量分析模式：将三类数据合并为一次 LLM 调用
        return await this.batchAnalyze(decisions, toolCalls, allEntries);
    }
    // 批量分析：一次 LLM 调用分析所有类别
    async batchAnalyze(decisions, toolCalls, allEntries) {
        this.llmCallCount++;
        // 构建批量输入
        const decisionsSummary = decisions.length > 0
            ? `## 决策记录\n${decisions.map((d) => `[${d.agentType}] ${d.decisionPoint} → ${d.finalChoice}${d.confidence ? ` (置信度:${d.confidence})` : ""}`).join("\n")}`
            : "## 决策记录\n（无）";
        const callsSummary = toolCalls.length > 0
            ? `## 工具调用记录\n${toolCalls.map((t) => `${t.toolName}[${t.toolCategory}] ${t.success ? "✓" : "✗"}${t.errorMessage ? ` 错误:${t.errorMessage}` : ""} ${t.durationMs}ms`).join("\n")}`
            : "## 工具调用记录\n（无）";
        const uxEntries = allEntries.filter((e) => e.type === "decision" && e.agentType === "ui-ux");
        const uxSummary = uxEntries.length > 0
            ? `## UI/UX 设计决策\n${uxEntries.map((e) => { const d = e; return `${d.decisionPoint}: ${d.finalChoice}${d.outputReasoning ? `\n理由: ${d.outputReasoning}` : ""}`; }).join("\n\n")}`
            : "## UI/UX 设计决策\n（无）";
        const userContent = `${decisionsSummary}\n\n${callsSummary}\n\n${uxSummary}`;
        let response;
        try {
            response = await this.callWithTimeout([
                { role: "system", content: BATCH_ANALYSIS_PROMPT },
                { role: "user", content: userContent },
            ]);
        }
        catch {
            // 超时或异常时降级到规则引擎
            return this.ruleBasedExtract(decisions, toolCalls, allEntries);
        }
        let preferences = {};
        let toolUsage = { frequentTools: [], failedTools: [], usageEfficiencyTips: [] };
        let uxDecisions = {};
        try {
            const parsed = JSON.parse(response);
            if (parsed.preferences && typeof parsed.preferences === "object") {
                preferences = parsed.preferences;
            }
            if (parsed.toolUsage && typeof parsed.toolUsage === "object") {
                toolUsage = parsed.toolUsage;
            }
            if (parsed.uxDecisions && typeof parsed.uxDecisions === "object") {
                uxDecisions = parsed.uxDecisions;
            }
        }
        catch {
            // JSON 解析失败，降级到规则引擎
            return this.ruleBasedExtract(decisions, toolCalls, allEntries);
        }
        // 综合成功/失败模式（始终使用规则引擎，无需 LLM）
        const successPatterns = this.extractSuccessPatterns(allEntries);
        const failurePatterns = this.extractFailurePatterns(allEntries);
        return { preferences, toolUsage, uxDecisions, successPatterns, failurePatterns };
    }
    // 规则引擎 fallback：基于关键词匹配和统计提取模式（零 LLM 调用）
    ruleBasedExtract(decisions, toolCalls, allEntries) {
        return {
            preferences: this.fallbackPreferenceAnalysis(decisions),
            toolUsage: this.fallbackToolAnalysis(toolCalls),
            uxDecisions: this.fallbackUXAnalysis(allEntries),
            successPatterns: this.extractSuccessPatterns(allEntries),
            failurePatterns: this.extractFailurePatterns(allEntries),
        };
    }
    // 偏好分析的规则引擎兜底方案
    fallbackPreferenceAnalysis(decisions) {
        if (decisions.length === 0)
            return {};
        const newPreferences = [];
        const topicKeywords = new Map();
        for (const d of decisions) {
            // 从 decisionPoint 和 finalChoice 中提取关键词
            const text = `${d.decisionPoint} ${d.finalChoice}`.toLowerCase();
            const topicMatch = text.match(/(design|ui|content|style|color|layout|typography|writing|tone)/g);
            if (topicMatch) {
                for (const t of topicMatch) {
                    topicKeywords.set(t, (topicKeywords.get(t) ?? 0) + 1);
                }
            }
        }
        // 将高频主题作为偏好
        for (const [topic, count] of topicKeywords) {
            if (count >= 2) {
                newPreferences.push({ key: `topic_${topic}`, value: topic, confidence: Math.min(count / decisions.length, 1) });
            }
        }
        return newPreferences.length > 0 ? { newPreferences } : {};
    }
    // UX 分析的规则引擎兜底方案
    fallbackUXAnalysis(entries) {
        const uxEntries = entries.filter((e) => e.type === "decision" && e.agentType === "ui-ux");
        if (uxEntries.length === 0)
            return {};
        const layoutPreferences = [];
        const colorKeywords = new Set();
        for (const e of uxEntries) {
            const d = e;
            const text = `${d.decisionPoint} ${d.finalChoice}`.toLowerCase();
            // 提取布局偏好关键词
            if (/grid|flex|column|row|center|responsive/.test(text)) {
                layoutPreferences.push(d.finalChoice);
            }
            // 提取颜色相关关键词
            const colorMatch = text.match(/#[0-9a-f]{3,8}|rgb[a]?\(|(red|blue|green|yellow|black|white|gray|dark|light)/gi);
            if (colorMatch) {
                colorMatch.forEach((c) => colorKeywords.add(c));
            }
        }
        const result = {};
        if (layoutPreferences.length > 0)
            result.layoutPreferences = layoutPreferences;
        if (colorKeywords.size > 0)
            result.colorChanges = { palette: Object.fromEntries(Array.from(colorKeywords).map((c) => [c, "detected"])), reasoning: "从决策记录中提取" };
        return result;
    }
    // 带 30s 超时保护的 LLM 调用
    async callWithTimeout(messages) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), LLM_CALL_TIMEOUT_MS);
        try {
            // 使用 Promise.race 实现超时
            const llmPromise = this.llmProvider.chat(messages);
            // 注意：如果 llmProvider.chat 不支持 AbortSignal，我们仍通过 race 实现超时
            const result = await Promise.race([
                llmPromise,
                new Promise((_, reject) => {
                    controller.signal.addEventListener("abort", () => reject(new Error(`LLM 调用超时 (${LLM_CALL_TIMEOUT_MS}ms)`)));
                }),
            ]);
            return result;
        }
        finally {
            clearTimeout(timer);
        }
    }
    // 提取成功模式（基于证据链中的正向指标）
    extractSuccessPatterns(entries) {
        const patterns = [];
        // 从成功的工具调用中提取模式
        const successfulCalls = entries.filter((e) => e.type === "tool_call" && e.success);
        if (successfulCalls.length > 0) {
            patterns.push(`工具调用成功率: ${successfulCalls.length}/${entries.filter((e) => e.type === "tool_call").length}`);
        }
        // 从高置信度决策提取
        const highConfidenceDecisions = entries.filter((e) => e.type === "decision" && (e.confidence ?? 0) > 0.85);
        if (highConfidenceDecisions.length > 0) {
            patterns.push(`高置信度决策占比: ${highConfidenceDecisions.length}/${entries.filter((e) => e.type === "decision").length}`);
        }
        return patterns;
    }
    // 提取失败模式（基于证据链中的负向指标）
    extractFailurePatterns(entries) {
        const patterns = [];
        // 失败的工具调用
        const failedCalls = entries.filter((e) => e.type === "tool_call" && !e.success);
        for (const fc of failedCalls) {
            const tc = fc;
            patterns.push(`工具 ${tc.toolName} 失败: ${tc.errorMessage || "未知错误"}`);
        }
        // 低置信度决策
        const lowConfidenceDecisions = entries.filter((e) => e.type === "decision" && (e.confidence ?? 1) < 0.5);
        if (lowConfidenceDecisions.length > 0) {
            patterns.push(`${lowConfidenceDecisions.length} 个低置信度决策需要关注`);
        }
        return patterns;
    }
    // 工具分析的统计兜底方案
    fallbackToolAnalysis(toolCalls) {
        const toolStats = new Map();
        for (const tc of toolCalls) {
            const existing = toolStats.get(tc.toolName) || { count: 0, totalDuration: 0, fails: 0, errors: new Set() };
            existing.count++;
            existing.totalDuration += tc.durationMs;
            if (!tc.success) {
                existing.fails++;
                if (tc.errorMessage)
                    existing.errors.add(tc.errorMessage);
            }
            toolStats.set(tc.toolName, existing);
        }
        const frequentTools = Array.from(toolStats.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5)
            .map(([name, stats]) => ({
            toolName: name,
            callCount: stats.count,
            avgDuration: Math.round(stats.totalDuration / stats.count),
        }));
        const failedTools = Array.from(toolStats.entries())
            .filter(([, s]) => s.fails > 0)
            .map(([name, stats]) => ({
            toolName: name,
            failCount: stats.fails,
            commonErrors: Array.from(stats.errors),
        }));
        return { frequentTools, failedTools, usageEfficiencyTips: [] };
    }
}
//# sourceMappingURL=pattern-extractor.js.map