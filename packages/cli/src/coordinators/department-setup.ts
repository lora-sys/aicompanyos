// 部门设置协调器
// 从 AICOSApp 中抽取的部门切换、团队组建、Agent 注册逻辑

import {
  LoopHarness,
  GenericAgent,
  WORKER_ROLES,
  type WorkerRole,
  type ITeam,
  type LLMProvider,
  type ContentType,
  type DepartmentConfig,
  type AgentFactory,
  ToolRegistry,
} from "@aicos/loop-engine";
import {
  ContentProductionDepartment,
  OutputPipeline,
} from "@aicos/content-production";
import { WriterAgent } from "@aicos/subagents/writer";
import { CriticAgent } from "@aicos/subagents/critic";
import { ResearcherAgent, ReviewerAgent, UIUXProMaxAgent } from "@aicos/subagents";

/** DepartmentSetup 依赖注入 */
export interface DepartmentSetupDeps {
  loopHarness: LoopHarness;
  llmProvider: LLMProvider;
  toolRegistry: ToolRegistry;
  writerAgent: WriterAgent;
  criticAgent: CriticAgent;
  addLog: (level: string, tag: string, msg: string) => void;
  getTaskInput: () => string;
}

/**
 * 部门设置协调器
 *
 * 封装 ADR-005 部门路由核心逻辑：
 * 1. 内容类型选择与部门配置获取
 * 2. LoopHarness 部门配置注入
 * 3. Writer/Critic Prompt 注入
 * 4. 动态团队组建与 Agent 注册
 */
export class DepartmentSetup {
  private contentDept = new ContentProductionDepartment();
  private activeDepartmentConfig: DepartmentConfig | null = null;
  private activeTeam: ITeam | null = null;
  private selectedContentType: ContentType | null = null;

  constructor(private deps: DepartmentSetupDeps) {}

  /** 获取当前激活的部门配置 */
  getActiveConfig(): DepartmentConfig | null {
    return this.activeDepartmentConfig;
  }

  /** 获取当前动态团队 */
  getActiveTeam(): ITeam | null {
    return this.activeTeam;
  }

  /** 获取当前选中的内容类型 */
  getSelectedContentType(): ContentType | null {
    return this.selectedContentType;
  }

  /** 获取内容产出部实例（供 showContentTypeMenu 等使用） */
  getContentDept(): ContentProductionDepartment {
    return this.contentDept;
  }

