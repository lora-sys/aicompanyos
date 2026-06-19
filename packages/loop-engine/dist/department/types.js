/**
 * Department Architecture (ADR-005) — 部门制抽象层类型定义
 *
 * 核心设计：
 * - 每个 Department 是同一套 Loop Engine 的不同配置剖面（Profile），不是独立系统
 * - DepartmentConfig = AgentProfile + GoalTemplate + OutputPipeline + QualityGate
 * - 先做深再做广：抽象层必须能支撑内容产出部的完整需求，同时不阻碍未来部门扩展
 *
 * 文件位置：packages/loop-engine/src/department/types.ts
 */
/** 所有支持的内容格式列表 */
export const CONTENT_TYPES = [
    "article",
    "seed",
    "short-video",
    "newsletter",
];
//# sourceMappingURL=types.js.map