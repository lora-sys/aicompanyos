/**
 * 统一阈值配置
 *
 * 层级关系（从松到严）：
 * VerifyEngine (粗筛底线) < ConsensusLock (共识通过) < CriticAgent/GradingCriteria (单次审核) < Excellence (优秀停止)
 *
 * 各阈值的含义和设计理由：
 * - VERIFY_BASELINE (60): 全局质量门控最低线 — 低于此值说明产物有根本性问题
 * - CONSENSUS_PASS (70): 多票制共识通过线 — 单视角可能有偏差，共识可稍宽松
 * - EVALUATOR_PASS (75): 单次审核通过线 — Evaluator 标准定义的及格线
 * - EXCELLENCE_STOP (90): 优秀停止迭代线 — 达到此值认为无需继续改进
 *
 * v0.2.0: 新增 THRESHOLD_PROFILES — 基于任务类型的预设阈值档位。
 * 不同类型任务对质量的要求不同，使用统一阈值会导致教程类任务过度迭代
 * 或设计文档类任务过早停止。
 */
/** 全局默认阈值 */
export const THRESHOLDS = {
    /** VerifyEngine: 全局验证底线 */
    VERIFY_BASELINE: 60,
    /** ConsensusLock: 共识投票通过线 */
    CONSENSUS_PASS: 70,
    /** CriticAgent / GradingCriteria: 单次审核通过线 */
    EVALUATOR_PASS: 75,
    /** GradingCriteria: 优秀停止迭代线 */
    EXCELLENCE_STOP: 90,
};
export const THRESHOLD_PROFILES = {
    "technical-blog": {
        label: "技术博客",
        evaluatorPass: 75,
        excellenceStop: 90,
        consensusPass: 70,
        verifyBaseline: 60,
    },
    "tutorial": {
        label: "教程",
        evaluatorPass: 70, // 教程及格线稍低 — 清晰易懂即可
        excellenceStop: 85, // 教程不需要 90 分才停 — 实用优先
        consensusPass: 65,
        verifyBaseline: 55,
    },
    "design-doc": {
        label: "设计文档",
        evaluatorPass: 80, // 设计文档要求更严谨
        excellenceStop: 88, // 设计决策的合理性比原创性重要
        consensusPass: 72,
        verifyBaseline: 62,
    },
    "code-review": {
        label: "代码审查",
        evaluatorPass: 82, // 代码审查高标准
        excellenceStop: 92, // 代码问题零容忍
        consensusPass: 75,
        verifyBaseline: 65,
    },
    "generic": {
        label: "通用",
        evaluatorPass: 70,
        excellenceStop: 82, // 最宽松 — 不确定类型时保守迭代
        consensusPass: 65,
        verifyBaseline: 55,
    },
};
/**
 * 根据任务类型获取阈值配置
 *
 * @param profile 任务类型档位，未指定时返回默认值（technical-blog）
 * @returns 该档位的阈值配置
 */
export function getThresholdsForProfile(profile) {
    if (profile && profile in THRESHOLD_PROFILES) {
        return THRESHOLD_PROFILES[profile];
    }
    // 默认使用 technical-blog 的阈值（与原始 THRESHOLDS 一致）
    return THRESHOLD_PROFILES["technical-blog"];
}
//# sourceMappingURL=thresholds.js.map