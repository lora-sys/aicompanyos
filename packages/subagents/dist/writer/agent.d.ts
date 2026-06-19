import type { AgentExecutor, ToolRegistry, LLMProvider, PlanStep, IGeneratorAgent, IterationHandoff } from "@aicos/loop-engine/types";
import type { WriterOutput } from "./types.js";
export declare class WriterAgent implements AgentExecutor, IGeneratorAgent<PlanStep, WriterOutput> {
    private tools;
    private llmProvider;
    static readonly AGENT_TYPE = "writer";
    static readonly SYSTEM_PROMPT = "\u4F60\u662F\u4E00\u4E2A\u4E13\u4E1A\u7684\u5185\u5BB9\u521B\u4F5C\u8005\u3002\u4F60\u7684\u4EFB\u52A1\u662F\u9AD8\u8D28\u91CF\u5730\u5B8C\u6210\u5199\u4F5C\u4EFB\u52A1\u3002\n\n\u5199\u4F5C\u539F\u5219\uFF1A\n1. \u4E25\u683C\u9075\u5FAA\u7528\u6237\u7684\u9700\u6C42\u548C\u504F\u597D\n2. \u53C2\u8003 UI/UX \u8BBE\u8BA1\u6307\u5BFC\u6765\u51B3\u5B9A\u5185\u5BB9\u7684\u5448\u73B0\u98CE\u683C\n3. \u4F7F\u7528\u5DE5\u5177\u641C\u96C6\u5FC5\u8981\u7684\u53C2\u8003\u8D44\u6599\n4. \u8F93\u51FA\u7ED3\u6784\u5316\u7684 Markdown \u5185\u5BB9\n5. \u4FDD\u6301\u5185\u5BB9\u51C6\u786E\u3001\u6709\u4EF7\u503C\u3001\u6613\u8BFB\n\n**\u3010\u786C\u6027\u7BC7\u5E45\u7EA6\u675F \u2014 \u8FDD\u53CD\u5C06\u5BFC\u81F4\u5BA1\u6838\u4E0D\u901A\u8FC7\u3011**\n- \u76EE\u6807\u8F93\u51FA 2500-3500 \u5B57\uFF08\u4E2D\u6587\uFF0C\u7EA6 10000-14000 \u5B57\u7B26\uFF09\uFF0C\u7EDD\u5BF9\u7981\u6B62\u8D85\u8FC7 15000 \u5B57\u7B26\n- \u6BCF\u4E2A\u7AE0\u8282\u63A7\u5236\u5728 300-500 \u5B57\u4EE5\u5185\n- \u4EE3\u7801\u793A\u4F8B\u6BCF\u4E2A\u4E0D\u8D85\u8FC7 40 \u884C\uFF0C\u603B\u8BA1\u4E0D\u8D85\u8FC7 3 \u4E2A\u4EE3\u7801\u5757\n- \u5982\u679C\u5185\u5BB9\u8F83\u957F\uFF0C\u5FC5\u987B\u5220\u51CF\u800C\u975E\u6269\u5145\uFF1A\u5220\u9664\u5197\u4F59\u89E3\u91CA\u3001\u5408\u5E76\u76F8\u4F3C\u6BB5\u843D\u3001\u7CBE\u7B80\u8FC7\u6E21\u53E5\n- \u5B81\u53EF\u6DF1\u5EA6\u805A\u7126\u6838\u5FC3\u4E3B\u9898\uFF083-4 \u4E2A\u8981\u70B9\u6DF1\u5165\u5C55\u5F00\uFF09\uFF0C\u4E5F\u4E0D\u8981\u9762\u9762\u4FF1\u5230\u5BFC\u81F4\u7BC7\u5E45\u5931\u63A7\n- \u8F93\u51FA\u524D\u81EA\u67E5\uFF1A\u603B\u5B57\u6570\u662F\u5426\u5728\u76EE\u6807\u8303\u56F4\u5185\uFF1F\u5982\u8D85\u9650\uFF0C\u7ACB\u5373\u5220\u51CF\u81F3\u5408\u89C4\n\n**\u3010\u4E3B\u9898\u7EA6\u675F \u2014 \u8FDD\u53CD\u5C06\u5BFC\u81F4\u5BA1\u6838\u4E0D\u901A\u8FC7\u3011**\n- \u5FC5\u987B\u7D27\u5BC6\u56F4\u7ED5\u7528\u6237\u7684\u539F\u59CB\u4EFB\u52A1\u4E3B\u9898\u5C55\u5F00\uFF0C\u7981\u6B62\u504F\u9898\u5230\u5176\u4ED6\u6280\u672F\u9886\u57DF\n- \u5982\u679C\u7528\u6237\u8981\u6C42\u5199\"AI Agent \u67B6\u6784\"\uFF0C\u5C31\u4E0D\u80FD\u5199\"RAG\"\u6216\"LLM\u63A8\u7406\u4F18\u5316\"\n- \u6BCF\u4E2A\u7AE0\u8282\u7684\u5185\u5BB9\u90FD\u5FC5\u987B\u4E0E\u4EFB\u52A1\u4E3B\u9898\u76F4\u63A5\u76F8\u5173\n- \u4EE3\u7801\u793A\u4F8B\u7684\u6280\u672F\u6808\u5FC5\u987B\u4E0E\u4EFB\u52A1\u4E3B\u9898\u5339\u914D\n\n**\u4EE3\u7801\u793A\u4F8B\u8BED\u8A00\u89C4\u8303\uFF1A**\n- \u4EE3\u7801\u793A\u4F8B\u9ED8\u8BA4\u4F7F\u7528 TypeScript / JavaScript\uFF0C\u4E0E\u9879\u76EE\u6280\u672F\u6808\u4FDD\u6301\u4E00\u81F4\n- \u4EC5\u5F53\u7528\u6237\u660E\u786E\u6307\u5B9A\u5176\u4ED6\u7F16\u7A0B\u8BED\u8A00\u65F6\uFF0C\u624D\u4F7F\u7528\u8BE5\u8BED\u8A00\u7F16\u5199\u793A\u4F8B\n- \u5373\u4F7F\u5F15\u7528\u7B2C\u4E09\u65B9\u5E93\u7684\u5B98\u65B9\u6587\u6863\u662F Python \u793A\u4F8B\uFF0C\u4E5F\u5E94\u5C06\u5176\u8F6C\u5199\u4E3A TypeScript \u7B49\u4EF7\u5B9E\u73B0";
    private customSystemPrompt?;
    constructor(tools: ToolRegistry, llmProvider: LLMProvider, customSystemPrompt?: string);
    /**
     * 设置自定义 System Prompt（运行时动态切换 Writer 风格）
     * @param prompt 自定义 system prompt 内容
     */
    setCustomSystemPrompt(prompt: string): void;
    execute(params: {
        step: PlanStep;
        tools: ToolRegistry;
        context: import("@aicos/loop-engine").StandardAgentContext;
        previousOutputs: Record<string, {
            content: string;
        }>;
    }): Promise<WriterOutput>;
    generate(plan: PlanStep, feedback?: string, handoff?: IterationHandoff): Promise<WriterOutput>;
    /**
     * 从 selfExperience 中提取关于篇幅的经验约束
     */
    private extractLengthConstraint;
    /**
     * 从拷问结果中检测用户指定的编程语言偏好
     */
    private detectLanguagePreference;
    private writingWorkflow;
    private getUIGuidance;
    private research;
    private generateContent;
    private enforceLengthLimit;
    /**
     * Topic Drift 防漂移检测
     *
     * 从任务描述和拷问结果中提取关键词，
     * 检查生成的内容是否包含这些核心关键词。
     * 如果检测到严重偏题，在内容头部注入警告和纠正指令。
     *
     * 注意：这是软检测，不会阻止内容输出，但会通过 prompt 强化约束
     */
    private checkTopicDrift;
    /**
     * 从文本中提取核心主题关键词
     */
    private extractTopicKeywords;
    private writeArtifact;
}
//# sourceMappingURL=agent.d.ts.map