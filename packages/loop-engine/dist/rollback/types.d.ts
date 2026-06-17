import type { LoopState, LoopContext, ExecutionPlan } from "../types.js";
export interface RollbackPoint {
    snapshotId: string;
    timestamp: Date;
    loopState: LoopState;
    contextSnapshot: LoopContext;
    planSnapshot?: ExecutionPlan;
    evidenceChainSnapshotId: string;
}
export interface RollbackResult {
    success: boolean;
    restoredState: LoopState;
    restoredContext: LoopContext;
    rollbackPoint: RollbackPoint;
}
//# sourceMappingURL=types.d.ts.map