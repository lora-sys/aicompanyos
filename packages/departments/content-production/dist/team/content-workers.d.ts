/**
 * Content Production Department — 部门专属 Worker 定义
 *
 * 定义内容产出部注册到全局 WorkerRegistry 的 Worker。
 * 每个 Worker 对应一种 Agent 实现，带有内容部门特有的配置。
 *
 * 文件位置：packages/departments/content-production/src/team/content-workers.ts
 */
import type { WorkerRegistration } from "@aicos/loop-engine";
/**
 * 创建内容产出部的基础 Worker 注册列表
 *
 * 这些是部门启动时注册到 globalWorkerRegistry 的 Worker。
 * 实际的 AgentFactory 由 CLI 层或 LoopHarness 注入。
 *
 * 设计原则：
 * - 此处只定义「有哪些 Worker 可用」和它们的元数据
 * - 不绑定具体的 Agent 实例（解耦）
 * - factory 使用 null 占位，由调用方替换
 */
export declare function createContentWorkerRegistrations(): WorkerRegistration[];
/**
 * 将 Worker 注册到全局 Registry
 *
 * @param registry 目标 WorkerRegistry 实例
 */
export declare function registerContentWorkers(registry: import("@aicos/loop-engine").IWorkerRegistry): void;
