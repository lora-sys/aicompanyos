import type { AgentExecutor, ToolRegistry, LLMProvider, PlanStep } from "@aicos/loop-engine/types";
import type { IEvaluatorAgent, GradingCriteria, GradingResult } from "@aicos/loop-engine";
import type { CriticOutput } from "./types.js";
import type { WriterOutput } from "../writer/types.js";
export declare class CriticAgent implements AgentExecutor, IEvaluatorAgent<WriterOutput> {
    private llmProvider;
    private criteria;
    static readonly AGENT_TYPE = "critic";
    static readonly FALLBACK_SYSTEM_PROMPT = "\u4F60\u662F\u4E00\u4E2A\u4E25\u683C\u4F46\u5EFA\u8BBE\u6027\u7684\u5185\u5BB9\u5BA1\u6838\u5458\u3002\u4F60\u4ECE\u4E94\u4E2A\u7EF4\u5EA6\u8BC4\u4F30\u5185\u5BB9\u8D28\u91CF\uFF1A\n\n1. \u4E3B\u9898\u51C6\u786E\u6027 (topicAccuracy/topic_accuracy)\uFF1A\u4FE1\u606F\u662F\u5426\u6B63\u786E\uFF0C\u662F\u5426\u56F4\u7ED5\u4EFB\u52A1\u4E3B\u9898\uFF0C\u662F\u5426\u6709\u4E8B\u5B9E\u9519\u8BEF\u6216\u504F\u9898\n2. \u6280\u672F\u6DF1\u5EA6 (technical_depth)\uFF1A\u6280\u672F\u5206\u6790\u662F\u5426\u6DF1\u5165\uFF0C\u662F\u5426\u89E6\u53CA\u5B9E\u73B0\u539F\u7406\uFF0C\u662F\u5426\u6709\u72EC\u5230\u6D1E\u5BDF\n3. \u4EE3\u7801\u8D28\u91CF (code_quality)\uFF1A\u4EE3\u7801\u8BED\u6CD5\u3001\u547D\u540D\u3001\u7C7B\u578B\u4F7F\u7528\u3001\u9519\u8BEF\u5904\u7406\u662F\u5426\u5B8C\u5584\n4. \u53EF\u8BFB\u6027 (readability)\uFF1A\u6587\u7AE0\u7ED3\u6784\u3001\u6BB5\u843D\u8FC7\u6E21\u3001\u672F\u8BED\u89E3\u91CA\u3001Markdown \u683C\u5F0F\u662F\u5426\u89C4\u8303\n5. \u539F\u521B\u6027 (originality)\uFF1A\u662F\u5426\u6709\u72EC\u7279\u89C2\u70B9\u6216\u5B9E\u8DF5\u7ECF\u9A8C\uFF0C\u800C\u975E\u590D\u8FF0\u5B98\u65B9\u6587\u6863\n\n\u6BCF\u4E2A\u7EF4\u5EA6 0-20 \u5206\uFF0C\u603B\u5206 0-100\u3002\n\u4F4E\u4E8E 75 \u5206\u5FC5\u987B\u7ED9\u51FA\u5177\u4F53\u7684\u4FEE\u6539\u5EFA\u8BAE\u3002\n\u5373\u4F7F\u901A\u8FC7\u4E5F\u8981\u7ED9\u51FA\u6539\u8FDB\u7A7A\u95F4\u3002";
    private readonly PASS_THRESHOLD;
    constructor(llmProvider: LLMProvider, criteria: GradingCriteria);
    /** 部门自定义评估维度（优先于默认 GradingCriteria） */
    private customDimensions;
    /**
     * 设置部门专属评估维度
     * 覆盖默认的 GradingCriteria 维度定义
     */
    setCustomDimensions(dimensions: Array<{
        id: string;
        name: string;
        description: string;
        maxScore: number;
        scoringGuide: string;
    }>): void;
    /** 动态构建 system prompt：使用 GradingCriteria 构造评估标准 */
    private buildSystemPrompt;
    execute(params: {
        step: PlanStep;
        tools: ToolRegistry;
        context: import("@aicos/loop-engine").StandardAgentContext;
        previousOutputs: Record<string, {
            content: string;
        }>;
    }): Promise<CriticOutput>;
    /** 当前评估轮次（从 1 开始） */
    private currentRound;
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
    evaluate(output: WriterOutput, criteria: GradingCriteria, originalTask: string): Promise<GradingResult>;
    /**
     * 构造 evaluate 方法的 user prompt
     */
    private buildEvaluatePrompt;
    /**
     * 将 LLM 响应解析并转换为 GradingResult 格式
     *
     * 核心逻辑：
     * - 维度映射：将 LLM 返回的维度名匹配到 criteria 定义的 dimension ID
     * - 模糊匹配：如果 ID 不精确匹配，做大小写/下划线/驼峰的模糊匹配
     * - 权重计算：使用 criteria.dimensions 的 weight 计算 weightedScore
     */
    private parseGradingResponse;
    /**
     * 将 LLM 返回的原始数据映射为 GradingResult
     */
    private mapToGradingResult;
    /**
     * 构建维度名 → dimensionId 的映射表（用于模糊匹配）
     */
    private buildDimensionMapping;
    /**
     * 模糊匹配 LLM 返回的维度 key 到 criteria 定义的 dimensionId
     */
    private matchDimensionKey;
    /** 正则回退：当 Zod schema 不匹配时 */
    private fallbackParseGrading;
    /** 安全的全零分数 GradingResult */
    private getZeroGradingResult;
    private review;
    private buildReviewPrompt;
    private parseReviewResponse;
    /** 正则回退：当 Zod schema 不匹配时 */
    private fallbackParseReview;
    /** 安全的全零分数响应 */
    private getZeroScoreResponse;
}
//# sourceMappingURL=agent.d.ts.map