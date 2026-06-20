/**
 * Content Production Department — 团队经理
 *
 * 实现 ITeamManager 接口的内容产出部版本。
 *
 * 职责：
 * 1. 使用通用的 TaskAnalyzer 提取任务特征
 * 2. 使用内容部门专属的 CONTENT_TEAM_RULES 匹配规则
 * 3. 将团队结果与部门的 DepartmentConfig 关联
 * 4. 支持将 Worker 注册到全局 Registry
 *
 * 文件位置：packages/departments/content-production/src/team/content-team-manager.ts
 */

import type {
  ITeamManager,
  ITeam,
  TeamContext,
  TaskFeatures,
  AgentFactory,
  IWorkerRegistry,
  WorkerFactoryDeps,
  WorkerRegistration,
} from "@aicos/loop-engine";
import { TeamManager } from "@aicos/loop-engine";
import { CONTENT_TEAM_RULES } from "./content-rules.js";
import { createContentWorkerRegistrations, registerContentWorkers } from "./content-workers.js";
import type { ContentTeamConfig, ContentTeamContext } from "./types.js";
import { DEFAULT_CONTENT_TEAM_CONFIG } from "./types.js";

// ============================================================
// ContentTeamManager 实现
// ============================================================

/**
 * 内容产出部团队经理
 *
 * 继承通用 TeamManager，注入内容部门专属规则和配置。
 *
 * 使用方式：
 * ```typescript
 * const mgr = new ContentTeamManager({ contentType: "seed" });
 * const team = await mgr.composeTeam("写一篇夏日防晒种草笔记", {});
 * // team.workers → [writer, critic, uiux-designer]
 *
 * // 注册 Workers 到全局 Registry
 * mgr.registerWorkers(globalWorkerRegistry);
 * ```
 */
export class ContentTeamManager implements ITeamManager {
  private inner: TeamManager;
  private teamConfig: ContentTeamConfig;
  private contentType: import("@aicos/loop-engine").ContentType;
  /** 最近一次组建的团队（供 createWorkerFactoriesWithDeps 使用） */
  private lastTeam: ITeam | null = null;
  /** Worker 注册表引用（供 createWorkerFactoriesWithDeps 查找 factory） */
  private registry: IWorkerRegistry | null = null;

  constructor(config: {
    contentType: import("@aicos/loop-engine").ContentType;
    teamConfig?: Partial<ContentTeamConfig>;
  }) {
    this.contentType = config.contentType;
    this.teamConfig = { ...DEFAULT_CONTENT_TEAM_CONFIG, ...config.teamConfig };
    this.inner = new TeamManager({
      rules: CONTENT_TEAM_RULES,
    });
  }

  /**
   * 分析任务特征 + 组建团队（实现 ITeamManager 接口）
   *
   * 与通用 TeamManager 的区别：
   * - 自动注入 contentType 到 context
   * - 应用部门级用户偏好（如 targetPlatform）
   * - 日志中包含部门标识
   */
  async composeTeam(taskInput: string, context?: TeamContext): Promise<ITeam> {
    // 构建完整的上下文（合并部门和调用方传入的参数）
    const fullContext: TeamContext = {
      ...context,
      departmentId: "content-production",
      availableRoles: ["writer", "critic", "researcher", "uiux-designer", "reviewer"],
      userPreferences: {
        ...context?.userPreferences,
      },
    };

    console.log(
      `[ContentTeamManager] [${this.contentType}] 开始组队: "${taskInput.slice(0, 80)}..."`
    );

    // 委托给内部 TeamManager
    const team = await this.inner.composeTeam(taskInput, fullContext);

    // 保存最近一次组建的团队（供 createWorkerFactoriesWithDeps 使用）
    this.lastTeam = team;

    console.log(
      `[ContentTeamManager] 组队完成: ${team.workers.length} 人, ` +
      `规则="${team.matchedRuleId}", domain=${team.features.domain}`
    );

    return team;
  }

  /**
   * 将团队的 Worker 配置转换为工厂函数 Map
   *
   * 返回的 Map 包含此团队的 agentType 列表，
   * 实际 Factory 由调用方（CLI / LoopHarness）注入。
   */
  createWorkerFactories(team: ITeam): Map<string, AgentFactory> {
    return this.inner.createWorkerFactories(team);
  }

  /**
   * 返回团队中各 Worker 的 AgentFactory 映射（由 CLI 层调用）
   *
   * 遍历当前团队的 workers，从 WorkerRegistry 获取 defaultFactory，
   * 如果 factory 存在且不是 null，包装为 (ctx) => agent 格式返回。
   * writer/critic 的 factory 由 LoopHarness.registerAgent 管理，不在此处返回。
   *
   * @param deps Worker 工厂依赖（LLM Provider + ToolRegistry）
   * @returns agentType → AgentFactory 的映射
   */
  createWorkerFactoriesWithDeps(deps: WorkerFactoryDeps): Record<string, AgentFactory> {
    const team = this.lastTeam;
    if (!team) {
      console.warn("[ContentTeamManager] createWorkerFactoriesWithDeps: 尚未组建团队，返回空映射");
      return {};
    }

    const factories: Record<string, AgentFactory> = {};

    for (const worker of team.workers) {
      // writer/critic 由 LoopHarness.registerAgent 管理，跳过
      if (worker.agentType === "writer" || worker.agentType === "critic") continue;

      // 从 WorkerRegistry 查找注册信息
      const registration = this.registry?.getByAgentType(worker.agentType);
      if (!registration || registration.defaultFactory === null) continue;

      const factory = registration.defaultFactory;

      // 区分两种 factory 类型：AgentFactory（直接）或 (deps) => AgentExecutor（需注入依赖）
      if (typeof factory === "function" && factory.length === 1) {
        // (deps: WorkerFactoryDeps) => AgentExecutor — 需要注入依赖
        const agent = (factory as (d: WorkerFactoryDeps) => import("@aicos/loop-engine").AgentExecutor)(deps);
        // 包装为 AgentFactory 格式：(ctx) => agent
        factories[worker.agentType] = () => agent;
      } else if (typeof factory === "function") {
        // AgentFactory — 直接使用
        factories[worker.agentType] = factory as AgentFactory;
      }

      console.log(
        `[ContentTeamManager] createWorkerFactoriesWithDeps: ${worker.agentType} → factory 已注册`
      );
    }

    return factories;
  }

  /**
   * 注册内容产出部的所有 Worker 到指定 Registry
   *
   * @param registry 目标 Registry（默认使用全局实例需手动导入）
   */
  registerWorkers(registry: IWorkerRegistry): void {
    this.registry = registry;
    registerContentWorkers(registry);
    console.log(
      `[ContentTeamManager] 已注册 ${createContentWorkerRegistrations().length} 个 Worker 到 Registry`
    );
  }

  // ============================================================
  // 便捷访问方法
  // ============================================================

  /** 获取内部的 TaskAnalyzer（用于调试或预检） */
  getAnalyzer() {
    return this.inner.getAnalyzer();
  }

  /** 获取内部的 TeamComposer（用于查看规则） */
  getComposer() {
    return this.inner.getComposer();
  }

  /** 获取当前团队配置 */
  getTeamConfig(): Readonly<ContentTeamConfig> {
    return this.teamConfig;
  }

  /** 获取关联的内容格式 */
  getContentType(): import("@aicos/loop-engine").ContentType {
    return this.contentType;
  }
}
