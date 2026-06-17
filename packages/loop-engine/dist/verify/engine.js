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
    fallback: { score: 50, reasons: ["质量验证解析失败，给予默认分"] },
    strategy: FallbackStrategy.RETURN_FALLBACK,
    logPrefix: "VerifyEngine.verifyQuality",
});
// System Prompt：验证审核
const VERIFY_QUALITY_PROMPT = `你是一位质量验证专家。请对以下产物进行质量审核。

根据原始任务需求和上下文信息，评估产物的完整性和质量。

返回 JSON 格式：
{
  "score": 0-100,
  "reasons": ["原因1", "原因2"]
}`;
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

## 产物文件内容
${contents.join("\n\n")}

请评估以上产物的质量和完整性。`;
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
                const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10))) : 50;
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