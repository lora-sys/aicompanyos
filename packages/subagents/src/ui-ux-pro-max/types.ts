// UI-UX-Pro-Max 类型定义

// Skill 模式的输入
export interface UIUXSkillInput {
  taskType: string; // 如 "blog", "tweet", "design-doc"
  contentType: string; // 内容类型描述
  currentDesignMDX?: string; // 当前 design.mdx 内容（如有）
  userPreferences?: Record<string, string>; // 来自 user.md 的用户偏好
  contextHints?: string[]; // 额外的上下文线索
}

// Skill 模式的输出
export interface UIUXSkillOutput {
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    reasoning: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    headingSizes: Record<string, string>;
    lineHeight: string;
    letterSpacing: string;
    reasoning: string;
  };
  layoutSuggestion: {
    template: string; // 布局模板描述
    spacing: string;
    componentStructure: string[];
    reasoning: string;
  };
  designTokens: {
    borderRadius: string;
    shadow: string;
    paddingScale: string;
    reasoning: string;
  };
  overallGuidance: string; // 综合设计指导文本
  confidence: number; // 0-1
}

// Agent 模式的输入
export interface UIUXAgentInput {
  artifactPath: string; // 待审核的产物路径
  artifactContent: string; // 产物内容
  taskType: string;
  designMDX?: string; // 当前 design.mdx 作为参考标准
}

// Agent 模式的输出（审核结果）
export interface UIUXAgentOutput {
  score: number; // 0-100
  dimensions: {
    colorHarmony: { score: number; comment: string };
    typography: { score: number; comment: string };
    layout: { score: number; comment: string };
    visualHierarchy: { score: number; comment: string };
    accessibility: { score: number; comment: string };
  };
  passed: boolean; // score >= threshold
  suggestions: Array<{
    type: "color" | "typography" | "layout" | "general";
    priority: "high" | "medium" | "low";
    description: string;
    suggestion: string;
  }>;
  reasoning: string;
}

// 模式枚举
export enum UIUXMode {
  SKILL = "skill",
  AGENT = "agent",
}
