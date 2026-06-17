// UI-UX-Pro-Max Agent 模式实现
// Consensus Lock 深度审核时作为独立 Agent 参与 UI/UX 质量投票
// Agent 系统提示词
const AGENT_SYSTEM_PROMPT = `你是一个严格但建设性的 UI/UX 审核员。
你从以下维度审核内容产出的视觉质量：
1. 色彩和谐度 (colorHarmony) - 0-20分
2. 排版质量 (typography) - 0-20分
3. 布局合理性 (layout) - 0-20分
4. 视觉层次 (visualHierarchy) - 0-20分
5. 可访问性 (accessibility) - 0-20分

每个维度评分标准：
- 16-20分：优秀，符合最佳实践
- 11-15分：良好，有小改进空间
- 6-10分：一般，有明显问题需修复
- 0-5分：不合格，必须重新设计

总分 0-100 分。低于阈值（默认75分）为不通过，必须给出具体修改建议。

输出要求：
- 必须返回合法的 JSON 格式
- 每个维度必须有 score 和 comment
- suggestions 数组中每项包含 type、priority、description、suggestion
- reasoning 字段说明整体评价和主要问题`;
export class UIUXProMaxAgent {
    // Agent 名称
    static AGENT_NAME = "ui-ux-pro-max";
    static SYSTEM_PROMPT = AGENT_SYSTEM_PROMPT;
    llm;
    constructor(llm) {
        this.llm = llm;
    }
    // 执行审核
    async review(input, threshold = 75) {
        return this.performReview(input, threshold);
    }
    // 内部：LLM 审核
    async performReview(input, threshold) {
        const prompt = this.buildReviewPrompt(input, threshold);
        const response = await this.llm.chat([
            { role: "system", content: AGENT_SYSTEM_PROMPT },
            { role: "user", content: prompt },
        ]);
        return this.parseReviewResponse(response, threshold);
    }
    // 构建审核提示词
    buildReviewPrompt(input, threshold) {
        let prompt = `任务类型：${input.taskType}\n`;
        prompt += `产物路径：${input.artifactPath}\n\n`;
        if (input.designMDX) {
            prompt += `参考设计规范（design.mdx）：\n\`\`\`mdx\n${input.designMDX}\n\`\`\`\n\n`;
        }
        prompt += `待审核的产物内容：\n\`\`\`\n${input.artifactContent}\n\`\`\`\n\n`;
        prompt += `审核阈值：${threshold}分\n\n`;
        prompt +=
            '请进行五维评分审核，返回包含 score、dimensions、passed、suggestions、reasoning 的 JSON。';
        return prompt;
    }
    // 解析审核响应
    parseReviewResponse(response, threshold) {
        try {
            // 尝试提取 JSON（处理可能的 markdown 包裹）
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error("响应中未找到有效 JSON");
            }
            const parsed = JSON.parse(jsonMatch[0]);
            // 验证并补全必要字段
            const score = parsed.score ?? 60;
            const dimensions = parsed.dimensions ?? this.getDefaultDimensions();
            const suggestions = parsed.suggestions ?? [];
            return {
                score,
                dimensions,
                passed: score >= threshold,
                suggestions,
                reasoning: parsed.reasoning ??
                    (score >= threshold ? "基本符合要求，有少量改进空间" : "未达到质量标准，需要修改"),
            };
        }
        catch (error) {
            console.error("解析 UI/UX 审核响应失败:", error);
            // 返回安全的默认值（不通过）
            return {
                score: 50,
                dimensions: this.getDefaultDimensions(),
                passed: false,
                suggestions: [
                    {
                        type: "general",
                        priority: "high",
                        description: "无法解析审核结果",
                        suggestion: "请手动检查产物质量或重试审核",
                    },
                ],
                reasoning: "LLM 响应解析失败，默认判定为不通过。",
            };
        }
    }
    // 默认维度评分
    getDefaultDimensions() {
        return {
            colorHarmony: { score: 10, comment: "无法评估色彩和谐度" },
            typography: { score: 10, comment: "无法评估排版质量" },
            layout: { score: 10, comment: "无法评估布局合理性" },
            visualHierarchy: { score: 10, comment: "无法评估视觉层次" },
            accessibility: { score: 10, comment: "无法评估可访问性" },
        };
    }
}
//# sourceMappingURL=agent.js.map