/**
 * Content Production Department — 团队类型扩展
 *
 * 扩展 loop-engine 的通用团队类型，添加内容产出部专属的：
 * - Worker 配置变体（不同格式的 Writer 行为差异）
 * - 内容领域专有特征
 * - 部门级团队配置接口
 *
 * 文件位置：packages/departments/content-production/src/team/types.ts
 */
import type { WorkerRole, WorkerConfig } from "@aicos/loop-engine";
import type { ContentType } from "@aicos/loop-engine";
/**
 * 内容产出部 Worker 专属配置
 *
 * 在通用 WorkerConfig 基础上，增加内容格式相关的定制能力。
 */
export interface ContentWorkerConfig extends WorkerConfig {
    /** 关联的内容格式（决定 Prompt 变体） */
    contentType?: ContentType;
    /** 是否启用 UIUX 技能（仅 uiux-designer 角色） */
    enableUIUXSkill?: boolean;
    /** 调研深度：light(快速搜索) / deep(多源交叉验证) */
    researchDepth?: "light" | "deep";
}
/**
 * 内容产出部团队配置
 *
 * 控制团队组合的行为参数，可在初始化时自定义。
 */
export interface ContentTeamConfig {
    /** 是否默认包含 Researcher（即使任务未明确要求调研） */
    defaultIncludeResearcher: boolean;
    /** 是否默认包含 UIUX Designer */
    defaultIncludeUIUX: boolean;
    /** premium 质量档是否自动加入 Reviewer */
    autoIncludeReviewerForPremium: boolean;
    /** 最大团队规模（防止过度膨胀） */
    maxTeamSize: number;
}
/** 默认团队配置 */
export declare const DEFAULT_CONTENT_TEAM_CONFIG: ContentTeamConfig;
/**
 * 内容产出部 composeTeam() 调用的完整上下文
 *
 * 扩展通用 TeamContext，增加内容格式信息。
 */
export interface ContentTeamContext {
    /** 内容格式类型 */
    contentType: ContentType;
    /** 用户偏好 */
    userPreferences?: {
        preferFastMode?: boolean;
        preferHighQuality?: boolean;
        excludeRoles?: WorkerRole[];
        /** 指定目标平台（影响 UIUX 和输出适配） */
        targetPlatform?: "xiaohongshu" | "wechat" | "douyin" | "substack" | "general";
    };
}
