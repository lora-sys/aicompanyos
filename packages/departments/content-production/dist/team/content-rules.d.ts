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
import type { TeamCompositionRule } from "@aicos/loop-engine";
/**
 * R1: 高复杂度 + 需调研 + 有视觉 → 全明星团队
 *
 * 场景：深度技术文章配图、行业研究报告可视化、产品评测长文
 * 团队：Writer + Critic + Researcher + UIUX Designer + Reviewer
 */
export declare const RULE_PREMIUM_FULL_TEAM: TeamCompositionRule;
/**
 * R2: 高复杂度 + 需调研 → 研究型团队
 *
 * 场景：深度技术分析、行业趋势报告、竞品对比文章
 * 团队：Writer + Critic + Researcher (+ Reviewer if premium)
 */
export declare const RULE_RESEARCH_HEAVY: TeamCompositionRule;
/**
 * R3: 有视觉内容 → 创意团队
 *
 * 场景：小红书种草笔记、短视频脚本、图文卡片
 * 团队：Writer + Critic + UIUX Designer
 */
export declare const RULE_VISUAL_CREATIVE: TeamCompositionRule;
/**
 * R4: 需调研（非高复杂度）→ 轻量调研团队
 *
 * 场景：带数据支撑的普通文章、新闻稿、资讯类内容
 * 团队：Writer + Critic + Researcher(light)
 */
export declare const RULE_LIGHT_RESEARCH: TeamCompositionRule;
/**
 * R5: Premium 质量（无特殊需求）→ 高标准核心团队
 *
 * 场景：品牌文案、重要公告、精品内容
 * 团队：Writer + Critic + Reviewer
 */
export declare const RULE_PREMIUM_CORE: TeamCompositionRule;
/**
 * R6: 标准质量 + 中等复杂度 → 标准团队
 *
 * 场景：常规公众号文章、Newsletter、一般性图文
 * 团队：Writer + Critic
 */
export declare const RULE_STANDARD: TeamCompositionRule;
/**
 * R7: Draft/草稿模式 → 最小团队
 *
 * 场景：快速大纲、草稿生成、速览内容
 * 团队：Writer + Critic(1轮)
 */
export declare const RULE_DRAFT: TeamCompositionRule;
/**
 * R8: 兜底规则 — 默认核心团队
 *
 * 兜底：任何未被上述规则覆盖的任务
 * 团队：Writer + Critic（最基础配置）
 */
export declare const RULE_FALLBACK: TeamCompositionRule;
/** 内容产出部全部团队组合规则（有序） */
export declare const CONTENT_TEAM_RULES: TeamCompositionRule[];
