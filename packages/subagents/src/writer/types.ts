// Writer Agent 类型定义

import type { UIUXSkillOutput } from "../ui-ux-pro-max/types.js";

// Writer 输入
export interface WriterInput {
  taskId: string;
  planStep: {
    // 来自 PlanStep
    stepId: string;
    description: string;
    expectedOutput: string;
    toolsNeeded: string[];
  };
  context: {
    interrogationResults: Record<string, string>; // 拷问上下文
    userPreferences?: Record<string, string>; // 来自 user.md
    designMDX?: string; // 当前视觉 DNA
    uiuxGuidance?: UIUXSkillOutput; // UI/UX 设计指导
    previousOutputs?: Record<string, unknown>; // 前序步骤的输出
  };
  lengthConstraint?: string; // 来自 selfExperience 的篇幅约束（如 "控制在 8000-10000 字节内"）
  languagePreference?: string; // 用户指定的编程语言偏好（如 "TypeScript"）
  // === Loop Engineering: Critic 反馈注入 ===
  criticFeedback?: string; // 来自 LoopHarness 的完整 Critic 审核报告文本
  rewriteRound?: number; // 当前是第几轮重写 (1 = 首次, 2+ = 重写)
  // === 自定义 System Prompt（支持不同内容格式切换）===
  customSystemPrompt?: string; // 来自 DepartmentConfig 的自定义 Writer System Prompt（优先级最高）
}

// Writer 输出
export interface WriterOutput {
  content: string; // 生成的 Markdown 内容
  artifactPath: string; // 写入的文件路径
  wordCount: number;
  references: string[]; // 参考资料来源
  usedTools: string[]; // 使用过的工具列表
}
