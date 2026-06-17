// Loop Module — 可复用循环引擎 + 固定评估标准
export { LoopModule } from "./engine.js";
export { SimpleEvolutionAgent } from "./simple-evolution.js";
export type {
  LoopModuleConfig,
  LoopIteration,
  LoopModuleResult,
  IPlannerAgent,
  IGeneratorAgent,
  IEvaluatorAgent,
  IEvolutionAgent,
} from "./engine.js";

export { DEFAULT_WRITING_CRITERIA, formatCriteriaForEvaluator, formatCriteriaForGenerator } from "./grading-criteria.js";
export type {
  GradingCriteria,
  GradingDimension,
  GradingResult,
  StrategicDecision,
  IterationHandoff,
} from "./grading-criteria.js";
