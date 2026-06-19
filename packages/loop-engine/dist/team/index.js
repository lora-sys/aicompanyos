/**
 * Team Architecture — 动态团队抽象层统一导出
 *
 * 文件位置：packages/loop-engine/src/team/index.ts
 */
// 常量导出
export { WORKER_ROLES, LENGTH_THRESHOLDS } from "./types.js";
// 类导出
export { TaskAnalyzer } from "./task-analyzer.js";
export { TeamComposer } from "./team-composer.js";
export { TeamManager } from "./team-manager.js";
export { WorkerRegistry, globalWorkerRegistry } from "./worker-registry.js";
export { HistoryReader, DEFAULT_HISTORY_READER_CONFIG } from "./history-reader.js";
//# sourceMappingURL=index.js.map