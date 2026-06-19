import type { StepTraceEntry, DecisionTraceEntry, ToolCallTraceEntry, SnapshotEntry, ReasoningTraceEntry, VerificationTraceEntry } from "./types.js";
export declare class StepTraceRecorder {
    record(params: {
        previousState: string;
        nextState: string;
        triggerReason: string;
        triggeredBy: string;
        taskId: string;
        metadata?: Record<string, unknown>;
    }): StepTraceEntry;
}
export declare class DecisionTraceRecorder {
    record(params: {
        agentType: string;
        decisionPoint: string;
        inputPrompt: string;
        outputReasoning?: string;
        finalChoice: string;
        confidence?: number;
        alternatives?: Array<{
            choice: string;
            reasoning: string;
        }>;
        taskId: string;
    }): DecisionTraceEntry;
}
export declare class ToolCallTraceRecorder {
    private pendingCalls;
    startCall(toolName: string, toolCategory: "local" | "mcp" | "skill", callerAgent: string, inputParams: Record<string, unknown>, taskId: string): {
        traceId: string;
    };
    endCall(traceId: string, result: unknown, success: boolean, errorMessage?: string, mcpServerName?: string): ToolCallTraceEntry;
}
export declare class SnapshotRecorder {
    capture(params: {
        snapshotType: SnapshotEntry["snapshotType"];
        loopState: string;
        systemState: Record<string, unknown>;
        taskId: string;
    }): SnapshotEntry;
}
export declare class ReasoningTraceRecorder {
    record(params: {
        agentType: string;
        inputPrompt: string;
        reasoningProcess: string;
        finalOutput: string;
        tokenUsage?: {
            prompt: number;
            completion: number;
        };
        modelUsed?: string;
        taskId: string;
    }): ReasoningTraceEntry;
}
export declare class VerificationTraceRecorder {
    record(params: {
        goalId: string;
        method: string;
        passed: boolean;
        durationMs: number;
        evidenceSummary: VerificationTraceEntry["evidenceSummary"];
        round: number;
        taskId: string;
    }): VerificationTraceEntry;
}
//# sourceMappingURL=trace-recorders.d.ts.map