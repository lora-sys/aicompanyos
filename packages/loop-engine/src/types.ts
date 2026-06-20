// Loop 状态枚举
export enum LoopState {
  IDLE = "idle",
  INTERROGATING = "interrogating",
  PLANNING = "planning",
  EXECUTING = "executing",
  VERIFYING = "verifying",
  EVOLVING = "evolving",
  DONE = "done",
}

// 状态转换定义（联合类型，表示所有合法的转换）
export type StateTransition =
  | { from: LoopState.IDLE; to: LoopState.INTERROGATING }
  | { from: LoopState.INTERROGATING; to: LoopState.PLANNING }
  | { from: LoopState.PLANNING; to: LoopState.EXECUTING }
  | { from: LoopState.EXECUTING; to: LoopState.VERIFYING }
  | { from: LoopState.VERIFYING; to: LoopState.EVOLVING }
  | { from: LoopState.EVOLVING; to: LoopState.DONE }
  | { from: LoopState.VERIFYING; to: LoopState.PLANNING }; // Replan

// 状态转换事件
export interface StateChangeEvent {
  previousState: LoopState;
  nextState: LoopState;
  timestamp: Date;
  reason?: string;
  trigger?: string;
}

// 转换守卫函数类型
export type TransitionGuard = (
  transition: StateTransition,
  context: LoopContext
) => boolean | Promise<boolean>;

// 状态钩子函数类型
export type StateHook = (event: StateChangeEvent, context: LoopContext) => void | Promise<void>;

// Loop 上下文（运行时状态）
// #5.1 类型安全改进：移除 [key:string]:unknown，所有字段显式声明
// 动态扩展数据走 extensions 兜底字段，避免全量 unknown 破坏类型安全
export interface LoopContext {
  // === 核心字段 ===
  taskId: string;
  taskInput: string;
  retryCount: number;
  consensusRound: number;

  // === 拷问阶段 ===
  interrogationResults?: Record<string, string>;

  // === 规划阶段 ===
  plan?: ExecutionPlan;
  currentStep?: number;

  // === 执行阶段 ===
  artifacts?: string[];
  evidenceChainId?: string;

  // === Agent 执行上下文（#2.4 StandardAgentContext 来源）===
  selfExperience?: {
    lessons?: string[];
    content?: string;
    pattern?: string;
    type?: "success" | "learning";
  };
  designMDX?: string;           // design.mdx 内容
  userPreferences?: Record<string, string>; // 用户偏好
  uiuxGuidance?: unknown;        // UI-UX Pro-Max 输出
  previousOutputs?: Record<string, { content: string }>; // 前序 Agent 输出

  // === 动态扩展入口（唯一允许 unknown 的地方）===
  extensions?: Record<string, unknown>;
}

// 已知的 Worker 角色类型（编译期可检查）；动态团队可扩展为任意 string
import type { WorkerRole as WorkerRoleBase } from "./team/types.js";
export type WorkerRole = WorkerRoleBase;

// 任务类型档位（用于阈值自适应选择）
export type TaskProfile = "technical-blog" | "tutorial" | "design-doc" | "code-review" | "generic";

// 执行计划结构
export interface ExecutionPlan {
  id: string;
  steps: PlanStep[];
  createdAt: Date;
  /** 任务类型档位，用于选取对应的阈值配置 */
  taskProfile?: TaskProfile;
}

export interface PlanStep {
  stepId: string;
  /** 执行该步骤的 Agent 类型（已知角色编译期可检查，动态团队可扩展为任意 string） */
  agentType: WorkerRole | string;
  description: string;
  expectedOutput: string;
  toolsNeeded: string[];
  /** 可选：依赖的上游 stepId，用于构建执行上下文 */
  dependsOn?: string[];
  /** ★ ADR-004: 扩展元数据（用于存储 AcceptanceGoals 等） */
  metadata?: Record<string, unknown>;
}