  /**
   * 选择内容格式并加载对应部门配置
   *
   * ADR-005 部门路由核心方法：
   * 1. 根据 contentType 获取 DepartmentConfig
   * 2. 将配置注入 LoopHarness
   * 3. 将 Writer Prompt 注入 WriterAgent
   * 4. 将 Critic 维度注入 CriticAgent
   * 5. 动态团队组建与 Agent 注册
   */
  async selectContentType(type: string | ContentType): Promise<void> {
    // 支持数字快捷键 (1-4)
    const typeMap: Record<string, ContentType> = {
      "1": "article",
      "2": "seed",
      "3": "short-video",
      "4": "newsletter",
    };

    const resolvedType = typeMap[type] ?? type as ContentType;
    const validTypes = ContentProductionDepartment.SUPPORTED_TYPES;

    if (!validTypes.includes(resolvedType)) {
      this.deps.addLog("warn", "department", `不支持的内容格式: "${type}"，可用: ${validTypes.join(", ")}`);
      console.log(`\n⚠️ 不支持的内容格式: "${type}"\n   可用: ${validTypes.join(", ")}\n   输入 /type 查看列表\n`);
      return;
    }

    try {
      // 1. 获取部门配置
      const deptConfig = this.contentDept.getConfig(resolvedType);
      this.selectedContentType = resolvedType;
      this.activeDepartmentConfig = deptConfig;

      // 2. 注入 LoopHarness（含 departmentConfig + outputProcessor 回调）
      this.deps.loopHarness.setDepartmentConfig(deptConfig);

      // ★ ADR-005: 注入 outputProcessor 回调 — 解决 loop-engine ↔ content-production 循环依赖
      // CLI 层静态导入 OutputPipeline（cli → content-production 方向，无循环），
      // 通过 setOutputProcessor() 闭包注入到 LoopHarness
      if (deptConfig.outputPipeline) {
        const pipelineConfig = deptConfig.outputPipeline;
        this.deps.loopHarness.setOutputProcessor(async (rawContent, ctx) => {
          const pipeline = new OutputPipeline(pipelineConfig);
          return pipeline.process(rawContent, ctx);
        });
        this.deps.addLog("info", "department", "outputProcessor 回调已通过 setOutputProcessor() 注入");
      }

      // 3. 注入 WriterAgent customSystemPrompt
      if (this.deps.writerAgent) {
        this.deps.writerAgent.setCustomSystemPrompt(deptConfig.agentProfile.writerSystemPrompt);
      }

      // 4. 如果有专属 Critic 维度，更新 CriticAgent
      if (this.deps.criticAgent && deptConfig.agentProfile.criticDimensions) {
        this.deps.criticAgent.setCustomDimensions?.(deptConfig.agentProfile.criticDimensions);
      }

      // 5. 部门动态团队组建（Phase F：部门 + 动态团队打通）
      this.activeTeam = null;
      if (deptConfig.teamManager) {
        try {
          const team = await deptConfig.teamManager.composeTeam(this.deps.getTaskInput(), {
            contentType: resolvedType,
            departmentId: deptConfig.departmentId,
            availableRoles: [...WORKER_ROLES],
          });
          this.activeTeam = team;
          const workerTypes = team.workers.map((w: { agentType: string }) => w.agentType).join(", ");
          this.deps.addLog("info", "team",
            `动态团队组建完成: ${team.workers.length} 人 [${workerTypes}] (规则: ${team.matchedRuleId})`
          );

          // ★ 优先使用 teamManager.createWorkerFactoriesWithDeps 获取 factory 映射
          if (deptConfig.teamManager.createWorkerFactoriesWithDeps) {
            const factories = deptConfig.teamManager.createWorkerFactoriesWithDeps({
              llmProvider: this.deps.llmProvider,
              toolRegistry: this.deps.toolRegistry,
            });
            for (const [agentType, factory] of Object.entries(factories) as [string, import("@aicos/loop-engine").AgentFactory][]) {
              this.deps.loopHarness.registerAgent(agentType, factory);
              this.deps.addLog("info", "team", `已注册 Worker: ${agentType} → factory (via createWorkerFactoriesWithDeps)`);
            }
          } else {
            // 降级：使用 registerDynamicWorker 硬编码逻辑
            for (const worker of team.workers) {
              if (worker.agentType === "writer" || worker.agentType === "critic") continue;
              this.registerDynamicWorker(worker.agentType, worker.role, resolvedType);
            }
          }
        } catch (teamErr) {
          this.deps.addLog("warn", "team",
            `动态团队组建失败（降级到默认双核）: ${teamErr instanceof Error ? teamErr.message : teamErr}`
          );
        }
      }

      const typeLabel = this.contentDept.getAvailableTypes().find((t: { type: string; label: string }) => t.type === resolvedType)?.label ?? resolvedType;
      this.deps.addLog("info", "department",
        `已切换到内容产出部 → ${typeLabel} (${resolvedType})`
      );
      console.log(`\n✅ 已切换到: ${typeLabel}\n   Writer Prompt 已注入 | GoalTemplates 已加载 | OutputPipeline 已配置\n`);
    } catch (e) {
      this.deps.addLog("error", "department",
        `部门配置加载失败: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  /**
   * Phase F: 注册动态团队中的单个 Worker。
   * - researcher → 使用现有的 ResearcherAgent（支持 MCP Exa 搜索）
   * - ui-ux / uiux-designer → 使用 UIUXProMaxAgent（桥接为 AgentExecutor）
   * - reviewer → 使用 ReviewerAgent（最终审查角色）
   * - 其他角色 → 回退到 GenericAgent
   */
  private registerDynamicWorker(agentType: WorkerRole | string, role: string, contentType: ContentType): void {
    if (agentType === "researcher") {
      this.deps.loopHarness.registerAgent(agentType, () =>
        new ResearcherAgent(this.deps.toolRegistry, this.deps.llmProvider)
      );
      this.deps.addLog("info", "team", `已注册 Worker: ${agentType} (${role}) → ResearcherAgent`);
      return;
    }

    // ★ 桥接 UIUXProMaxAgent：将其 review() 方法适配为 AgentExecutor.execute()
    if (agentType === "ui-ux" || agentType === "uiux-designer") {
      const llm = this.deps.llmProvider;
      this.deps.loopHarness.registerAgent(agentType, () => {
        const uiuxAgent = new UIUXProMaxAgent(llm);
        // 适配器：将 UIUXProMaxAgent.review() 包装为 AgentExecutor.execute()
        return {
          async execute(params: {
            step: import("@aicos/loop-engine/types").PlanStep;
            tools: import("@aicos/loop-engine/types").ToolRegistry;
            context: import("@aicos/loop-engine/types").StandardAgentContext;
            previousOutputs: Record<string, { content: string }>;
          }): Promise<{ content: string; role: string }> {
            // 收集上游产物内容
            const deps = params.step.dependsOn ?? [];
            let artifactContent = "";
            for (const depId of deps) {
              const dep = params.previousOutputs[depId];
              if (dep?.content) {
                artifactContent += dep.content;
              }
            }
            // 如果没有上游产物，使用 step 描述作为内容
            if (!artifactContent) {
              artifactContent = params.step.description;
            }
            const result = await uiuxAgent.review({
              artifactPath: params.step.stepId,
              artifactContent,
              taskType: params.context.taskInput,
              designMDX: params.context.designMDX,
            });
            // 将审核结果格式化为文本
            const status = result.passed ? "✅ 通过" : "❌ 未通过";
            let report = `## UI/UX 审核报告 ${status}\n\n`;
            report += `**总分**: ${result.score}/100\n\n`;
            report += `### 维度评分\n`;
            for (const [dimName, dimResult] of Object.entries(result.dimensions)) {
              report += `- **${dimName}**: ${dimResult.score}/20 — ${dimResult.comment}\n`;
            }
            if (result.suggestions.length > 0) {
              report += `\n### 改进建议\n`;
              for (const s of result.suggestions) {
                report += `- [${s.priority}] **${s.type}**: ${s.description}\n  → ${s.suggestion}\n`;
              }
            }
            report += `\n### 综合评价\n${result.reasoning}\n`;
            return { content: report, role: "ui-ux" };
          },
        };
      });
      this.deps.addLog("info", "team", `已注册 Worker: ${agentType} (${role}) → UIUXProMaxAgent (适配)`);
      return;
    }

    // ★ ReviewerAgent：最终审查角色
    if (agentType === "reviewer") {
      this.deps.loopHarness.registerAgent(agentType, () =>
        new ReviewerAgent(this.deps.llmProvider)
      );
      this.deps.addLog("info", "team", `已注册 Worker: ${agentType} (${role}) → ReviewerAgent`);
      return;
    }

    // ★ 兜底：未知角色使用 GenericAgent
    const systemPrompt = this.buildGenericAgentPrompt(agentType, contentType);
    this.deps.loopHarness.registerAgent(agentType, () =>
      new GenericAgent({ systemPrompt, llmProvider: this.deps.llmProvider })
    );
    this.deps.addLog("info", "team", `已注册 Worker: ${agentType} (${role}) → GenericAgent`);
  }

  /** 根据 agentType 构建 GenericAgent 的系统提示（可扩展为部门专属 Prompt） */
  private buildGenericAgentPrompt(agentType: WorkerRole | string, contentType: ContentType): string {
    const base = `你是一名专注于 "${contentType}" 内容产出的专业 Agent（角色: ${agentType}）。\n` +
      `你会收到当前任务描述和上游产物（如果有）。请直接输出高质量的专业产出。\n` +
      `保持输出简洁、结构化，便于下游步骤使用。\n`;

    switch (agentType) {
      case "researcher":
        return base + `你的职责是信息调研：搜索相关事实、数据、案例，并整理成结构化的调研摘要。`;
      case "ui-ux":
      case "uiux-designer":
        return base + `你的职责是视觉设计：根据内容生成卡片/封面/分镜脚本设计建议，包含标题、配色、布局、图片方向。`;
      case "reviewer":
        return base + `你的职责是最终审查：检查内容是否符合目标平台规范、品牌一致性、法律风险，给出通过/修改意见。`;
      default:
        return base + `你的职责是完成分配给你的专业子任务。`;
    }
  }
}
