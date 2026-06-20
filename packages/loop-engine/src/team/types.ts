/**
 * Team Architecture — 动态团队抽象层类型定义
 *
 * 核心设计：
 * - 团队是任务的函数，不是 contentType 的函数
 * - TaskAnalyzer 提取任务特征 → TeamComposer 根据规则匹配 → 动态 Agent 组合
 * - ITeamManager 是纯编排层，不含业务逻辑
 *
 * 文件位置：packages/loop-engine/src/team/types.ts
 */

// ============================================================
// 1. Worker 角色
// ============================================================

/**
 * Worker 角色枚举 — 团队中每个成员的角色类型
 *
 * 扩展性：未来可增加 "translator", "fact_checker", "seo_specialist" 等
 */
export type WorkerRole =
  | "writer"         // 内容生成（核心）
  | "critic"         // 质量审核（核心）
  | "researcher"     // 信息调研（可选）
  | "uiux-designer"  // 视觉设计（可选）
  | "reviewer";      // 最终审查（可选）

/** 所有支持的 Worker 角色 */
export const WORKER_ROLES: readonly WorkerRole[] = [
  "writer",
  "critic",
  "researcher",
  "uiux-designer",
  "reviewer",
] as const;

// ============================================================
// 2. IWorker — 团队成员描述
// ============================================================

/**
 * Worker 配置覆盖 — 用于定制化单个 Worker 在特定任务中的行为
 */
export interface WorkerConfig {
  /** 覆盖默认 System Prompt */
  systemPrompt?: string;
  /** 额外约束参数 */
  constraints?: Record<string, unknown>;
  /** 该角色的质量门槛（覆盖全局配置） */
  qualityThreshold?: number;
  /** 最大迭代次数 */
  maxRounds?: number;
  /** 调研深度：light(快速搜索) / deep(多源交叉验证) */
  researchDepth?: "light" | "deep";
}

/**
 * 团队成员 — 包装现有 Agent 为统一的 Worker 接口
 *
 * 设计原则：IWorker 不包含 Agent 实例，只包含**描述性配置**。
 * 实际 Agent 的创建由 LoopHarness 的工厂机制负责。
 */
export interface IWorker {
  /** 唯一标识 (如 "writer-primary") */
  id: string;
  /** 角色类型 */
  role: WorkerRole;
  /**
   * 对应 LoopHarness.registerAgent() 的 agentType 字符串
   * 如 "writer", "critic", "researcher" 等（已知角色编译期可检查）
   */
  agentType: WorkerRole | string;
  /** 此 Worker 在该任务中的专属配置覆盖 */
  configOverride?: WorkerConfig;
  /** 是否为必需角色（缺失时报错 vs 跳过） */
  required: boolean;
}

// ============================================================
// 3. TaskFeatures — 任务特征（TaskAnalyzer 输出）
// ============================================================

/**
 * 内容领域分类
 */
export type ContentDomain =
  | "tech"          // 技术/编程/AI/架构
  | "lifestyle"     // 生活/穿搭/美食/旅行
  | "finance"       // 金融/投资/商业
  | "education"     // 教育/学习/教程
  | "general";      // 通用（无法识别时）

/**
 * 任务特征 — TaskAnalyzer 从 taskInput 中提取的结构化信息
 *
 * 这是团队组合的决策依据。同一个 contentType 的不同任务
 * 可能产生完全不同的 TaskFeatures，从而组成不同的团队。
 */
export interface TaskFeatures {
  // === 内容特征 ===
  /** 内容领域 */
  domain: ContentDomain;
  /** 是否需要外部调研（搜索/数据收集） */
  needsResearch: boolean;
  /** 是否有视觉设计需求（配图/卡片/UI） */
  hasVisualContent: boolean;

  // === 篇幅估计 ===
  /** 预估内容长度 */
  length: "short" | "medium" | "long";

  // === 质量要求 ===
  /** 质量档次 */
  qualityTier: "draft" | "standard" | "premium";

  // === 复杂度指标 ===
  /** 综合复杂度 */
  complexity: "low" | "medium" | "high";
  /** 预估需要的 Agent Step 数 */
  estimatedSteps: number;

  // === 元数据 ===
  /** 特征提取置信度 (0-1) */
  confidence: number;
  /** 命中的规则 ID 列表（用于调试） */
  matchedRuleIds?: string[];
}

/** 篇幅阈值常量 */
export const LENGTH_THRESHOLDS = {
  shortChars: 500,
  mediumChars: 2000,
} as const;

// ============================================================
// 4. ITeam — 团队
// ============================================================

/**
 * 团队 — 一次任务执行的 Agent 集合
 *
 * 由 TeamManager.composeTeam() 创建，
 * 包含触发此团队组合的任务特征（用于调试和日志）。
 */
export interface ITeam {
  /** 团队唯一标识 */
  id: string;
  /** 关联的任务 ID */
  taskId: string;
  /** 成员列表 */
  workers: IWorker[];
  /** 团队目标（人类可读的描述） */
  goal: string;
  /** 触发此团队组合的任务特征 */
  features: TaskFeatures;
  /** 命中的规则 ID */
  matchedRuleId: string;
  /** 创建时间 */
  createdAt: Date;
}

// ============================================================
// 5. TeamCompositionRule — 组合规则
// ============================================================

/**
 * 团队成员定义（规则内部使用）
 */
export interface TeamWorkerDef {
  role: WorkerRole;
  priority: "essential" | "optional";
  configOverride?: WorkerConfig;
}

