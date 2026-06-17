/**
 * 固定评估标准 (Grading Criteria)
 *
 * 设计原则（参考三 Agent 架构的最佳实践）：
 * 1. 标准在任务开始前定义，全程不变 — "焊死"
 * 2. Generator 和 Evaluator 共享同一套标准
 * 3. 每个维度有明确的评分规则和 few-shot 示例
 * 4. 标准本身可配置但运行时不可变
 *
 * 为什么需要固定标准？
 * - 避免 Evaluator 每次输出不同的评分维度
 * - 让 Generator 有明确的优化目标
 * - 让 Evolution Module 能追踪特定维度的改进趋势
 */
/** 单个评估维度 */
export interface GradingDimension {
    /** 维度名称（英文标识） */
    id: string;
    /** 显示名称 */
    name: string;
    /** 权重 (0-1, 所有维度权重之和应为 1.0) */
    weight: number;
    /** 满分 */
    maxScore: number;
    /** 评分标准描述（注入到 Evaluator prompt） */
    criteria: string;
    /** 对 Generator 的优化指引（注入到 Generator prompt） */
    guidance: string;
    /** Few-shot 示例（用于校准 Evaluator） */
    examples?: Array<{
        description: string;
        score: number;
        reason: string;
    }>;
}
/** 完整的评估标准集 */
export interface GradingCriteria {
    /** 标准名称/版本 */
    name: string;
    /** 版本号 */
    version: string;
    /** 所有维度 */
    dimensions: GradingDimension[];
    /** 通过阈值 (加权平均分 >= 此值则通过) */
    passThreshold: number;
    /** 优秀阈值 (达到此值认为无需继续迭代) */
    excellenceThreshold: number;
}
/** 单次评估结果 */
export interface GradingResult {
    /** 总分 (0-100) */
    totalScore: number;
    /** 加权总分 (0-100) */
    weightedScore: number;
    /** 是否通过 */
    passed: boolean;
    /** 是否优秀（无需迭代） */
    excellent: boolean;
    /** 各维度详情 */
    dimensionScores: Array<{
        dimensionId: string;
        dimensionName: string;
        rawScore: number;
        maxScore: number;
        weightedScore: number;
        comment: string;
    }>;
    /** Evaluator 的总体评语 */
    reasoning: string;
    /** 具体修改建议列表 */
    suggestions: Array<{
        dimensionId: string;
        severity: "critical" | "major" | "minor";
        description: string;
        suggestion: string;
    }>;
    /** 迭代轮次 */
    round: number;
}
/** Generator 的战略决策 */
export type StrategicDecision = "refine" | "pivot" | "accept";
/** 迭代状态交接（Context Reset 时传递） */
export interface IterationHandoff {
    /** 当前轮次 */
    round: number;
    /** 历史最佳分数 */
    bestScore: number;
    /** 历史最佳产出（用于退化保护） */
    bestOutput?: string;
    /** 上一次的评估结果 */
    lastEvaluation?: GradingResult;
    /** 分数趋势（最近 N 轮） */
    scoreTrend: number[];
    /** 当前的战略方向 */
    currentStrategy: StrategicDecision;
    /** 累计修改建议（去重后的所有建议） */
    accumulatedSuggestions: string[];
}
/**
 * 默认的技术内容写作评估标准
 *
 * 5 个维度，参考前端设计 harness 的 4 维度设计：
 * - Topic Accuracy → 对应 Design Quality（是否围绕主题）
 * - Technical Depth → 对应 Craft（技术执行质量）
 * - Code Quality → 对应 Craft 的子维度
 * - Readability → 对应 Functionality（用户能否理解）
 * - Originality → 对应 Originality（是否有独特见解）
 */
export declare const DEFAULT_WRITING_CRITERIA: GradingCriteria;
/**
 * 将 GradingCriteria 格式化为 Evaluator Prompt 片段
 * 注入到 Critic/Evaluator 的 system prompt 中
 */
export declare function formatCriteriaForEvaluator(criteria: GradingCriteria): string;
/**
 * 将 GradingCriteria 格式化为 Generator Prompt 片段
 * 注入到 Writer/Generator 的 system prompt 中
 */
export declare function formatCriteriaForGenerator(criteria: GradingCriteria): string;
//# sourceMappingURL=grading-criteria.d.ts.map