// Loop Engine Core
// 状态机、拷问、计划、执行编排、共识锁、验证、回滚

// 类型导出
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

// 核心类导出
export { LoopStateMachine } from "./state-machine.js";

// Tool Registry 导出
export {
  // 核心类型
  ToolCategory,
  type ToolDefinition,
  type ToolExecuteRequest,
  type ToolExecuteResult,
  type ToolHandler,
  // 主类
  ToolRegistry,
} from "./tool-registry/registry.js";

// 适配器导出
export { MCPToolsAdapter } from "./tool-registry/mcp-tools-adapter.js";
export { SkillToolsAdapter } from "./tool-registry/skill-tools-adapter.js";

// Local Tools 导出
export {
  createLocalToolsHandler,
  getLocalToolDefinitions,
} from "./tool-registry/local-tools.js";

// 拷问引擎导出
export {
  InterrogateEngine,
} from "./interrogate/engine.js";
export {
  type InterrogationQuestion,
  type InterrogationSession,
  type LLMProvider,
} from "./interrogate/types.js";

// 规划引擎导出
export {
  PlanEngine,
} from "./plan/engine.js";
export {
  type PlanGenerationInput,
  type PlanGenerationResult,
} from "./plan/types.js";

// 编排器导出
export {
  ExecutionOrchestrator,
} from "./orchestrator/engine.js";
export {
  type StepExecutionResult,
  type OrchestratorConfig,
  type AgentExecutor,
  type StandardAgentContext,
  type OrchestratorAgentContext,
  type EvidenceChainRef,
  type MemoryManagerRef,
} from "./orchestrator/types.js";

// 共识锁导出
export {
  ConsensusLock,
} from "./consensus/engine.js";
export {
  ConsensusVote,
  type ConsensusResult,
  type ConsensusConfig,
} from "./consensus/types.js";

// 验证引擎导出
export {
  VerifyEngine,
} from "./verify/engine.js";
export {
  type VerifyInput,
  type VerifyResult,
  type VerifyConfig,
} from "./verify/types.js";

// 回滚管理器导出
export {
  RollbackManager,
} from "./rollback/engine.js";
export {
  type RollbackPoint,
  type RollbackResult,
} from "./rollback/types.js";

// 输出产物管理器导出
export {
  ArtifactManager,
} from "./output/manager.js";
export {
  type Artifact,
  type ArtifactType,
  type ArtifactManagerConfig,
} from "./output/types.js";

// 真实 LLM Provider 导出（基于 pi-ai）
export { PiAILLMProvider } from "./llm/pi-ai-provider.js";

// LLM 结构化输出工具导出（#7.1）
export {
  LLMStructuredOutput,
  createLLMParser,
  extractJSON,
  FallbackStrategy,
} from "./utils/llm-structured-output.js";
export type {
  ParseResult,
  ParseSuccess,
  ParseFailure,
  JSONExtractResult,
  JSONExtractSource,
} from "./utils/llm-structured-output.js";

// 错误处理工具导出（#4.x retry + 分类）
export {
  TransientError,
  PermanentError,
  ErrorClassifier,
  defaultClassifier,
} from "./utils/error-classifier.js";
export type { ErrorClassification } from "./utils/error-classifier.js";

export {
  retryWithBackoff,
  CircuitBreaker,
} from "./utils/retry.js";
export type {
  RetryOptions,
  CircuitBreakerOptions,
} from "./utils/retry.js";

// Loop Engineering Harness 导出（双层嵌套循环）
export {
  LoopHarness,
} from "./loop-harness/index.js";
export type {
  LoopHarnessConfig,
  DynamicExample,
  StepLoopIteration,
  StepLoopResult,
  HarnessExecutionResult,
} from "./loop-harness/index.js";

// 统一阈值配置导出
export { THRESHOLDS, THRESHOLD_PROFILES, getThresholdsForProfile } from "./config/thresholds.js";
export type { ThresholdKey, ThresholdProfile } from "./config/thresholds.js";

// Loop Module 导出（可复用: Planner→Generator→Evaluator+Evolution）
export {
  LoopModule,
  SimpleEvolutionAgent,
  DEFAULT_WRITING_CRITERIA,
  formatCriteriaForEvaluator,
  formatCriteriaForGenerator,
} from "./loop-module/index.js";
export type {
  LoopModuleConfig,
  LoopIteration as LoopModuleIteration,
  LoopModuleResult,
  GradingCriteria,
  GradingDimension,
  GradingResult,
  StrategicDecision,
  IterationHandoff,
  IPlannerAgent,
  IGeneratorAgent,
  IEvaluatorAgent,
  IEvolutionAgent,
} from "./loop-module/index.js";

// ★ ADR-004: Completion Guard — 目标驱动自验证停止条件体系
export {
  CompletionGuard,
  VerificationPipeline,
  CommandExecutor,
  TestExecutor,
  LintExecutor,
  BrowserExecutor,
  FileExistenceExecutor,
  ContentMatchExecutor,
  LLMAssertionExecutor,
  DEFAULT_COMPLETION_GUARD_CONFIG,
} from "./completion-guard/index.js";
export type {
  // 验证方法
  VerificationMethod,
  CommandVerification,
  TestVerification,
  LintVerification,
  BrowserVerification,
  FileExistenceVerification,
  ContentMatchVerification,
  LLMAssertionVerification,
  // 证据
  EvidenceRecord,
  EvidenceContent,
  CommandEvidence,
  TestEvidence,
  LintEvidence,
  BrowserEvidence,
  FileEvidence,
  ContentMatchEvidence,
  LLMEvidence,
  // 目标与状态
  AcceptanceGoal,
  GoalStatus,
  BlockerReason,
  // 停止条件
  StopCondition,
  AllGoalsVerifiedStop,
  AnyGoalBlockedStop,
  MaxEffortExceededStop,
  ErrorStop,
  // 配置与结果
  CompletionGuardConfig,
  CompletionCheckResult,
  CompletionProgress,
  VerificationContext,
  VerificationExecutor,
} from "./completion-guard/index.js";

// ★ ADR-005: Department Architecture — 部门制抽象层
export {
  CONTENT_TYPES,
} from "./department/index.js";
export type {
  ContentType,
  PlatformType,
  WriterConstraints,
  CriticDimension,
  StyleGuide,
  AgentProfile,
  DepartmentGoalTemplate,
  OutputPostProcessor,
  PlatformAdapterProcessor,
  MetadataInjector,
  FormatConverter,
  QualityCheckerProcessor,
  OutputPipelineConfig,
  DimensionWeightOverride,
  ExtraDimension,
  QualityGateConfig,
  DepartmentConfig,
  ProcessedOutput,
} from "./department/index.js";

// ★ Dynamic Team Architecture — 动态团队抽象层
export {
  TaskAnalyzer,
  TeamComposer,
  TeamManager,
  WorkerRegistry,
  globalWorkerRegistry,
} from "./team/index.js";
export type {
  WorkerRole,
  IWorker,
  WorkerConfig,
  TaskFeatures,
  ContentDomain,
  ITeam,
  TeamCompositionRule,
  TeamWorkerDef,
  ITeamManager,
  TeamContext,
  AgentFactory,
  IWorkerRegistry,
  WorkerRegistration,
} from "./team/index.js";
export { WORKER_ROLES, LENGTH_THRESHOLDS } from "./team/index.js";
