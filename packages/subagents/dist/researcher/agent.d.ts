import type { AgentExecutor, ToolRegistry, LLMProvider, PlanStep } from "@aicos/loop-engine/types";
import type { ResearcherOutput } from "./types.js";
export declare class ResearcherAgent implements AgentExecutor {
    private tools;
    private llmProvider;
    static readonly AGENT_TYPE = "researcher";
    static readonly SYSTEM_PROMPT = "\u4F60\u662F\u4E00\u4E2A\u4E13\u4E1A\u7684\u6280\u672F\u8D44\u6599\u7814\u7A76\u5458\u3002\u4F60\u7684\u4EFB\u52A1\u662F\u6839\u636E\u5199\u4F5C\u4E3B\u9898\u641C\u7D22\u548C\u6574\u7406\u9AD8\u8D28\u91CF\u7684\u53C2\u8003\u8D44\u6599\u3002\n\n\u5DE5\u4F5C\u539F\u5219\uFF1A\n1. \u4F7F\u7528 MCP \u641C\u7D22\u5DE5\u5177\uFF08\u5982 Exa\uFF09\u83B7\u53D6\u6700\u65B0\u7684\u6280\u672F\u8D44\u6599\n2. \u4ECE\u641C\u7D22\u7ED3\u679C\u4E2D\u7B5B\u9009\u6700\u76F8\u5173\u3001\u6700\u6743\u5A01\u7684\u6765\u6E90\n3. \u5C06\u8D44\u6599\u6574\u7406\u4E3A\u7ED3\u6784\u5316\u7684\u6458\u8981\uFF0C\u5305\u542B\u5173\u952E\u89C2\u70B9\u548C\u6570\u636E\n4. \u6807\u6CE8\u6BCF\u6761\u8D44\u6599\u7684\u6765\u6E90\u548C\u53EF\u4FE1\u5EA6\n5. \u907F\u514D\u8FC7\u65F6\u4FE1\u606F\uFF0C\u4F18\u5148\u9009\u62E9\u6700\u8FD1 1-2 \u5E74\u5185\u7684\u5185\u5BB9\n\n\u8F93\u51FA\u683C\u5F0F\uFF1A\u8FD4\u56DE JSON\uFF0C\u5305\u542B sources \u6570\u7EC4\u548C summary \u6587\u672C\u3002";
    constructor(tools: ToolRegistry, llmProvider: LLMProvider);
    execute(params: {
        step: PlanStep;
        tools: ToolRegistry;
        context: import("@aicos/loop-engine").StandardAgentContext;
        previousOutputs: Record<string, {
            content: string;
        }>;
    }): Promise<ResearcherOutput>;
    private researchWorkflow;
    /**
     * 通过 MCP Exa 搜索资料
     */
    private searchViaMCP;
    /**
     * 通过内置 web_search 搜索（Fallback）
     */
    private searchViaWebSearch;
    /**
     * 解析 MCP Exa 返回的结果
     */
    private parseMCPExaResults;
    /**
     * 调用 LLM 整理所有来源为结构化摘要
     */
    private summarizeSources;
}
//# sourceMappingURL=agent.d.ts.map