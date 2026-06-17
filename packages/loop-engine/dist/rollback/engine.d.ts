import type { LoopStateMachine } from "../state-machine.js";
import type { LoopContext, ExecutionPlan } from "../types.js";
import type { RollbackPoint, RollbackResult } from "./types.js";
/**
 * 回滚管理器 - 管理状态快照和回滚/重试逻辑
 */
export declare class RollbackManager {
    private stateMachine;
    private maxRetries;
    private rollbackHistory;
    private retryCount;
    constructor(stateMachine: LoopStateMachine, maxRetries?: number);
    /**
     * 创建回滚点（在关键节点调用）
     */
    createRollbackPoint(context: LoopContext, plan?: ExecutionPlan, evidenceChainSnapshotId?: string): RollbackPoint;
    /**
     * 回滚到指定点
     */
    rollback(pointId: string): Promise<RollbackResult>;
    /**
     * 回滚到最近的一个稳定点
     */
    rollbackToLastStable(): Promise<RollbackResult>;
    /**
     * 检查是否还可以重试
     */
    canRetry(): boolean;
    /**
     * 获取当前重试次数
     */
    getRetryCount(): number;
    /**
     * 增加重试计数
     */
    incrementRetry(): number;
    /**
     * 获取回滚历史
     */
    getHistory(): RollbackPoint[];
    /**
     * 重置重试计数和回滚历史
     */
    reset(): void;
}
//# sourceMappingURL=engine.d.ts.map