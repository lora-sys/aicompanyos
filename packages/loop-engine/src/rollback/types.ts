import type { LoopState, LoopContext, ExecutionPlan } from "../types.js";

// 回滚点快照
export interface RollbackPoint {
  snapshotId: string;
  timestamp: Date;
  loopState: LoopState;
  contextSnapshot: LoopContext;
  planSnapshot?: ExecutionPlan;
  evidenceChainSnapshotId: string;
}

// 回滚结果
export interface RollbackResult {
  success: boolean;
  restoredState: LoopState;
  restoredContext: LoopContext;
  rollbackPoint: RollbackPoint;
}
