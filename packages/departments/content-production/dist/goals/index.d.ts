/**
 * 内容产出部 — 部门专属验收目标模板 (GoalTemplates)
 *
 * 每种内容格式有独特的验收标准，
 * 覆盖 completion-guard 中通用模板的不足。
 *
 * 设计原则：
 * - 这些是部门级模板，优先级高于 loop-engine 内置的通用模板
 * - 通过 DepartmentConfig.goalTemplates 注入到 LoopHarness
 * - 使用 content_match / file_exists 等轻量验证方法（不需要 tsc/test/lint）
 *
 * 验证优先级（从高到低）：
 * 1. PlanStep.metadata.acceptanceGoals （显式定义）
 * 2. DepartmentConfig.goalTemplates （部门专属，本文件）
 * 3. GoalTemplateRegistry 内置模板 （通用兜底）
 */
import type { DepartmentGoalTemplate } from "@aicos/loop-engine";
export declare const ARTICLE_GOAL_TEMPLATES: DepartmentGoalTemplate[];
export declare const SEED_GOAL_TEMPLATES: DepartmentGoalTemplate[];
export declare const SHORT_VIDEO_GOAL_TEMPLATES: DepartmentGoalTemplate[];
export declare const NEWSLETTER_GOAL_TEMPLATES: DepartmentGoalTemplate[];
import type { ContentType } from "@aicos/loop-engine";
/**
 * 根据内容格式获取所有部门专属的目标模板
 *
 * @param contentType 内容格式类型
 * @returns 该格式的 DepartmentGoalTemplate 数组
 */
export declare function getDepartmentGoalTemplates(contentType: ContentType): DepartmentGoalTemplate[];
