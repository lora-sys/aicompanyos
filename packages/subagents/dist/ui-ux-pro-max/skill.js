// UI-UX-Pro-Max Skill 模式实现
// Writer Agent 写作时主动调用，获取实时设计指导
//
// #7.1 改进：迁移到 LLMStructuredOutput + Zod schema 验证
// 替代原来的手写 JSON.parse + 正则提取，统一解析策略
import { createLLMParser, FallbackStrategy } from "@aicos/loop-engine/utils";
// ============================================================
// Zod Schema — UIUX 输出的运行时验证
// ============================================================
import { z } from "zod";
const uiUXColorPaletteSchema = z.object({
    primary: z.string().default("#1976D2"),
    secondary: z.string().default("#424242"),
    accent: z.string().default("#FF4081"),
    background: z.string().default("#FAFAFA"),
    text: z.string().default("#212121"),
    reasoning: z.string().default("默认配色方案"),
});
const uiUXTypographySchema = z.object({
    headingFont: z.string().default("-apple-system, BlinkMacSystemFont, sans-serif"),
    bodyFont: z.string().default("-apple-system, BlinkMacSystemFont, sans-serif"),
    headingSizes: z.record(z.string(), z.string()).default({ h1: "2.5rem", h2: "2rem", h3: "1.5rem" }),
    // ★ coerce: 允许 LLM 返回 number（如 1.6），自动转为 string
    lineHeight: z.coerce.string().default("1.6"),
    letterSpacing: z.coerce.string().default("0"),
    reasoning: z.string().default("默认排版设置"),
});
const uiUXLayoutSchema = z.object({
    template: z.string().default("单列布局"),
    // ★ coerce: 允许 LLM 返回 number（如 16），自动转为 string
    spacing: z.coerce.string().default("16px"),
    componentStructure: z.array(z.string()).default(["header", "main", "footer"]),
    reasoning: z.string().default("默认布局模板"),
});
const uiUXDesignTokensSchema = z.object({
    borderRadius: z.coerce.string().default("8px"),
    shadow: z.string().default("0 2px 8px rgba(0,0,0,0.1)"),
    // ★ coerce: 允许 LLM 返回 number（如 8），自动转为 string
    paddingScale: z.coerce.string().default("8px"),
    reasoning: z.string().default("默认设计令牌"),
});
const uiUXOutputSchema = z.object({
    colorPalette: uiUXColorPaletteSchema,
    typography: uiUXTypographySchema,
    layoutSuggestion: uiUXLayoutSchema,
    designTokens: uiUXDesignTokensSchema,
    overallGuidance: z.string().default("请根据具体场景调整上述设计参数。"),
    confidence: z.number().min(0).max(1).default(0.7),
});
// 默认值（当 Zod 解析失败时使用）
const DEFAULT_UIUX_OUTPUT = {
    colorPalette: {
        primary: "#1976D2",
        secondary: "#424242",
        accent: "#FF4081",
        background: "#FAFAFA",
        text: "#212121",
        reasoning: "默认配色方案",
    },
    typography: {
        headingFont: "-apple-system, BlinkMacSystemFont, sans-serif",
        bodyFont: "-apple-system, BlinkMacSystemFont, sans-serif",
        headingSizes: { h1: "2.5rem", h2: "2rem", h3: "1.5rem" },
        lineHeight: "1.6",
        letterSpacing: "0",
        reasoning: "默认排版设置",
    },
    layoutSuggestion: {
        template: "单列布局",
        spacing: "16px",
        componentStructure: ["header", "main", "footer"],
        reasoning: "默认布局模板",
    },
    designTokens: {
        borderRadius: "8px",
        shadow: "0 2px 8px rgba(0,0,0,0.1)",
        paddingScale: "8px",
        reasoning: "默认设计令牌",
    },
    overallGuidance: "请根据具体场景调整上述设计参数。",
    confidence: 0.7,
};
// 错误回退值（置信度更低，标记为解析失败）
const FALLBACK_UIUX_OUTPUT = {
    ...DEFAULT_UIUX_OUTPUT,
    colorPalette: { ...DEFAULT_UIUX_OUTPUT.colorPalette, reasoning: "错误回退：使用默认配色" },
    typography: { ...DEFAULT_UIUX_OUTPUT.typography, reasoning: "错误回退：使用默认排版" },
    layoutSuggestion: { ...DEFAULT_UIUX_OUTPUT.layoutSuggestion, reasoning: "错误回退：使用默认布局" },
    designTokens: { ...DEFAULT_UIUX_OUTPUT.designTokens, reasoning: "错误回退：使用默认令牌" },
    overallGuidance: "LLM 响应解析失败，已应用默认值。",
    confidence: 0.3,
};
// Skill 系统提示词
const SKILL_SYSTEM_PROMPT = `你是一个专业的 UI/UX 设计师，精通 Material Design、Apple HIG、Ant Design 等主流设计系统。
你的任务是根据任务类型和内容特征，提供结构化的设计建议。

输出要求（极其重要）：
1. 必须返回**一个且仅一个** JSON 对象（不是数组！不要用 [] 包裹）
2. JSON 必须包含以下顶层字段：colorPalette, typography, layoutSuggestion, designTokens, overallGuidance, confidence
3. colorPalette 包含：primary(主色), secondary(辅色), accent(强调色), background(背景), text(文字) — 均为 hex 色值字符串
4. typography 包含：headingFont, bodyFont, headingSizes(对象), lineHeight, letterSpacing
5. layoutSuggestion 包含：template, spacing, componentStructure(字符串数组)
6. designTokens 包含：borderRadius, shadow, paddingScale
7. overallGuidance 为字符串，confidence 为 0-1 的数字
8. 用 markdown 代码块包裹: \`\`\`json ... \`\`\`

参考原则：
- 色彩：主色、辅色、强调色要有明确层次，背景与文字对比度 >= 4.5:1
- 排版：标题层级清晰，行高 1.5-1.8，正文字号 16px 起
- 布局：网格系统对齐，间距使用 8px 基准倍数
- 圆角：保持统一，通常 4-12px
- 阴影：层次分明，避免过度使用`;
export class UIUXProMaxSkill {
    // Skill 名称（注册到 Tool Registry 时使用）
    static SKILL_NAME = "ui-ux-pro-max";
    static SKILL_DESCRIPTION = "UI/UX 设计指导专家，提供色彩方案、排版规则、布局建议和设计令牌";
    llm;
    // 使用 LLMStructuredOutput 替代手写解析
    parser;
    constructor(llm) {
        this.llm = llm;
        // 初始化 Zod 驱动的解析器
        this.parser = createLLMParser({
            schema: uiUXOutputSchema,
            fallback: DEFAULT_UIUX_OUTPUT,
            strategy: FallbackStrategy.RETURN_FALLBACK,
            logPrefix: "UIUXProMaxSkill",
        });
    }
    // 执行 skill（被 Writer Agent 调用）
    async execute(input) {
        // 检查是否有现有 design.mdx
        if (input.currentDesignMDX) {
            return this.incrementalUpdate(input.currentDesignMDX, input);
        }
        return this.generateDesignGuidance(input);
    }
    // 内部：调用 LLM 生成设计建议（从零生成）
    async generateDesignGuidance(input) {
        const userPrompt = this.buildPrompt(input);
        const response = await this.llm.chat([
            { role: "system", content: SKILL_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
        ]);
        // 使用 LLMStructuredOutput 统一解析（替代原来的手写 JSON.parse）
        return this.parseResponse(response);
    }
    // 内部：基于现有 design.mdx 的增量更新
    async incrementalUpdate(currentMDX, input) {
        const incrementalPrompt = `当前设计规范（design.mdx）：
\`\`\`mdx
${currentMDX}
\`\`\`

新的任务需求：
${this.buildPrompt(input)}

请基于现有设计规范进行增量优化。如果新任务与现有风格一致，保持并微调；如果有明显差异，给出调整建议并说明原因。`;
        const response = await this.llm.chat([
            { role: "system", content: SKILL_SYSTEM_PROMPT },
            { role: "user", content: incrementalPrompt },
        ]);
        return this.parseResponse(response);
    }
    // 构建用户提示词
    buildPrompt(input) {
        let prompt = `任务类型：${input.taskType}\n内容类型：${input.contentType}\n\n`;
        if (input.userPreferences && Object.keys(input.userPreferences).length > 0) {
            prompt += `用户偏好：\n`;
            for (const [key, value] of Object.entries(input.userPreferences)) {
                prompt += `- ${key}: ${value}\n`;
            }
            prompt += "\n";
        }
        if (input.contextHints && input.contextHints.length > 0) {
            prompt += `上下文线索：\n`;
            input.contextHints.forEach((hint, i) => {
                prompt += `${i + 1}. ${hint}\n`;
            });
            prompt += "\n";
        }
        prompt +=
            '请提供完整的 UI/UX 设计建议，包含 colorPalette、typography、layoutSuggestion、designTokens、overallGuidance 和 confidence 字段。';
        return prompt;
    }
    /**
     * 解析 LLM 响应（使用 LLMStructuredOutput + Zod）
     *
     * #7.1 改进前：手写 JSON.parse + \{[\s\S]*\} 正则 → SyntaxError 频繁
     * #7.1 改进后：四级 JSON 提取 + Zod schema 运行时验证 → 零崩溃
     */
    parseResponse(response) {
        const result = this.parser.parse(response);
        if (result.success) {
            return result.data;
        }
        // ★ 安全网：如果提取到的是数组，取第一个元素尝试解析
        const arrayMatch = response.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
            try {
                const arr = JSON.parse(arrayMatch[0]);
                if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "object") {
                    const objectResult = this.parser.parse(JSON.stringify(arr[0]));
                    if (objectResult.success) {
                        console.warn("[UIUXProMaxSkill] 从数组中提取第一个元素作为设计建议");
                        return objectResult.data;
                    }
                }
            }
            catch {
                // 忽略，继续 fallback
            }
        }
        // 解析失败，返回低置信度兜底值
        console.warn(`[UIUXProMaxSkill] 解析失败（已由 LLMStructuredOutput 处理）: ${result.error}`);
        return FALLBACK_UIUX_OUTPUT;
    }
}
//# sourceMappingURL=skill.js.map