// Critic Agent 实现
// 内容审核员，负责多维度质量评估
import { formatCriteriaForEvaluator } from "@aicos/loop-engine";
import { createLLMParser, FallbackStrategy } from "@aicos/loop-engine/utils";
import { z } from "zod";
// ============================================================
// Zod Schema — 用于 LLM 结构化输出验证
// ============================================================
const criticDimensionSchema = z.object({
    score: z.number().min(0).max(20),
    comment: z.string(),
});
const criticOutputSchema = z.object({
    overallScore: z.number().min(0).max(100),
    dimensions: z.record(z.string(), criticDimensionSchema),
    passed: z.boolean().optional(),
    suggestions: z
        .array(z.object({
        type: z.string(),
        severity: z.string(),
        location: z.string().optional(),
        description: z.string(),
        suggestion: z.string(),
    }))
        .optional(),
    reasoning: z.string().optional(),
});
// Zod Schema — 用于 evaluate() 方法的 GradingResult 格式验证
const gradingDimensionScoreSchema = z.object({
    dimensionId: z.string(),
    rawScore: z.number().min(0).max(20),
    comment: z.string(),
});
const gradingSuggestionSchema = z.object({
    dimensionId: z.string().optional(),
    severity: z.string(),
    description: z.string(),
    suggestion: z.string(),
});
const gradingResultSchema = z.object({
    totalScore: z.number().min(0).max(100),
    dimensionScores: z.array(gradingDimensionScoreSchema),
    suggestions: z.array(gradingSuggestionSchema).optional(),
    reasoning: z.string().optional(),
});
export class CriticAgent {
    llmProvider;
    criteria;
    static AGENT_TYPE = "critic";
    // 保留作为默认 fallback（无 GradingCriteria 时使用）
    // 维度名称与 DEFAULT_WRITING_CRITERIA 保持一致
    static FALLBACK_SYSTEM_PROMPT = `你是一个严格但建设性的内容审核员。你从五个维度评估内容质量：

1. 主题准确性 (topicAccuracy/topic_accuracy)：信息是否正确，是否围绕任务主题，是否有事实错误或偏题
2. 技术深度 (technical_depth)：技术分析是否深入，是否触及实现原理，是否有独到洞察
3. 代码质量 (code_quality)：代码语法、命名、类型使用、错误处理是否完善
4. 可读性 (readability)：文章结构、段落过渡、术语解释、Markdown 格式是否规范
5. 原创性 (originality)：是否有独特观点或实践经验，而非复述官方文档

每个维度 0-20 分，总分 0-100。
低于 75 分必须给出具体的修改建议。
即使通过也要给出改进空间。`;
    // 审核通过的阈值
    PASS_THRESHOLD = 75;
    constructor(llmProvider, criteria) {
        this.llmProvider = llmProvider;
        this.criteria = criteria;
    }
    // ★ ADR-005: 支持部门专属评估维度覆盖
    /** 部门自定义评估维度（优先于默认 GradingCriteria） */
    customDimensions = null;
    /**
     * 设置部门专属评估维度
     * 覆盖默认的 GradingCriteria 维度定义
     */
    setCustomDimensions(dimensions) {
        this.customDimensions = dimensions;
        console.log(`[CriticAgent] 已设置 ${dimensions.length} 个部门专属评估维度: ` +
            dimensions.map((d) => d.name).join(", "));
    }
    /** 动态构建 system prompt：使用 GradingCriteria 构造评估标准 */
    buildSystemPrompt() {
        // ★ ADR-005: 如果有部门专属维度，使用部门维度构建 Prompt
        if (this.customDimensions && this.customDimensions.length > 0) {
            const dims = this.customDimensions;
            const totalMax = dims.reduce((sum, d) => sum + d.maxScore, 0);
            let prompt = `你是一个严格但建设性的内容审核员。请从以下 ${dims.length} 个维度评估内容质量：\n\n`;
            for (const dim of dims) {
                prompt += `${Math.round((dim.maxScore / totalMax) * 100)}%. **${dim.name}** (${dim.id}): ${dim.description}\n`;
                prompt += `   评分标准（0-${dim.maxScore}分）:\n${dim.scoringGuide}\n\n`;
            }
            prompt += `总分 0-${totalMax} 分。低于 ${this.PASS_THRESHOLD} 分必须给出具体的修改建议。即使通过也要给出改进空间。`;
            return prompt;
        }
        return formatCriteriaForEvaluator(this.criteria);
    }
    // 实现 AgentExecutor 接口
    async execute(params) {
        // #2.4 类型安全：context 现在是 StandardAgentContext
        // 查找 Writer 的产出：优先匹配 writer-* key，否则取第一个非空的输出
        const writerOutput = params.previousOutputs[params.step.stepId] ??
            Object.values(params.previousOutputs).find((o) => o && typeof o.content === "string" && o.content.length > 0);
        if (!writerOutput) {
            throw new Error(`未找到 Writer 的产出。可用的 keys: [${Object.keys(params.previousOutputs).join(", ")}], 当前 stepId: ${params.step.stepId}`);
        }
        const input = {
            taskId: params.context.taskId,
            writerOutput: { content: writerOutput.content },
            originalTask: params.context.taskInput ?? "",
            planStep: params.step,
            context: {
                interrogationResults: params.context.interrogationResults ?? {},
                designMDX: params.context.designMDX,
                userPreferences: params.context.userPreferences,
            },
        };
        return this.review(input);
    }
    // ============================================================
    // 实现 IEvaluatorAgent 接口
    // ============================================================
    /** 当前评估轮次（从 1 开始） */
    currentRound = 1;
    /**
     * 评估 Writer 产出，返回 GradingResult 格式的结构化评分。
     *
     * 实现流程：
     * a. 从 output 中提取内容
     * b. 使用 formatCriteriaForEvaluator(criteria) 构建 system prompt
     * c. 构造包含 originalTask + content 的 user prompt
     * d. 调用 LLM 获取评分
     * e. 解析响应并转换为 GradingResult 格式
     * f. 使用 criteria.dimensions 的权重计算 weightedScore
     * g. 判断 passed/excellent
     */
    async evaluate(output, criteria, originalTask) {
        // a. 提取内容
        const content = output.content ?? output;
        if (!content || (typeof content === "string" && content.trim().length === 0)) {
            throw new Error("Writer 产出内容为空");
        }
        // b. 使用传入的 criteria 构建 system prompt（覆盖实例默认值）
        const systemPrompt = formatCriteriaForEvaluator(criteria);
        // c. 构造 user prompt
        const userPrompt = this.buildEvaluatePrompt(originalTask, content);
        // d. 调用 LLM
        const response = await this.llmProvider.chat([
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ]);
        // e. 解析并转换为 GradingResult
        return this.parseGradingResponse(response, criteria);
    }
    /**
     * 构造 evaluate 方法的 user prompt
     */
    buildEvaluatePrompt(originalTask, content) {
        let prompt = `## 原始任务\n${originalTask}\n\n`;
        prompt += `## 待评估内容\n\`\`\`markdown\n${content}\n\`\`\`\n\n`;
        prompt +=
            '请对以上内容进行严格的多维度评估，返回 JSON 格式的结果，' +
                '包含 totalScore、dimensionScores（数组，每项包含 dimensionId、rawScore、comment）、' +
                'suggestions（数组，每项包含 dimensionId、severity、description、suggestion）、reasoning 字段。';
        return prompt;
    }
    /**
     * 将 LLM 响应解析并转换为 GradingResult 格式
     *
     * 核心逻辑：
     * - 维度映射：将 LLM 返回的维度名匹配到 criteria 定义的 dimension ID
     * - 模糊匹配：如果 ID 不精确匹配，做大小写/下划线/驼峰的模糊匹配
     * - 权重计算：使用 criteria.dimensions 的 weight 计算 weightedScore
     */
    parseGradingResponse(response, criteria) {
        const zeroFallback = this.getZeroGradingResult("schema 解析回退", criteria);
        try {
            const parser = createLLMParser({
                schema: gradingResultSchema,
                fallback: zeroFallback,
                strategy: FallbackStrategy.RETURN_FALLBACK,
                logPrefix: "CriticAgent.evaluate",
            });
            const result = parser.parse(response);
            if (result.success && result.data) {
                const d = result.data;
                return this.mapToGradingResult(d, criteria);
            }
            // Schema 解析失败 → 回退到正则提取
            console.warn("[CriticAgent.evaluate] Schema 解析失败，尝试正则回退:", result.error);
            return this.fallbackParseGrading(response, criteria);
        }
        catch (error) {
            console.error("[CriticAgent.evaluate] 解析评估响应失败:", error);
            return this.getZeroGradingResult(error instanceof Error ? error.message : String(error), criteria);
        }
    }
    /**
     * 将 LLM 返回的原始数据映射为 GradingResult
     */
    mapToGradingResult(raw, criteria) {
        const dimMap = this.buildDimensionMapping(criteria);
        const maxScorePerDim = criteria.dimensions[0]?.maxScore ?? 20;
        // 映射维度分数
        const dimensionScores = criteria.dimensions.map((dim) => {
            const matchedKey = this.matchDimensionKey(raw.dimensionScores ?? {}, dim.id, dim.name);
            const rawDim = raw.dimensionScores?.[matchedKey] ?? { rawScore: 0, comment: "未匹配到该维度" };
            const rawScore = Math.min(Math.max(rawDim.rawScore ?? 0, 0), maxScorePerDim);
            const weightedScore = (rawScore / maxScorePerDim) * dim.weight * 100;
            return {
                dimensionId: dim.id,
                dimensionName: dim.name,
                rawScore,
                maxScore: maxScorePerDim,
                weightedScore: Math.round(weightedScore * 100) / 100,
                comment: rawDim.comment ?? "",
            };
        });
        // 计算加权总分
        const totalWeightedScore = dimensionScores.reduce((sum, ds) => sum + ds.weightedScore, 0);
        const totalScore = Math.round(totalWeightedScore);
        // 映射 suggestions
        const suggestions = (raw.suggestions ?? []).map((s) => ({
            dimensionId: s.dimensionId ?? "general",
            severity: (s.severity ?? "major"),
            description: s.description ?? "",
            suggestion: s.suggestion ?? "",
        }));
        return {
            totalScore,
            weightedScore: Math.round(totalWeightedScore * 100) / 100,
            passed: totalScore >= criteria.passThreshold,
            excellent: totalScore >= criteria.excellenceThreshold,
            dimensionScores,
            suggestions,
            reasoning: raw.reasoning ?? "LLM 评估完成",
            round: this.currentRound,
        };
    }
    /**
     * 构建维度名 → dimensionId 的映射表（用于模糊匹配）
     */
    buildDimensionMapping(criteria) {
        const map = new Map();
        for (const dim of criteria.dimensions) {
            // 注册多种可能的 key 形式
            map.set(dim.id.toLowerCase(), dim.id); // topic_accuracy -> topic_accuracy
            map.set(dim.id.replace(/_/g, "").toLowerCase(), dim.id); // topicaccuracy -> topic_accuracy
            map.set(dim.name.toLowerCase(), dim.id); // topic accuracy -> topic_accuracy
            map.set(dim.name.replace(/\s+/g, "").toLowerCase(), dim.id); // topicaccuracy -> topic_accuracy
        }
        return map;
    }
    /**
     * 模糊匹配 LLM 返回的维度 key 到 criteria 定义的 dimensionId
     */
    matchDimensionKey(llmDimensions, targetId, targetName) {
        // 1. 精确匹配 ID
        if (targetId in llmDimensions)
            return targetId;
        // 2. 遍历所有 key 做模糊匹配
        for (const key of Object.keys(llmDimensions)) {
            const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, "");
            const normalizedTarget = targetId.toLowerCase().replace(/_/g, "");
            if (normalizedKey === normalizedTarget || normalizedKey.includes(normalizedTarget)) {
                return key;
            }
        }
        // 3. 尝试用 name 匹配
        const normalizedName = targetName.toLowerCase().replace(/\s+/g, "");
        for (const key of Object.keys(llmDimensions)) {
            const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, "");
            if (normalizedKey === normalizedName || normalizedKey.includes(normalizedName)) {
                return key;
            }
        }
        // 4. 未找到匹配，返回第一个 key 或目标 id 本身
        return Object.keys(llmDimensions)[0] ?? targetId;
    }
    /** 正则回退：当 Zod schema 不匹配时 */
    fallbackParseGrading(response, criteria) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch)
                throw new Error("未找到 JSON");
            const parsed = JSON.parse(jsonMatch[0]);
            return this.mapToGradingResult(parsed, criteria);
        }
        catch {
            return this.getZeroGradingResult("正则回退也失败", criteria);
        }
    }
    /** 安全的全零分数 GradingResult */
    getZeroGradingResult(reason, criteria) {
        const maxScore = criteria.dimensions[0]?.maxScore ?? 20;
        return {
            totalScore: 0,
            weightedScore: 0,
            passed: false,
            excellent: false,
            dimensionScores: criteria.dimensions.map((dim) => ({
                dimensionId: dim.id,
                dimensionName: dim.name,
                rawScore: 0,
                maxScore,
                weightedScore: 0,
                comment: reason,
            })),
            suggestions: [
                {
                    dimensionId: "general",
                    severity: "critical",
                    description: `评估系统错误: ${reason}`,
                    suggestion: "请重新执行评估",
                },
            ],
            reasoning: `评估响应解析失败: ${reason}`,
            round: this.currentRound,
        };
    }
    // 内部：审核流程
    async review(input) {
        // 步骤1：读取 Writer 产出的内容
        const content = "content" in input.writerOutput
            ? input.writerOutput.content
            : "";
        if (!content) {
            throw new Error("Writer 产出内容为空");
        }
        // 步骤2：构造审核 prompt
        const prompt = this.buildReviewPrompt(input, content);
        // 步骤3：调用 LLM 进行五维评分
        const response = await this.llmProvider.chat([
            { role: "system", content: this.buildSystemPrompt() },
            { role: "user", content: prompt },
        ]);
        // 步骤4：解析返回的结构化审核结果
        return this.parseReviewResponse(response);
    }
    // 构造审核提示词
    buildReviewPrompt(input, content) {
        let prompt = `## 原始任务\n${input.originalTask}\n\n`;
        prompt += `## 计划步骤\n`;
        prompt += `- 描述: ${input.planStep.description}\n`;
        prompt += `- 预期输出: ${input.planStep.expectedOutput}\n\n`;
        // 添加拷问要求
        if (input.context.interrogationResults &&
            Object.keys(input.context.interrogationResults).length > 0) {
            prompt += `## 用户需求与偏好（来自拷问）\n`;
            for (const [key, value] of Object.entries(input.context.interrogationResults)) {
                prompt += `- ${key}: ${value}\n`;
            }
            prompt += "\n";
        }
        // 添加 design.mdx 参考
        if (input.context.designMDX) {
            prompt += `## 设计参考 (design.mdx)\n\`\`\`mdx\n${input.context.designMDX}\n\`\`\`\n\n`;
        }
        // 添加用户偏好
        if (input.context.userPreferences &&
            Object.keys(input.context.userPreferences).length > 0) {
            prompt += `## 用户偏好 (user.md)\n`;
            for (const [key, value] of Object.entries(input.context.userPreferences)) {
                prompt += `- ${key}: ${value}\n`;
            }
            prompt += "\n";
        }
        prompt += `## 待审核内容\n\`\`\`markdown\n${content}\n\`\`\`\n\n`;
        prompt +=
            '请对以上内容进行五维评估，返回 JSON 格式的结果，包含 overallScore、dimensions（每个维度包含 score 和 comment）、passed、suggestions（数组）、reasoning 字段。';
        return prompt;
    }
    // 解析 LLM 返回的审核结果 — 使用 Zod schema 验证 + 正则回退
    parseReviewResponse(response) {
        const zeroFallback = this.getZeroScoreResponse("schema 解析回退");
        try {
            // 注意：subagents 使用 zod v3，loop-engine 使用 zod v4，此处用 as any 绕过类型不兼容
            // 运行时 Zod schema 对象结构一致，.safeParse() 方法签名相同，功能正常
            const parser = createLLMParser({
                schema: criticOutputSchema,
                fallback: zeroFallback,
                strategy: FallbackStrategy.RETURN_FALLBACK,
                logPrefix: "CriticAgent",
            });
            const result = parser.parse(response);
            if (result.success && result.data) {
                const d = result.data;
                return {
                    overallScore: d.overallScore ?? 0,
                    dimensions: (d.dimensions ?? {}),
                    passed: d.passed ?? (d.overallScore ?? 0) >= this.PASS_THRESHOLD,
                    suggestions: (d.suggestions ?? []).map((s) => ({
                        type: (s.type ?? "content"),
                        severity: (s.severity ?? "major"),
                        location: s.location,
                        description: s.description ?? "",
                        suggestion: s.suggestion ?? "",
                    })),
                    reasoning: d.reasoning ?? "LLM 审核完成",
                };
            }
            // Schema 解析失败 → 回退到正则提取
            console.warn("[CriticAgent] Schema 解析失败，尝试正则回退:", result.error);
            return this.fallbackParseReview(response);
        }
        catch (error) {
            console.error("解析审核响应失败:", error);
            return this.getZeroScoreResponse(error instanceof Error ? error.message : String(error));
        }
    }
    /** 正则回退：当 Zod schema 不匹配时 */
    fallbackParseReview(response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch)
                throw new Error("未找到 JSON");
            const parsed = JSON.parse(jsonMatch[0]);
            const overallScore = parsed.overallScore ?? 0;
            return {
                overallScore,
                dimensions: parsed.dimensions ?? {
                    topicAccuracy: { score: 0, comment: "无法解析" },
                    technicalDepth: { score: 0, comment: "无法解析" },
                    codeQuality: { score: 0, comment: "无法解析" },
                    readability: { score: 0, comment: "无法解析" },
                    originality: { score: 0, comment: "不适用" },
                },
                passed: overallScore >= this.PASS_THRESHOLD,
                suggestions: parsed.suggestions?.map((s) => ({
                    type: s.type ?? "content",
                    severity: s.severity ?? "major",
                    location: s.location,
                    description: s.description ?? "未提供描述",
                    suggestion: s.suggestion ?? "未提供建议",
                })) ?? [],
                reasoning: parsed.reasoning ?? "通过正则回退解析",
            };
        }
        catch {
            return this.getZeroScoreResponse("正则回退也失败");
        }
    }
    /** 安全的全零分数响应 */
    getZeroScoreResponse(reason) {
        return {
            overallScore: 0,
            dimensions: {
                topicAccuracy: { score: 0, comment: reason },
                technicalDepth: { score: 0, comment: reason },
                codeQuality: { score: 0, comment: reason },
                readability: { score: 0, comment: reason },
                originality: { score: 0, comment: "不适用" },
            },
            passed: false,
            suggestions: [
                {
                    type: "content",
                    severity: "critical",
                    description: `审核系统错误: ${reason}`,
                    suggestion: "请重新执行审核",
                },
            ],
            reasoning: `审核响应解析失败: ${reason}`,
        };
    }
}
//# sourceMappingURL=agent.js.map