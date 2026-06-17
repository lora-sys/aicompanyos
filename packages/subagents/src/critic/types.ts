// Critic Agent 类型定义

import type { PlanStep } from "@aicos/loop-engine/types";
import type { WriterOutput } from "../writer/types.js";

// Critic 输入
export interface CriticInput {
  taskId: string;
  writerOutput: WriterOutput | { content: string; artifactPath: string }; // Writer 的产出
  originalTask: string;
  planStep: PlanStep;
  context: {
    interrogationResults: Record<string, string>;
    designMDX?: string;
    userPreferences?: Record<string, string>;
  };
}

// Critic 输出
export interface CriticOutput {
  overallScore: number; // 0-100
  dimensions: {
    topicAccuracy: { score: number; comment: string }; // 主题准确性
    technicalDepth: { score: number; comment: string }; // 技术深度
    codeQuality: { score: number; comment: string }; // 代码质量
    readability: { score: number; comment: string }; // 可读性
    originality: { score: number; comment: string }; // 原创性
  };
  passed: boolean; // overallScore >= threshold
  suggestions: Array<{
    type: "content" | "structure" | "style" | "format" | "ux";
    severity: "critical" | "major" | "minor";
    location?: string; // 问题位置描述
    description: string;
    suggestion: string;
  }>;
  reasoning: string; // 总体评价和修改方向
}
