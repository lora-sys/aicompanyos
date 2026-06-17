// @aicos/loop-engine/types — 核心类型子路径
// 用途：subagents、evolution 等仅需要类型定义的包从此路径导入，避免拉入运行时代码

export {
  LoopState,
  type StateTransition,
  type StateChangeEvent,
  type TransitionGuard,
  type StateHook,
  type LoopContext,
  type ExecutionPlan,
  type PlanStep,
  type TaskProfile,
} from "./types.js";

export type { LLMProvider } from "./interrogate/types.js";
export type { StandardAgentContext, AgentExecutor } from "./orchestrator/types.js";
export type { ToolRegistry } from "./tool-registry/registry.js";
export type {
  IPlannerAgent,
  IGeneratorAgent,
  IEvaluatorAgent,
  IEvolutionAgent,
  IterationHandoff,
  GradingCriteria,
  GradingResult,
  StrategicDecision,
} from "./loop-module/index.js";
