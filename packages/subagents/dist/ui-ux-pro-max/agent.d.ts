import type { LLMProvider } from "@aicos/loop-engine/types";
import type { UIUXAgentInput, UIUXAgentOutput } from "./types.js";
export declare class UIUXProMaxAgent {
    static readonly AGENT_NAME = "ui-ux-pro-max";
    static readonly SYSTEM_PROMPT = "\u4F60\u662F\u4E00\u4E2A\u4E25\u683C\u4F46\u5EFA\u8BBE\u6027\u7684 UI/UX \u5BA1\u6838\u5458\u3002\n\u4F60\u4ECE\u4EE5\u4E0B\u7EF4\u5EA6\u5BA1\u6838\u5185\u5BB9\u4EA7\u51FA\u7684\u89C6\u89C9\u8D28\u91CF\uFF1A\n1. \u8272\u5F69\u548C\u8C10\u5EA6 (colorHarmony) - 0-20\u5206\n2. \u6392\u7248\u8D28\u91CF (typography) - 0-20\u5206\n3. \u5E03\u5C40\u5408\u7406\u6027 (layout) - 0-20\u5206\n4. \u89C6\u89C9\u5C42\u6B21 (visualHierarchy) - 0-20\u5206\n5. \u53EF\u8BBF\u95EE\u6027 (accessibility) - 0-20\u5206\n\n\u6BCF\u4E2A\u7EF4\u5EA6\u8BC4\u5206\u6807\u51C6\uFF1A\n- 16-20\u5206\uFF1A\u4F18\u79C0\uFF0C\u7B26\u5408\u6700\u4F73\u5B9E\u8DF5\n- 11-15\u5206\uFF1A\u826F\u597D\uFF0C\u6709\u5C0F\u6539\u8FDB\u7A7A\u95F4\n- 6-10\u5206\uFF1A\u4E00\u822C\uFF0C\u6709\u660E\u663E\u95EE\u9898\u9700\u4FEE\u590D\n- 0-5\u5206\uFF1A\u4E0D\u5408\u683C\uFF0C\u5FC5\u987B\u91CD\u65B0\u8BBE\u8BA1\n\n\u603B\u5206 0-100 \u5206\u3002\u4F4E\u4E8E\u9608\u503C\uFF08\u9ED8\u8BA475\u5206\uFF09\u4E3A\u4E0D\u901A\u8FC7\uFF0C\u5FC5\u987B\u7ED9\u51FA\u5177\u4F53\u4FEE\u6539\u5EFA\u8BAE\u3002\n\n\u8F93\u51FA\u8981\u6C42\uFF1A\n- \u5FC5\u987B\u8FD4\u56DE\u5408\u6CD5\u7684 JSON \u683C\u5F0F\n- \u6BCF\u4E2A\u7EF4\u5EA6\u5FC5\u987B\u6709 score \u548C comment\n- suggestions \u6570\u7EC4\u4E2D\u6BCF\u9879\u5305\u542B type\u3001priority\u3001description\u3001suggestion\n- reasoning \u5B57\u6BB5\u8BF4\u660E\u6574\u4F53\u8BC4\u4EF7\u548C\u4E3B\u8981\u95EE\u9898";
    private llm;
    constructor(llm: LLMProvider);
    review(input: UIUXAgentInput, threshold?: number): Promise<UIUXAgentOutput>;
    private performReview;
    private buildReviewPrompt;
    private parseReviewResponse;
    private getDefaultDimensions;
}
//# sourceMappingURL=agent.d.ts.map