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
export declare const THRESHOLDS: {
    /** VerifyEngine: 全局验证底线 */
    readonly VERIFY_BASELINE: 60;
    /** ConsensusLock: 共识投票通过线 */
    readonly CONSENSUS_PASS: 70;
    /** CriticAgent / GradingCriteria: 单次审核通过线 */
    readonly EVALUATOR_PASS: 75;
    /** GradingCriteria: 优秀停止迭代线 */
    readonly EXCELLENCE_STOP: 90;
};
/** 阈值类型 */
export type ThresholdKey = keyof typeof THRESHOLDS;
/**
 * 每种任务类型的阈值配置
 *
 * 设计原则：
 * - technical-blog: 使用默认高标（原阈值），要求深度分析 + 原创性
 * - tutorial: 降低 excellence 线（85），教程以清晰准确为主，不需要独特洞见
 * - design-doc: 提高 pass 线（80），设计文档要求严谨完整
 * - code-review: 最高标准（excellence 92），代码审查零容忍模糊表述
 * - generic: 最宽松档位，适用于不确定类型的任务
 */
export interface ThresholdProfile {
    /** 显示名称 */
    label: string;
    evaluatorPass: number;
    excellenceStop: number;
    consensusPass: number;
    verifyBaseline: number;
}
export declare const THRESHOLD_PROFILES: Record<string, ThresholdProfile>;
/**
 * 根据任务类型获取阈值配置
 *
 * @param profile 任务类型档位，未指定时返回默认值（technical-blog）
 * @returns 该档位的阈值配置
 */
export declare function getThresholdsForProfile(profile?: string): ThresholdProfile;
//# sourceMappingURL=thresholds.d.ts.map