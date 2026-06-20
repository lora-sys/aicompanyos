import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { z } from "zod";
import { createLLMParser, FallbackStrategy, } from "../utils/llm-structured-output.js";
import { THRESHOLDS } from "../config/thresholds.js";
// 默认配置
const DEFAULT_CONFIG = {
    threshold: THRESHOLDS.VERIFY_BASELINE,
    checkFileExistence: true,
    checkContentQuality: true,
};
// Zod Schema: 质量验证结果（兼容对象和数组格式）
const singleQualitySchema = z.object({
    score: z.number().default(50),
    reasons: z.array(z.string()).default(["无法解析质量评价"]),
});
const qualityResultSchema = z.union([
    singleQualitySchema,
    z.array(singleQualitySchema), // LLM 可能返回数组
]);
// 解析器实例：验证失败返回安全默认值（中间分）
const qualityParser = createLLMParser({
    schema: qualityResultSchema,
    fallback: { score: 65, reasons: ["质量验证解析失败，给予默认分"] },
    strategy: FallbackStrategy.RETURN_FALLBACK,
    logPrefix: "VerifyEngine.verifyQuality",
});
// System Prompt：验证审核（校准版 — 减少偏保守评分）
const VERIFY_QUALITY_PROMPT = `你是一位质量验证专家。请对以下产物进行质量审核。

## 评分标准（校准基线）

请根据以下评分区间进行客观评估，避免过于保守或过于宽松：

- **90-100分（优秀）**: 内容完整、结构清晰、有深度洞察、符合目标平台风格
- **80-89分（良好）**: 内容合格、有可读性、基本满足任务要求，存在少量可优化之处
- **70-79分（合格）**: 内容基本完整，但存在明显的结构或深度不足
- **60-69分（待改进）**: 有较多问题但仍有可用价值
- **0-59分（不合格）**: 严重偏离任务要求或内容质量极低

## 评分原则

1. **任务匹配度优先**: 只要产物满足了原始任务的核心需求，基础分应在 70 以上
2. **平台适配考量**: 社交媒体内容（小红书/推特等）以平台风格适配为主要标准，不套用学术论文标准
3. **避免“幻觉式扣分”**: 不要因为“可能还可以更好”而扣分，只扣明确存在的问题
4. **内容完整性 > 绝对深度**: 一篇结构完整的中等深度文章优于结构残缺的深度文章

## 输出格式

返回 JSON 格式（单个对象，不要返回数组）：
{
  "score": 0-100,
  "reasons": ["原因1", "原因2"]
}

★ 必须返回单个 JSON 对象，不要返回数组。正确: {"score":85,"reasons":["..."]}  错误: [{"score":85,"reasons":["..."]}]`;
/**
 * 验证引擎 - 对产物进行文件存在性检查和内容质量审核
 */
export class VerifyEngine {
    llmProvider;
    config;
    constructor(llmProvider, config) {
        this.llmProvider = llmProvider;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * 执行验证流程
     */
    async verify(input) {
        // 1. 文件存在性和非空检查
        const artifactChecks = await this.checkFiles(input.artifacts);
        // 文件存在性检查失败则直接返回
        if (this.config.checkFileExistence) {
            const fileFailures = artifactChecks.filter((c) => !c.exists || !c.nonEmpty);
            if (fileFailures.length > 0) {
                return {
                    passed: false,
                    score: 0,
                    reasons: fileFailures.map((c) => !c.exists ? `文件不存在: ${c.path}` : `文件为空: ${c.path}`),
                    artifactChecks,
                };
            }
        }
        // 2. 内容质量验证
        let score = 100;
        let reasons = [];
        if (this.config.checkContentQuality) {
            const qualityResult = await this.verifyQuality(input);
            score = qualityResult.score;
            reasons = qualityResult.reasons;
        }
        // 更新 artifactChecks 的 qualityScore
        const checksWithScore = artifactChecks.map((c) => ({
            ...c,
            qualityScore: c.exists && c.nonEmpty ? score : 0,
        }));
        return {
            passed: score >= this.config.threshold,
            score,
            reasons,
            artifactChecks: checksWithScore,
        };
    }
    /**
     * 文件存在性检查
     */
    async checkFiles(artifacts) {
        return artifacts.map((path) => {
            const exists = existsSync(path);
            let nonEmpty = false;
            if (exists) {
                try {
                    const stat = statSync(path);
                    nonEmpty = stat.size > 0;
                }
                catch {
                    nonEmpty = false;
                }
            }
            return { path, exists, nonEmpty, qualityScore: 0 };
        });
    }
    /**
     * LLM 内容质量验证
     * 使用 LLMStructuredOutput 统一提取+验证
     */
    async verifyQuality(input) {
        // 读取所有产物内容
        const contents = [];
        for (const path of input.artifacts) {
            try {
                const content = await readFile(path, "utf-8");
                contents.push(`=== 文件: ${path} ===\n${content.slice(0, 5000)}`);
            }
            catch {
                contents.push(`=== 文件: ${path} ===\n(无法读取)`);
            }
        }
        // 构造上下文
        const contextText = Object.entries(input.interrogationResults)
            .map(([k, v]) => `[${k}] ${v}`)
            .join("\n");
        const userPrompt = `## 原始任务
${input.originalTask}

## 拷问上下文
${contextText || "（无）"}

## 执行计划摘要
${input.plan?.steps?.length ? `共 ${input.plan.steps.length} 个步骤: ${input.plan.steps.map((s) => s.title || s.description || "未命名").join(", ")}` : "（无计划信息）"}

## 产物文件内容
${contents.join("\n\n")}

请评估以上产物的质量和完整性。注意：只要产物基本满足了原始任务的核心需求，评分应在 70 分以上。`;
        try {
            const response = await this.llmProvider.chat([
                { role: "system", content: VERIFY_QUALITY_PROMPT },
                { role: "user", content: userPrompt },
            ]);
            // 使用 LLMStructuredOutput 解析（RETURN_FALLBACK 模式）
            const result = qualityParser.parse(response);
            if (!result.success) {
                // Schema 验证失败 → 尝试手动提取 score
                const scoreMatch = response.match(/"score"\s*:\s*(\d+)/);
                const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10))) : 65;
                return { score, reasons: [`质量验证 (兜底解析): score=${score}`] };
            }
            // 兼容 LLM 返回数组格式：取第一个元素
            const parsed = Array.isArray(result.data) ? result.data[0] : result.data;
            if (parsed) {
                return {
                    score: Math.min(100, Math.max(0, Number(parsed.score) ?? 0)),
                    reasons: parsed.reasons ?? ["无法解析质量评价"],
                };
            }
            // parsed 为空时返回 fallback
            return qualityParser.getFallback();
        }
        catch {
            // LLM 调用异常 → 返回 fallback 值
            return qualityParser.getFallback();
        }
    }
}
//# sourceMappingURL=engine.js.map