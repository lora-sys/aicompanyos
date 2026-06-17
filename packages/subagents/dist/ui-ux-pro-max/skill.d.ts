import type { LLMProvider } from "@aicos/loop-engine/types";
import type { UIUXSkillInput, UIUXSkillOutput } from "./types.js";
export declare class UIUXProMaxSkill {
    static readonly SKILL_NAME = "ui-ux-pro-max";
    static readonly SKILL_DESCRIPTION = "UI/UX \u8BBE\u8BA1\u6307\u5BFC\u4E13\u5BB6\uFF0C\u63D0\u4F9B\u8272\u5F69\u65B9\u6848\u3001\u6392\u7248\u89C4\u5219\u3001\u5E03\u5C40\u5EFA\u8BAE\u548C\u8BBE\u8BA1\u4EE4\u724C";
    private llm;
    private parser;
    constructor(llm: LLMProvider);
    execute(input: UIUXSkillInput): Promise<UIUXSkillOutput>;
    private generateDesignGuidance;
    private incrementalUpdate;
    private buildPrompt;
    /**
     * 解析 LLM 响应（使用 LLMStructuredOutput + Zod）
     *
     * #7.1 改进前：手写 JSON.parse + \{[\s\S]*\} 正则 → SyntaxError 频繁
     * #7.1 改进后：四级 JSON 提取 + Zod schema 运行时验证 → 零崩溃
     */
    private parseResponse;
}
//# sourceMappingURL=skill.d.ts.map