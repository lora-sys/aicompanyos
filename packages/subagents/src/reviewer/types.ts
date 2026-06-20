// ReviewerAgent 类型定义
// 最终审查角色的输入/输出类型

// 审查维度
export interface ReviewDimension {
  name: string;
  score: number; // 0-100
  passed: boolean;
  comment: string;
}

// 审查建议
export interface ReviewSuggestion {
  dimension: string;
  priority: "high" | "medium" | "low";
  description: string;
  action: string;
}

// 审查结果
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
