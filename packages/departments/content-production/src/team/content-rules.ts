/**
 * Content Production Department — 团队组合规则集
 *
 * 定义内容产出部的 8 条 TeamCompositionRule，
 * 覆盖所有常见的内容生产场景。
 *
 * 规则优先级设计：
 * - P10-P30: 特殊场景（高复杂度 + 特征组合）
 * - P50-P70: 一般场景（按质量档次和复杂度）
 * - P999:   兜底规则（始终匹配）
 *
 * 文件位置：packages/departments/content-production/src/team/content-rules.ts
 */

import type { TaskFeatures, TeamCompositionRule, TeamWorkerDef } from "@aicos/loop-engine";

// ============================================================
// 规则定义
// ============================================================

/**
 * R1: 高复杂度 + 需调研 + 有视觉 → 全明星团队
 *
 * 场景：深度技术文章配图、行业研究报告可视化、产品评测长文
 * 团队：Writer + Critic + Researcher + UIUX Designer + Reviewer
 */
export const RULE_PREMIUM_FULL_TEAM: TeamCompositionRule = {
  id: "cp-premium-full-team",
  match: (f: TaskFeatures) =>
    f.complexity === "high" &&
    f.needsResearch === true &&
    f.hasVisualContent === true &&
    f.qualityTier === "premium",
  team: [
    { role: "writer", priority: "essential" },
    { role: "critic", priority: "essential" },
    { role: "researcher", priority: "essential", configOverride: { researchDepth: "deep" } },
    { role: "uiux-designer", priority: "optional" },
    { role: "reviewer", priority: "optional" },
  ],
  reasoning: "高复杂度+调研+视觉+高质量 → 全明星5人团队，含深度调研和视觉设计",
  priority: 10,
};

/**
 * R2: 高复杂度 + 需调研 → 研究型团队
 *
 * 场景：深度技术分析、行业趋势报告、竞品对比文章
 * 团队：Writer + Critic + Researcher (+ Reviewer if premium)
 */
export const RULE_RESEARCH_HEAVY: TeamCompositionRule = {
  id: "cp-research-heavy",
  match: (f: TaskFeatures) =>
    f.complexity === "high" &&
    f.needsResearch === true &&
    f.qualityTier === "premium",
  team: [
    { role: "writer", priority: "essential" },
    { role: "critic", priority: "essential" },
    { role: "researcher", priority: "essential", configOverride: { researchDepth: "deep" } },
    { role: "reviewer", priority: "optional" },
  ],
  reasoning: "高复杂度+调研+高质量 → 研究型4人团队，含深度调研和最终审查",
  priority: 20,
};

/**
 * R3: 有视觉内容 → 创意团队
 *
 * 场景：小红书种草笔记、短视频脚本、图文卡片
 * 团队：Writer + Critic + UIUX Designer
 */
export const RULE_VISUAL_CREATIVE: TeamCompositionRule = {
  id: "cp-visual-creative",
  match: (f: TaskFeatures) =>
    f.hasVisualContent === true &&
    f.complexity !== "high",
  team: [
    { role: "writer", priority: "essential" },
    { role: "critic", priority: "essential" },
    { role: "uiux-designer", priority: "optional" },
  ],
  reasoning: "视觉内容需求 → 创意3人团队，含视觉设计师",
  priority: 30,
};

/**
 * R4: 需调研（非高复杂度）→ 轻量调研团队
 *
 * 场景：带数据支撑的普通文章、新闻稿、资讯类内容
 * 团队：Writer + Critic + Researcher(light)
 */
export const RULE_LIGHT_RESEARCH: TeamCompositionRule = {
  id: "cp-light-research",
  match: (f: TaskFeatures) =>
    f.needsResearch === true &&
    f.complexity !== "high",
  team: [
    { role: "writer", priority: "essential" },
    { role: "critic", priority: "essential" },
    { role: "researcher", priority: "optional", configOverride: { researchDepth: "light" } },
  ],
  reasoning: "一般调研需求 → 轻量3人团队，快速搜索即可",
  priority: 50,
};

/**
 * R5: Premium 质量（无特殊需求）→ 高标准核心团队
 *
 * 场景：品牌文案、重要公告、精品内容
 * 团队：Writer + Critic + Reviewer
 */
export const RULE_PREMIUM_CORE: TeamCompositionRule = {
  id: "cp-premium-core",
  match: (f: TaskFeatures) =>
    f.qualityTier === "premium" &&
    f.complexity !== "high" &&
    f.needsResearch === false &&
    f.hasVisualContent === false,
  team: [
    { role: "writer", priority: "essential" },
    { role: "critic", priority: "essential" },
    { role: "reviewer", priority: "optional" },
  ],
  reasoning: "高质量要求但无特殊需求 → 核心3人团队+审查员",
  priority: 60,
};

/**
 * R6: 标准质量 + 中等复杂度 → 标准团队
 *
 * 场景：常规公众号文章、Newsletter、一般性图文
 * 团队：Writer + Critic
 */
export const RULE_STANDARD: TeamCompositionRule = {
  id: "cp-standard",
  match: (f: TaskFeatures) =>
    f.qualityTier === "standard" &&
    (f.complexity === "medium" || f.complexity === "low"),
  team: [
    { role: "writer", priority: "essential" },
    { role: "critic", priority: "essential" },
  ],
  reasoning: "标准质量 → 经典 Writer+Critic 双核团队",
  priority: 70,
};

/**
 * R7: Draft/草稿模式 → 最小团队
 *
 * 场景：快速大纲、草稿生成、速览内容
 * 团队：Writer + Critic(1轮)
 */
export const RULE_DRAFT: TeamCompositionRule = {
  id: "cp-draft",
  match: (f: TaskFeatures) =>
    f.qualityTier === "draft",
  team: [
    { role: "writer", priority: "essential" },
    { role: "critic", priority: "essential", configOverride: { maxRounds: 1 } },
  ],
  reasoning: "草稿模式 → 最小2人团队，Critic 仅1轮快速检查",
  priority: 80,
};

/**
 * R8: 兜底规则 — 默认核心团队
 *
 * 兜底：任何未被上述规则覆盖的任务
 * 团队：Writer + Critic（最基础配置）
 */
export const RULE_FALLBACK: TeamCompositionRule = {
  id: "cp-fallback",
  match: (_f: TaskFeatures) => true,
  team: [
    { role: "writer", priority: "essential" },
    { role: "critic", priority: "essential" },
  ],
  reasoning: "兜底 → 标准 Writer+Critic 双核团队",
  priority: 999,
};

// ============================================================
// 规则集导出
// ============================================================

/** 内容产出部全部团队组合规则（有序） */
export const CONTENT_TEAM_RULES: TeamCompositionRule[] = [
  RULE_PREMIUM_FULL_TEAM,
  RULE_RESEARCH_HEAVY,
  RULE_VISUAL_CREATIVE,
  RULE_LIGHT_RESEARCH,
  RULE_PREMIUM_CORE,
  RULE_STANDARD,
  RULE_DRAFT,
  RULE_FALLBACK,
];
