/**
 * Content Production Department — Team 模块统一导出
 *
 * 文件位置：packages/departments/content-production/src/team/index.ts
 */

// 类型导出
export type {
  ContentWorkerConfig,
  ContentTeamConfig,
  ContentTeamContext,
} from "./types.js";

// 常量导出
export { DEFAULT_CONTENT_TEAM_CONFIG } from "./types.js";

// 规则导出
export {
  CONTENT_TEAM_RULES,
  RULE_PREMIUM_FULL_TEAM,
  RULE_RESEARCH_HEAVY,
  RULE_VISUAL_CREATIVE,
  RULE_LIGHT_RESEARCH,
  RULE_PREMIUM_CORE,
  RULE_STANDARD,
  RULE_DRAFT,
  RULE_FALLBACK,
} from "./content-rules.js";

// Worker 导出
export {
  createContentWorkerRegistrations,
  registerContentWorkers,
} from "./content-workers.js";

// 核心类导出
export { ContentTeamManager } from "./content-team-manager.js";
