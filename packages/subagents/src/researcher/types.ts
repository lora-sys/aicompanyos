// Researcher Agent 类型定义

// Researcher 输入
export interface ResearcherInput {
  taskId: string;
  topic: string; // 搜索主题（来自 PlanStep.description）
  taskInput: string; // 用户原始任务输入
  interrogationResults?: Record<string, string>; // 拷问上下文（可用于优化搜索关键词）
  maxSources?: number; // 最大搜索条数（默认 5）
}

// 单条参考资料
export interface ResearchSource {
  title: string; // 资料标题
  url: string; // 来源 URL
  relevance: number; // 相关度 0-1
  publishedDate?: string; // 发布日期
  keyPoints: string[]; // 关键要点（由 LLM 提取）
  credibility: "high" | "medium" | "low"; // 可信度评估
}

// Researcher 输出
export interface ResearcherOutput {
  sources: ResearchSource[]; // 找到的参考资料列表
  summary: string; // LLM 整理后的研究摘要
  sourceCount: number; // 实际找到的资料数量
  usedTools: string[]; // 使用过的工具列表
}
