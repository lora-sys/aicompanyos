export interface ReviewDimension {
    name: string;
    score: number;
    passed: boolean;
    comment: string;
}
export interface ReviewSuggestion {
    dimension: string;
    priority: "high" | "medium" | "low";
    description: string;
    action: string;
}
export interface ReviewerOutput {
    /** 总体评分 0-100 */
    score: number;
    /** 是否通过审查 */
    passed: boolean;
    /** 各维度审查结果 */
    dimensions: ReviewDimension[];
    /** 修改建议 */
    suggestions: ReviewSuggestion[];
    /** 综合评审意见 */
    reasoning: string;
}
//# sourceMappingURL=types.d.ts.map