/**
 * 团队组合规则 — TeamComposer 的匹配单元
 *
 * 规则按 priority 升序排序，第一个命中的规则决定团队组合。
 * 必须有一条兜底规则（match 始终返回 true）。
 */
export interface TeamCompositionRule {
  /** 规则唯一标识 */
  id: string;
  /** 匹配条件（返回 true 表示此规则适用于当前任务特征） */
  match: (features: TaskFeatures) => boolean;
  /** 命中后组成的团队 */
  team: TeamWorkerDef[];
  /** 为什么这样组队（用于日志和调试） */
  reasoning: string;
  /**
   * 匹配优先级（数字越小越优先匹配）
   * - 特殊规则用 10-50
   * - 一般规则用 51-100
   * - 默认兜底用 999
   */
  priority: number;
}

// ============================================================
// 6. ITeamManager — 团队经理接口
// ============================================================

/**
 * Agent 工厂函数签名
 * 与 LoopHarness.registerAgent() 的 factory 参数兼容
 */
export type AgentFactory = (
  ctx: import("../orchestrator/types.js").OrchestratorAgentContext,
) =>
  | import("../loop-module/index.js").IGeneratorAgent<any, any>
  | import("../loop-module/index.js").IEvaluatorAgent
  | import("../orchestrator/types.js").AgentExecutor;

/**
 * Worker 工厂依赖（由 CLI 层注入）
 *
 * 用于 WorkerRegistration.defaultFactory 中接收依赖的工厂函数签名。
 * 当 defaultFactory 是函数时，它接收 WorkerFactoryDeps 并返回 AgentExecutor。
 */
export interface WorkerFactoryDeps {
  llmProvider: import("../interrogate/types.js").LLMProvider;
  toolRegistry: import("../tool-registry/registry.js").ToolRegistry;
}

/**
 * 团队上下文 — composeTeam() 的环境参数
 */
export interface TeamContext {
  /** 内容类型（如果有） */
  contentType?: import("./../department/types.js").ContentType;
  /** 该部门支持的所有可用角色 */
  availableRoles: WorkerRole[];
  /** 部门标识 */
  departmentId: string;
  /** 用户自定义偏好（可选） */
  userPreferences?: {
    preferFastMode?: boolean;
    preferHighQuality?: boolean;
    excludeRoles?: WorkerRole[];
  };
}

/**
 * 团队经理 — 纯编排层的核心接口
 *
 * 职责：
 * 1. 分析任务特征 (TaskAnalyzer)
 * 2. 匹配组合规则 (TeamComposer)
 * 3. 生成工厂函数 (与 LoopHarness 集成)
 *
 * 设计原则：
 * - 不执行任何 LLM 调用（TaskAnalyzer 用规则引擎）
 * - 不直接创建 Agent 实例（只返回工厂函数）
 * - 所有业务逻辑在部门子类中实现
 */
export interface ITeamManager {
  /**
   * 分析任务特征 + 组建团队
   *
   * @param taskInput 用户的原始任务输入
   * @param context 团队上下文（部门、可用角色等）
   * @returns 组装好的团队（包含 Worker 配置列表）
   */
  composeTeam(taskInput: string, context: TeamContext): Promise<ITeam>;

  /**
   * 将团队的 Worker 配置转换为 LoopHarness 所需的工厂函数 Map
   *
   * 这是与 LoopHarness 的唯一集成点。
   * 返回的 Map 可以直接用于 registerAgent() 调用。
   *
   * @param team composeTeam() 返回的团队
   * @returns agentType → Factory 函数的映射
   */
  createWorkerFactories(team: ITeam): Map<string, AgentFactory>;

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
  createWorkerFactoriesWithDeps?(deps: WorkerFactoryDeps): Record<string, AgentFactory>;
}

// ============================================================
// 7. IWorkerRegistry — Worker 注册表接口
// ============================================================

/**
 * Worker 注册项
 */
export interface WorkerRegistration {
  id: string;
  role: WorkerRole;
  agentType: WorkerRole | string;
  /**
   * 默认工厂函数
   *
   * 支持两种形式：
   * 1. AgentFactory — 直接的工厂函数（writer/critic 由 LoopHarness 管理）
   * 2. (deps: WorkerFactoryDeps) => AgentExecutor — 接收依赖的工厂函数（researcher/ui-ux/reviewer 等）
   * 3. null — 无工厂（由 LoopHarness.registerAgent 管理）
   */
  defaultFactory: AgentFactory | ((deps: WorkerFactoryDeps) => import("../orchestrator/types.js").AgentExecutor) | null;
  /** 此 Worker 支持的 contentType 列表（空 = 全部支持） */
  supportedContentTypes?: Array<string>;
  /** 描述 */
  description?: string;
}

/**
 * Worker 注册表 — 管理所有可用的 Worker 类型
 *
 * 部门在初始化时将自己的 Worker 注册到全局注册表，
 * TeamComposer 从中选择合适的 Worker 组成团队。
 */
export interface IWorkerRegistry {
  /** 注册一个 Worker */
  register(registration: WorkerRegistration): void;
  /** 根据 role 获取所有匹配的 Worker */
  getWorkersByRole(role: WorkerRole): WorkerRegistration[];
  /** 获取所有已注册的 Worker */
  getAllWorkers(): WorkerRegistration[];
  /** 根据 agentType 查找 Worker */
  getByAgentType(agentType: WorkerRole | string): WorkerRegistration | undefined;
  /** 检查某角色是否有可用 Worker */
  hasRole(role: WorkerRole): boolean;
}
