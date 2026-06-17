import type { LoopStateMachine } from "../state-machine.js";
import type { LoopState, LoopContext, ExecutionPlan } from "../types.js";
import type { RollbackPoint, RollbackResult } from "./types.js";

// 默认最大重试次数
const DEFAULT_MAX_RETRIES = 3;

/**
 * 回滚管理器 - 管理状态快照和回滚/重试逻辑
 */
export class RollbackManager {
  private stateMachine: LoopStateMachine;
  private maxRetries: number;
  private rollbackHistory: RollbackPoint[] = [];
  private retryCount: number = 0;

  constructor(stateMachine: LoopStateMachine, maxRetries?: number) {
    this.stateMachine = stateMachine;
    this.maxRetries = maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * 创建回滚点（在关键节点调用）
   */
  createRollbackPoint(
    context: LoopContext,
    plan?: ExecutionPlan,
    evidenceChainSnapshotId?: string
  ): RollbackPoint {
    const point: RollbackPoint = {
      snapshotId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      loopState: this.stateMachine.state,
      contextSnapshot: structuredClone(context),
      planSnapshot: plan ? structuredClone(plan) : undefined,
      evidenceChainSnapshotId: evidenceChainSnapshotId ?? "",
    };

    this.rollbackHistory.push(point);
    return point;
  }

  /**
   * 回滚到指定点
   */
  async rollback(pointId: string): Promise<RollbackResult> {
    const point = this.rollbackHistory.find((p) => p.snapshotId === pointId);
    if (!point) {
      return {
        success: false,
        restoredState: this.stateMachine.state,
        restoredContext: this.stateMachine.context,
        rollbackPoint: {} as RollbackPoint,
      };
    }

    // 注意：状态机的 transition 方法会修改内部状态，
    // 这里我们只记录回滚点信息，实际的恢复由 Loop 引擎协调完成
    return {
      success: true,
      restoredState: point.loopState,
      restoredContext: point.contextSnapshot,
      rollbackPoint: point,
    };
  }

  /**
   * 回滚到最近的一个稳定点
   */
  async rollbackToLastStable(): Promise<RollbackResult> {
    if (this.rollbackHistory.length === 0) {
      return {
        success: false,
        restoredState: this.stateMachine.state,
        restoredContext: this.stateMachine.context,
        rollbackPoint: {} as RollbackPoint,
      };
    }

    // 取最后一个回滚点（最近的）
    const lastPoint = this.rollbackHistory[this.rollbackHistory.length - 1];
    return this.rollback(lastPoint.snapshotId);
  }

  /**
   * 检查是否还可以重试
   */
  canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }

  /**
   * 获取当前重试次数
   */
  getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * 增加重试计数
   */
  incrementRetry(): number {
    this.retryCount += 1;
    return this.retryCount;
  }

  /**
   * 获取回滚历史
   */
  getHistory(): RollbackPoint[] {
    return [...this.rollbackHistory];
  }

  /**
   * 重置重试计数和回滚历史
   */
  reset(): void {
    this.retryCount = 0;
    this.rollbackHistory = [];
  }
}
