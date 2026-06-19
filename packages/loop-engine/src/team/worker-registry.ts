/**
 * WorkerRegistry — 全局 Worker 注册表
 *
 * 管理所有可用的 Worker 类型。
 * 部门在初始化时将自己的 Worker 注册到此表中，
 * TeamComposer 从中选择合适的 Worker 组成团队。
 *
 * 文件位置：packages/loop-engine/src/team/worker-registry.ts
 */

import type {
  WorkerRole,
  IWorkerRegistry,
  WorkerRegistration,
  AgentFactory,
} from "./types.js";
import { randomUUID } from "node:crypto";

// ============================================================
// WorkerRegistry 实现
// ============================================================

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
export class WorkerRegistry implements IWorkerRegistry {
  private registrations: Map<string, WorkerRegistration> = new Map();
  /** role → registrations[] 索引 */
  private roleIndex: Map<WorkerRole, WorkerRegistration[]> = new Map();
  /** agentType → registration 索引 */
  private agentTypeIndex: Map<string, WorkerRegistration> = new Map();

  /**
   * 注册一个 Worker
   *
   * @param registration Worker 注册信息
   * @throws 如果已存在相同 id 的注册
   */
  register(registration: WorkerRegistration): void {
    if (this.registrations.has(registration.id)) {
      throw new Error(`[WorkerRegistry] Worker "${registration.id}" 已存在，不能重复注册`);
    }

    const reg = { ...registration };

    // 主存储
    this.registrations.set(reg.id, reg);

    // 角色索引
    if (!this.roleIndex.has(reg.role)) {
      this.roleIndex.set(reg.role, []);
    }
    this.roleIndex.get(reg.role)!.push(reg);

    // agentType 索引
    if (reg.agentType) {
      this.agentTypeIndex.set(reg.agentType, reg);
    }

    console.log(
      `[WorkerRegistry] 已注册 Worker: ${reg.id} (role=${reg.role}, agentType=${reg.agentType})`
    );
  }

  /**
   * 根据 role 获取所有匹配的 Worker
   */
  getWorkersByRole(role: WorkerRole): WorkerRegistration[] {
    return this.roleIndex.get(role) ?? [];
  }

  /**
   * 获取所有已注册的 Worker
   */
  getAllWorkers(): WorkerRegistration[] {
    return Array.from(this.registrations.values());
  }

  /**
   * 根据 agentType 查找 Worker
   */
  getByAgentType(agentType: string): WorkerRegistration | undefined {
    return this.agentTypeIndex.get(agentType);
  }

  /**
   * 检查某角色是否有可用 Worker
   */
  hasRole(role: WorkerRole): boolean {
    return (this.roleIndex.get(role)?.length ?? 0) > 0;
  }

  /**
   * 获取已注册的 Worker 数量
   */
  get size(): number {
    return this.registrations.size;
  }

  /**
   * 清空所有注册（测试用）
   */
  clear(): void {
    this.registrations.clear();
    this.roleIndex.clear();
    this.agentTypeIndex.clear();
  }
}

// ============================================================
// 全局默认实例
// ============================================================

/** 全局默认 WorkerRegistry 实例 */
export const globalWorkerRegistry = new WorkerRegistry();
