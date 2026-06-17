// Researcher Agent 实现
// 资料研究员，负责通过 MCP Exa 搜索实时资料并整理为结构化参考材料

import type { AgentExecutor, ToolRegistry, LLMProvider, PlanStep } from "@aicos/loop-engine/types";
import type { ResearcherInput, ResearcherOutput, ResearchSource } from "./types.js";

export class ResearcherAgent implements AgentExecutor {
  static readonly AGENT_TYPE = "researcher";
  static readonly SYSTEM_PROMPT = `你是一个专业的技术资料研究员。你的任务是根据写作主题搜索和整理高质量的参考资料。

工作原则：
1. 使用 MCP 搜索工具（如 Exa）获取最新的技术资料
2. 从搜索结果中筛选最相关、最权威的来源
3. 将资料整理为结构化的摘要，包含关键观点和数据
4. 标注每条资料的来源和可信度
5. 避免过时信息，优先选择最近 1-2 年内的内容

输出格式：返回 JSON，包含 sources 数组和 summary 文本。`;

  constructor(
    private tools: ToolRegistry,
    private llmProvider: LLMProvider
  ) {
    if (!llmProvider) {
      throw new Error("ResearcherAgent 构造失败：llmProvider 参数不能为空");
    }
  }

  // 实现 AgentExecutor 接口
  async execute(params: {
    step: PlanStep;
    tools: ToolRegistry;
    context: import("@aicos/loop-engine").StandardAgentContext;
    previousOutputs: Record<string, { content: string }>;
  }): Promise<ResearcherOutput> {
    const input: ResearcherInput = {
      taskId: params.context.taskId,
      topic: params.step.description,
      taskInput: params.context.taskInput,
      interrogationResults: params.context.interrogationResults ?? {},
      maxSources: 5, // 默认最多搜索 5 条资料
    };

    return this.researchWorkflow(input);
  }

  // 内部：研究工作流
  private async researchWorkflow(input: ResearcherInput): Promise<ResearcherOutput> {
    const usedTools: string[] = [];
    const sources: ResearcherOutput["sources"] = [];

    // Step 1: 尝试 MCP Exa 搜索
    const mcpResults = await this.searchViaMCP(input.topic, input.taskId);
    if (mcpResults.length > 0) {
      sources.push(...mcpResults);
      usedTools.push("mcp_exa_search");
    }

    // Step 2: Fallback 到内置 web_search
    if (sources.length === 0) {
      const webResults = await this.searchViaWebSearch(input.topic, input.taskId);
      if (webResults.length > 0) {
        sources.push(...webResults);
        usedTools.push("web_search");
      }
    }

    // Step 3: LLM 整理资料为结构化摘要
    const summary = await this.summarizeSources(input, sources);

    return {
      sources,
      summary,
      sourceCount: sources.length,
      usedTools,
    };
  }

  /**
   * 通过 MCP Exa 搜索资料
   */
  private async searchViaMCP(
    topic: string,
    taskId: string
  ): Promise<ResearcherOutput["sources"]> {
    // 尝试 MCP 工具名（可能因 server 前缀不同）
    const mcpToolNames = ["exa_web_search", "exa_web_search_exa", "web_search_exa"];

    for (const toolName of mcpToolNames) {
      if (!this.tools.has(toolName)) continue;

      try {
        console.log(`[ResearcherAgent] 使用 MCP 工具 "${toolName}" 搜索...`);

        const result = await this.tools.execute({
          toolName,
          params: {
            query: topic,
            numResults: 5,
            type: "auto",
          },
          callerAgent: ResearcherAgent.AGENT_TYPE,
          taskId,
        });

        if (result.success && result.data) {
          return this.parseMCPExaResults(result.data);
        }
      } catch (e) {
        console.warn(`[ResearcherAgent] MCP 工具 "${toolName}" 失败:`, e instanceof Error ? e.message : e);
      }
    }

    return [];
  }

  /**
   * 通过内置 web_search 搜索（Fallback）
   */
  private async searchViaWebSearch(
    topic: string,
    taskId: string
  ): Promise<ResearcherOutput["sources"]> {
    if (!this.tools.has("web_search")) return [];

    try {
      const result = await this.tools.execute({
        toolName: "web_search",
        params: { query: topic },
        callerAgent: ResearcherAgent.AGENT_TYPE,
        taskId,
      });

      if (result.success && result.data) {
        const data = result.data as Array<{ title: string; url: string }>;
        return data.map((item) => ({
          title: item.title,
          url: item.url,
          relevance: 0.7, // web_search fallback 默认 relevance
          publishedDate: undefined,
          keyPoints: [],
          credibility: "medium" as const,
        }));
      }
    } catch (e) {
      console.warn("[ResearcherAgent] web_search 失败:", e instanceof Error ? e.message : e);
    }

    return [];
  }

  /**
   * 解析 MCP Exa 返回的结果
   */
  private parseMCPExaResults(data: unknown): ResearchSource[] {
    if (!data || !Array.isArray(data)) return [];

    return data.map((item: Record<string, unknown>) => ({
      title: (item.title as string) ?? "Untitled",
      url: (item.url as string) ?? "",
      relevance: typeof item.score === "number" ? Math.min(1, item.score / 100) : 0.8,
      publishedDate: item.publishedDate as string | undefined,
      keyPoints: Array.isArray(item.keyPoints)
        ? (item.keyPoints as string[]).slice(0, 3)
        : [],
      credibility: "high" as const, // Exa 搜索结果通常质量较高
    })).filter((s) => s.title && s.url);
  }

  /**
   * 调用 LLM 整理所有来源为结构化摘要
   */
  private async summarizeSources(
    input: ResearcherInput,
    sources: ResearchSource[]
  ): Promise<string> {
    if (sources.length === 0) {
      return "未找到相关参考资料。请基于自身知识库完成写作。";
    }

    // 构造资料列表文本
    const sourcesText = sources
      .map((s, i) => `${i + 1}. **${s.title}** (${s.url})\n   相关度: ${Math.round(s.relevance * 100)}% | 可信度: ${s.credibility}${s.publishedDate ? ` | 发布: ${s.publishedDate}` : ""}${s.keyPoints.length > 0 ? `\n   要点: ${s.keyPoints.join("; ")}` : ""}`)
      .join("\n\n");

    const prompt = [
      `## 研究任务`,
      `主题: ${input.topic}`,
      `原始任务: ${input.taskInput}`,
      ``,
      `## 搜索到的参考资料 (${sources.length} 条)`,
      sourcesText,
      ``,
      `请将以上资料整理为一份简明扼要的研究摘要（300 字以内），包括：`,
      `- 核心观点（按主题分组）`,
      `- 关键数据或结论`,
      `- 值得在文章中引用的重要信息`,
      ``,
      `以 Markdown 格式输出。`,
    ].join("\n");

    const response = await this.llmProvider.chat([
      { role: "system", content: ResearcherAgent.SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);

    return response;
  }
}
