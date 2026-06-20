/**
 * TeamManager — 团队经理（编排器）
 *
 * 组合 TaskAnalyzer + TeamComposer + WorkerRegistry，
 * 提供 composeTeam() 和 createWorkerFactories() 两个核心方法。
 *
 * 这是纯编排层：
 * - 不执行 LLM 调用
 * - 不创建 Agent 实例
 * - 只做特征提取 + 规则匹配 + 工厂生成
 *
 * 文件位置：packages/loop-engine/src/team/team-manager.ts
 */

import type { ITeam, ITeamManager, TaskFeatures, TeamContext, AgentFactory, WorkerFactoryDeps } from "./types.js";
import { TaskAnalyzer } from "./task-analyzer.js";
import { TeamComposer } from "./team-composer.js";
import { globalWorkerRegistry } from "./worker-registry.js";
import type { IWorkerRegistry } from "./types.js";

// ============================================================
// TeamManager 实现
// ============================================================

/**
 * 团队经理 — 动态团队编排的核心类
 *
 * 使用方式：
 * ```typescript
 * const manager = new TeamManager({ rules: MY_RULES });
 * const team = await manager.composeTeam("写一篇深度技术文章", { departmentId: "content-production" });
 * const factories = manager.createWorkerFactories(team);
 * // factories 可直接用于 LoopHarness.registerAgent()
 * ```
 */
export class TeamManager implements ITeamManager {
  private analyzer: TaskAnalyzer;
  private composer: TeamComposer;
  private registry: IWorkerRegistry;
  private lastTeam: ITeam | null = null;

  constructor(config: {
    rules: import("./types.js").TeamCompositionRule[];
    customAnalyzer?: TaskAnalyzer;
    registry?: IWorkerRegistry;
  }) {
    this.analyzer = config.customAnalyzer ?? new TaskAnalyzer();
    this.composer = new TeamComposer(config.rules);
    this.registry = config.registry ?? globalWorkerRegistry;
  }

  /**
   * 分析任务特征 + 组建团队（核心方法）
   *
   * 流程：
   * 1. TaskAnalyzer.analyze(input) → TaskFeatures
   * 2. TeamComposer.compose(features) → TeamWorkerDef[]
   * 3. 转换为 ITeam 对象
   *
   * @param taskInput 用户的原始任务输入
   * @param context 团队上下文
   * @returns 组装好的团队
   */
  async composeTeam(taskInput: string, context: TeamContext): Promise<ITeam> {
    // Step 1: 提取任务特征
    const features = this.analyzer.analyze(taskInput);

    console.log(`[TeamManager] 任务特征提取完成:`);
    console.log(`  domain=${features.domain}, complexity=${features.complexity}`);
    console.log(`  needsResearch=${features.needsResearch}, hasVisualContent=${features.hasVisualContent}`);
    console.log(`  length=${features.length}, qualityTier=${features.qualityTier}`);
    console.log(`  estimatedSteps=${features.estimatedSteps}, confidence=${features.confidence}`);

    // Step 2: 应用用户偏好覆盖
    const adjustedFeatures = this.applyUserPreferences(features, context.userPreferences);

    // Step 3: 匹配规则，获取团队定义
    const workerDefs = this.composer.compose(adjustedFeatures);

    // Step 4: 转换为完整 ITeam
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const workers = this.composer.defsToWorkers(workerDefs, taskId);

    const matchedRuleId = this.composer.dryRun(adjustedFeatures) ?? "unknown";

    const team: ITeam = {
      id: `team-${taskId.slice(0, 12)}`,
      taskId,
      workers,
      goal: this.generateGoal(adjustedFeatures, taskInput),
      features: adjustedFeatures,
      matchedRuleId,
      createdAt: new Date(),
    };

    this.lastTeam = team;

    console.log(
      `[TeamManager] 团队组建完成: "${team.id}" (${workers.length} 个 Worker, ` +
      `规则="${matchedRuleId}")`
    );

    for (const w of workers) {
      console.log(`  - [${w.required ? "必需" : "可选"}] ${w.role} (${w.agentType})${w.configOverride ? " [自定义配置]" : ""}`);
    }

    return team;
  }

  /**
   * 将团队的 Worker 配置转换为 LoopHarness 所需的工厂函数 Map
   *
   * 注意：此方法返回的是**空的 Map**（只有 key）。
   * 实际的 Factory 函数由调用方在注册 Agent 时提供。
   * 这是因为 TeamManager 不持有 Agent 的具体实现，
   * 工厂函数的实现属于 departments 层或 CLI 层。
   *
   * @param team composeTeam() 返回的团队
   * @returns agentType 字符串 → 空占位（需调用方填充实际 factory）
   */
  createWorkerFactories(team: ITeam): Map<string, AgentFactory> {
    const factories = new Map<string, AgentFactory>();

    for (const worker of team.workers) {
      if (!factories.has(worker.agentType)) {
        factories.set(worker.agentType, null as unknown as AgentFactory);
      }
    }

    return factories;
  }

  /**
   * 返回团队中各 Worker 的 AgentFactory 映射（由 CLI 层调用）
   *
   * 遍历当前团队的 workers，从 WorkerRegistry 获取 defaultFactory，
   * 如果 factory 存在且是函数，包装为 (ctx) => agent 格式返回。
   * writer/critic 的 factory 由 LoopHarness.registerAgent 管理，不在此处返回。
   *
   * @param deps Worker 工厂依赖（LLM Provider + ToolRegistry）
   * @returns agentType → AgentFactory 的映射
   */
  createWorkerFactoriesWithDeps(deps: WorkerFactoryDeps): Record<string, AgentFactory> {
    const team = this.lastTeam;
    if (!team) {
      console.warn("[TeamManager] createWorkerFactoriesWithDeps 调用前未 composeTeam，返回空 Map");
      return {};
    }

    const result: Record<string, AgentFactory> = {};

    for (const worker of team.workers) {
      // writer/critic 由 LoopHarness.registerAgent 管理，跳过
      if (worker.role === "writer" || worker.role === "critic") continue;

      const registration = this.registry.getByAgentType(worker.agentType);
      if (!registration?.defaultFactory) continue;

      if (typeof registration.defaultFactory === "function") {
        result[worker.agentType] = registration.defaultFactory as AgentFactory;
      }
    }

    return result;
  }

  /**
   * 获取内部的分析器（用于自定义规则或调试）
   */
  getAnalyzer(): TaskAnalyzer {
    return this.analyzer;
  }

  /**
   * 获取内部的组合器（用于查看规则等）
   */
  getComposer(): TeamComposer {
    return this.composer;
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /** 应用用户偏好到特征上 */
  private applyUserPreferences(
    features: TaskFeatures,
    prefs?: TeamContext["userPreferences"],
  ): TaskFeatures {
    if (!prefs) return features;

    const adjusted = { ...features };

    if (prefs.preferFastMode) {
      adjusted.qualityTier = "draft";
      adjusted.complexity = "low";
    }
    if (prefs.preferHighQuality) {
      adjusted.qualityTier = "premium";
    }

    return adjusted;
  }

  /** 生成团队目标描述 */
  private generateGoal(features: TaskFeatures, originalInput: string): string {
    const parts: string[] = [`完成任务: "${originalInput.slice(0, 100)}${originalInput.length > 100 ? "..." : ""}"`];

    if (features.needsResearch) parts.push("包含调研环节");
    if (features.hasVisualContent) parts.push("包含视觉设计");
    if (features.qualityTier === "premium") parts.push("高质量产出");

    return parts.join("；");
  }
}
