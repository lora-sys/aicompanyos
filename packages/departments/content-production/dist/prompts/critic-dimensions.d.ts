/**
 * 内容产出部 — Critic 评估维度定义
 *
 * 每种内容格式有专属的评估维度，
 * 覆盖默认 GradingCriteria 中的通用维度。
 *
 * 使用方式：
 * ```typescript
 * import { getCriticDimensions } from "@aicos/content-production";
 * const dims = getCriticDimensions("article"); // 返回图文专用的 CriticDimension[]
 * ```
 */
import type { CriticDimension } from "@aicos/loop-engine";
/** 图文文章的 Critic 评估维度 */
export declare const ARTICLE_CRITIC_DIMENSIONS: CriticDimension[];
/** 种草笔记的 Critic 评估维度 */
export declare const SEED_CRITIC_DIMENSIONS: CriticDimension[];
/** 短视频脚本的 Critic 评估维度 */
export declare const SHORT_VIDEO_CRITIC_DIMENSIONS: CriticDimension[];
/** Newsletter 的 Critic 评估维度 */
export declare const NEWSLETTER_CRITIC_DIMENSIONS: CriticDimension[];
/** 所有支持的内容格式类型 */
export type ContentType = import("@aicos/loop-engine").ContentType;
/** 根据 ContentType 获取对应的 Critic 评估维度 */
export declare function getCriticDimensions(contentType: ContentType): CriticDimension[];
