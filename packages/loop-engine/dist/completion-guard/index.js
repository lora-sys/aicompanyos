/**
 * Completion Guard — 目标驱动自验证停止条件体系
 *
 * ADR-004: 从"分数+迭代上限驱动"升级为"目标完成度驱动"
 */
export { DEFAULT_COMPLETION_GUARD_CONFIG } from "./types.js";
// 核心类
export { CompletionGuard } from "./guard.js";
// 验证流水线
export { VerificationPipeline } from "./pipeline.js";
// 内置执行器
export { CommandExecutor, TestExecutor, LintExecutor, BrowserExecutor, FileExistenceExecutor, ContentMatchExecutor, LLMAssertionExecutor, } from "./executors.js";
// 目标模板注册表
export { GoalTemplateRegistry } from "./goal-templates.js";
//# sourceMappingURL=index.js.map