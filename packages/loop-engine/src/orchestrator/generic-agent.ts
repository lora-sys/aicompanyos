import type { LLMProvider } from "../interrogate/types.js";
import type { AgentExecutor } from "./types.js";

/**
 * GenericAgent — 通用顺序执行 Agent
 *
 * 用于动态团队中除 writer/critic 之外的角色（如 researcher、ui-ux、reviewer）。
 * 通过 systemPrompt 定义角色行为，接收 step 描述和上游产物作为上下文，
 * 调用 LLM 生成结果。
 *
 * 设计原则：
 * - 最小接口：只依赖 LLMProvider，不依赖具体 Agent 实现
 * - 可扩展：调用方可通过 systemPrompt 注入部门专属行为
 * - 与 ExecutionOrchestrator 无缝集成
 */
export interface GenericAgentConfig {
  /** 角色系统提示 */
  systemPrompt: string;
  /** LLM 调用接口 */
  llmProvider: LLMProvider;
}

export class GenericAgent implements AgentExecutor {
  private systemPrompt: string;
  private llmProvider: LLMProvider;

  constructor(config: GenericAgentConfig) {
    this.systemPrompt = config.systemPrompt;
    this.llmProvider = config.llmProvider;
  }

  async execute(params: {
    step: import("../types.js").PlanStep;
    tools: import("../tool-registry/registry.js").ToolRegistry;
    context: import("./types.js").StandardAgentContext;
    previousOutputs: Record<string, { content: string }>;
  }): Promise<{ content: string; role: string }> {
    const { step, previousOutputs } = params;

    const contextParts: string[] = [];
    const deps = step.dependsOn ?? [];
    for (const depId of deps) {
      const dep = previousOutputs[depId];
      if (dep?.content) {
        contextParts.push(`## 上游产物 (${depId})\n${dep.content.slice(0, 2000)}`);
      }
    }

    const userPrompt = [
      `## 当前任务\n${step.description}`,
      ...(contextParts.length > 0 ? ["\n" + contextParts.join("\n\n")] : []),
      "\n请直接输出你的产出内容。",
    ].join("\n");

    const content = await this.llmProvider.chat([
      { role: "system", content: this.systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    return { content, role: step.agentType };
  }
}
