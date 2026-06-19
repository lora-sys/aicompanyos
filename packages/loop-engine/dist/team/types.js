/**
 * Team Architecture — 动态团队抽象层类型定义
 *
 * 核心设计：
 * - 团队是任务的函数，不是 contentType 的函数
 * - TaskAnalyzer 提取任务特征 → TeamComposer 根据规则匹配 → 动态 Agent 组合
 * - ITeamManager 是纯编排层，不含业务逻辑
 *
 * 文件位置：packages/loop-engine/src/team/types.ts
 */
/** 所有支持的 Worker 角色 */
export const WORKER_ROLES = [
    "writer",
    "critic",
    "researcher",
    "uiux-designer",
    "reviewer",
];
/** 篇幅阈值常量 */
export const LENGTH_THRESHOLDS = {
    shortChars: 500,
    mediumChars: 2000,
};
//# sourceMappingURL=types.js.map