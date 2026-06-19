/**
 * Completion Guard — 目标驱动自验证停止条件体系
 *
 * 核心类型定义 (ADR-004)
 *
 * 设计原则：
 * 1. AcceptanceCriteria 与 GradingCriteria 正交共存 — 前者管"做完了没有"，后者管"做得好不好"
 * 2. 验证方法按确定性从高到低排列：command > test > lint > browser > file > content > llm
 * 3. 停止条件是结构化的联合类型，替代原来的字符串 stopReason
 */
/** 验证方法联合类型 — 按确定性从高到低 */
export type VerificationMethod = CommandVerification | TestVerification | LintVerification | BrowserVerification | FileExistenceVerification | ContentMatchVerification | LLMAssertionVerification;
/** Shell 命令验证（确定性最高） */
export interface CommandVerification {
    type: "command";
    command: string;
    cwd?: string;
    timeoutMs?: number;
    expectExitCode?: number;
}
/** 测试运行器验证 */
export interface TestVerification {
    type: "test";
    pattern: string;
    runner?: string;
    timeoutMs?: number;
}
/** Lint 检查验证 */
export interface LintVerification {
    type: "lint";
    tool: string;
    target?: string;
    failOnWarning?: boolean;
}
/** 浏览器 UI 验证 */
export interface BrowserVerification {
    type: "browser_check";
    url: string;
    selectorExists?: string[];
    screenshotBaseline?: string;
    customAssertion?: string;
}
/** 文件存在性验证 */
export interface FileExistenceVerification {
    type: "file_exists";
    path: string;
    minSizeBytes?: number;
}
/** 内容匹配验证（grep/regex） */
export interface ContentMatchVerification {
    type: "content_match";
    target: string;
    pattern: RegExp | string;
    antiPattern?: RegExp | string;
}
/** LLM 断言验证（最后手段） */
export interface LLMAssertionVerification {
    type: "llm_assertion";
    claim: string;
    targetFiles?: string;
    contextPrompt?: string;
}
/**
 * 验证证据记录 — 每次验证执行产生的确定性证据
 */
export interface EvidenceRecord {
    goalId: string;
    method: VerificationMethod["type"];
    timestamp: string;
    passed: boolean;
    evidence: EvidenceContent;
    durationMs: number;
}
/** 证据内容联合类型 */
export type EvidenceContent = CommandEvidence | TestEvidence | LintEvidence | BrowserEvidence | FileEvidence | ContentMatchEvidence | LLMEvidence;
export interface CommandEvidence {
    type: "command";
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
}
export interface TestEvidence {
    type: "test";
    runner: string;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    failedTestNames: string[];
    coverage?: {
        lines: number;
        functions: number;
        branches: number;
    };
}
export interface LintEvidence {
    type: "lint";
    tool: string;
    errors: number;
    warnings: number;
    issues: Array<{
        file: string;
        line: number;
        rule: string;
        message: string;
    }>;
}
export interface BrowserEvidence {
    type: "browser_check";
    url: string;
    screenshot?: string;
    assertions: Array<{
        selector: string;
        exists: boolean;
    }>;
    consoleErrors?: string[];
}
export interface FileEvidence {
    type: "file_exists";
    matchedPaths: string[];
    fileSize?: number;
}
export interface ContentMatchEvidence {
    type: "content_match";
    matchedLines: Array<{
        file: string;
        line: number;
        content: string;
    }>;
    antiPatternMatched?: boolean;
}
export interface LLMEvidence {
    type: "llm_assertion";
    model: string;
    judgement: "pass" | "fail";
    reasoning: string;
    confidence: number;
}
/** 单个验收目标 */
export interface AcceptanceGoal {
    id: string;
    stepId: string;
    description: string;
    /** 验证方法列表（任一通过即视为该 goal 通过） */
    verifyBy: VerificationMethod[];
    priority: "critical" | "major" | "minor";
    required: boolean;
}
/**
 * 单个验收目标的状态
 *
 * 状态转换：
 *   pending → verifying → verified ✅
 *                       → failed    → verifying (retry)
 *                       → blocked   🛑 (终态)
 *   pending → skipped ⏭️
 */
