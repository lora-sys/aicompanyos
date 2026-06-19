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
export const DEFAULT_COMPLETION_GUARD_CONFIG = {
    maxEffort: 20,
    maxRetriesPerGoal: 3,
    verificationConcurrency: 3,
    cacheVerifiedGoals: true,
    verificationTimeoutMs: 30000,
    // minQualityScore: 不设默认值，由调用方按需配置
};
//# sourceMappingURL=types.js.map