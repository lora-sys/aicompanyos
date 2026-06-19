/**
 * Completion Guard — 目标驱动自验证停止条件体系
 *
 * ADR-004: 从"分数+迭代上限驱动"升级为"目标完成度驱动"
 */
export type { VerificationMethod, CommandVerification, TestVerification, LintVerification, BrowserVerification, FileExistenceVerification, ContentMatchVerification, LLMAssertionVerification, EvidenceRecord, EvidenceContent, CommandEvidence, TestEvidence, LintEvidence, BrowserEvidence, FileEvidence, ContentMatchEvidence, LLMEvidence, AcceptanceGoal, GoalStatus, BlockerReason, StopCondition, AllGoalsVerifiedStop, AnyGoalBlockedStop, MaxEffortExceededStop, ErrorStop, CompletionGuardConfig, CompletionCheckResult, CompletionProgress, VerificationContext, VerificationExecutor, } from "./types.js";
export { DEFAULT_COMPLETION_GUARD_CONFIG } from "./types.js";
export { CompletionGuard } from "./guard.js";
export { VerificationPipeline } from "./pipeline.js";
export { CommandExecutor, TestExecutor, LintExecutor, BrowserExecutor, FileExistenceExecutor, ContentMatchExecutor, LLMAssertionExecutor, } from "./executors.js";
export { GoalTemplateRegistry } from "./goal-templates.js";
export type { GoalTemplate } from "./goal-templates.js";
//# sourceMappingURL=index.d.ts.map