export type GoalStatus = {
    state: "pending";
    goal: AcceptanceGoal;
} | {
    state: "verifying";
    goal: AcceptanceGoal;
    startedAt: Date;
} | {
    state: "verified";
    goal: AcceptanceGoal;
    evidence: EvidenceRecord;
} | {
    state: "failed";
    goal: AcceptanceGoal;
    evidence: EvidenceRecord;
    retryCount: number;
} | {
    state: "blocked";
    goal: AcceptanceGoal;
    blocker: BlockerReason;
} | {
    state: "skipped";
    goal: AcceptanceGoal;
    reason: string;
};
export interface BlockerReason {
    category: "missing_dependency" | "human_input_required" | "external_service" | "circular_dependency" | "environment" | "unknown";
    description: string;
    suggestedAction?: string;
}
/**
 * 完成守护者的停止条件判决
 *
 * 替代现有的简单 stopReason 字符串为结构化、可追溯的停止决策
 */
export type StopCondition = AllGoalsVerifiedStop | AnyGoalBlockedStop | MaxEffortExceededStop | ErrorStop;
/** 所有目标已验证通过 → 交付 */
export interface AllGoalsVerifiedStop {
    reason: "all_goals_verified";
    verifiedGoals: Array<{
        goalId: string;
        evidence: EvidenceRecord;
    }>;
    totalIterations: number;
    totalDurationMs: number;
}
/** 存在阻塞目标 → 停止并报告 */
export interface AnyGoalBlockedStop {
    reason: "any_goal_blocked";
    verifiedGoals: Array<{
        goalId: string;
        evidence: EvidenceRecord;
    }>;
    blockedGoals: Array<{
        goalId: string;
        blocker: BlockerReason;
    }>;
    pendingGoals: string[];
}
/** 达到最大努力上限 → 停止并汇报剩余目标 */
export interface MaxEffortExceededStop {
    reason: "max_effort_exceeded";
    verifiedGoals: Array<{
        goalId: string;
        evidence: EvidenceRecord;
    }>;
    remainingGoals: Array<{
        goalId: string;
        lastStatus: "failed" | "pending" | "verifying";
        failureSummary?: string;
    }>;
    effortSpent: number;
    maxEffort: number;
}
/** 执行错误 → 停止 */
export interface ErrorStop {
    reason: "error";
    error: Error;
    goalSnapshot: Array<{
        goalId: string;
        status: GoalStatus["state"];
    }>;
}
export interface CompletionGuardConfig {
    /** 最大努力上限（替代简单 maxIterations 的主控制变量） */
    maxEffort: number;
    /** 单个 goal 最大重试次数 */
    maxRetriesPerGoal: number;
    /** 验证并行度 */
    verificationConcurrency: number;
    /** 是否缓存已验证通过的 goals（产出未变化时跳过重新验证） */
    cacheVerifiedGoals: boolean;
    /** 单个验证任务超时 ms */
    verificationTimeoutMs: number;
    /** LLM Provider 函数 — 用于 LLMAssertionExecutor 的最后手段验证 */
    llmProvider?: (prompt: string) => Promise<string>;
    /**
     * 最低质量分数要求
     *
     * 当设置后，all_goals_verified 停止条件需要同时满足：
     * - 所有结构目标 verified
     * - 最新质量分数 >= minQualityScore
     *
     * 这解决了「仅1轮迭代就停止」的问题：即使文件存在+格式正确，
     * 低质量产出仍会继续迭代直到达到质量门槛。
     *
     * 默认值: undefined（不启用质量门控，保持向后兼容）
     */
    minQualityScore?: number;
}
export declare const DEFAULT_COMPLETION_GUARD_CONFIG: CompletionGuardConfig;
/** CompletionGuard.check() 返回值 */
export interface CompletionCheckResult {
    checkedGoals: Array<{
        goalId: string;
        previousStatus: GoalStatus["state"];
        newStatus: GoalStatus["state"];
    }>;
    stopCondition: StopCondition | null;
    evidences: EvidenceRecord[];
    progress: CompletionProgress;
}
/** 完成进度摘要 */
export interface CompletionProgress {
    total: number;
    verified: number;
    failed: number;
    pending: number;
    blocked: number;
    progressPercent: number;
    effortRemaining: number;
}
/** 验证上下文 — 传递给每个执行器的环境信息 */
export interface VerificationContext {
    projectRoot: string;
    outputFiles?: string[];
    devServerUrl?: string;
    env?: Record<string, string>;
}
/** 验证执行器接口 — 所有验证执行器的统一契约 */
export interface VerificationExecutor {
    readonly methodType: VerificationMethod["type"];
    execute(method: VerificationMethod, context: VerificationContext): Promise<EvidenceRecord>;
}
//# sourceMappingURL=types.d.ts.map