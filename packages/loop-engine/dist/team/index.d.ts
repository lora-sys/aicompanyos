/**
 * Team Architecture — 动态团队抽象层统一导出
 *
 * 文件位置：packages/loop-engine/src/team/index.ts
 */
export type { WorkerRole, IWorker, WorkerConfig, TaskFeatures, ContentDomain, ITeam, TeamCompositionRule, TeamWorkerDef, ITeamManager, TeamContext, AgentFactory, WorkerFactoryDeps, IWorkerRegistry, WorkerRegistration, } from "./types.js";
export { WORKER_ROLES, LENGTH_THRESHOLDS } from "./types.js";
export { TaskAnalyzer, findSimilarCases } from "./task-analyzer.js";
export { TeamComposer } from "./team-composer.js";
export { TeamManager } from "./team-manager.js";
export { WorkerRegistry, globalWorkerRegistry } from "./worker-registry.js";
export { HistoryReader, DEFAULT_HISTORY_READER_CONFIG } from "./history-reader.js";
export type { HistoryReaderConfig, HistoryPromptResult } from "./history-reader.js";
//# sourceMappingURL=index.d.ts.map