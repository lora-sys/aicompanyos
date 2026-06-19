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
/** 默认团队配置 */
export const DEFAULT_CONTENT_TEAM_CONFIG = {
    defaultIncludeResearcher: false,
    defaultIncludeUIUX: false,
    autoIncludeReviewerForPremium: true,
    maxTeamSize: 5,
};
