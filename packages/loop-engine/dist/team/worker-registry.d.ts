/**
 * WorkerRegistry — 全局 Worker 注册表
 *
 * 管理所有可用的 Worker 类型。
 * 部门在初始化时将自己的 Worker 注册到此表中，
 * TeamComposer 从中选择合适的 Worker 组成团队。
 *
 * 文件位置：packages/loop-engine/src/team/worker-registry.ts
 */
import type { WorkerRole, IWorkerRegistry, WorkerRegistration } from "./types.js";
/**
 * 全局 Worker 注册表（单例模式）
 *
 * 使用方式：
 * ```typescript
 * const registry = new WorkerRegistry();
 * registry.register({ id: "writer-primary", role: "writer", agentType: "writer", defaultFactory: ... });
 * const writers = registry.getWorkersByRole("writer");
 * ```
 */
export declare class WorkerRegistry implements IWorkerRegistry {
    private registrations;
    /** role → registrations[] 索引 */
    private roleIndex;
    /** agentType → registration 索引 */
    private agentTypeIndex;
    /**
     * 注册一个 Worker
     *
     * @param registration Worker 注册信息
     * @throws 如果已存在相同 id 的注册
     */
    register(registration: WorkerRegistration): void;
    /**
     * 根据 role 获取所有匹配的 Worker
     */
    getWorkersByRole(role: WorkerRole): WorkerRegistration[];
    /**
     * 获取所有已注册的 Worker
     */
    getAllWorkers(): WorkerRegistration[];
    /**
     * 根据 agentType 查找 Worker
     */
    getByAgentType(agentType: string): WorkerRegistration | undefined;
    /**
     * 检查某角色是否有可用 Worker
     */
    hasRole(role: WorkerRole): boolean;
    /**
     * 获取已注册的 Worker 数量
     */
    get size(): number;
    /**
     * 清空所有注册（测试用）
     */
    clear(): void;
}
/** 全局默认 WorkerRegistry 实例 */
export declare const globalWorkerRegistry: WorkerRegistry;
//# sourceMappingURL=worker-registry.d.ts.map