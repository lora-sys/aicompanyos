export interface StepTraceEntry {
    type: "step";
    traceId: string;
    timestamp: string;
    previousState: string;
    nextState: string;
    triggerReason: string;
    triggeredBy: string;
    taskId: string;
    metadata?: Record<string, unknown>;
}
export interface DecisionTraceEntry {
    type: "decision";
    traceId: string;
    timestamp: string;
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
    metadata?: Record<string, unknown>;
}
export interface ToolCallTraceEntry {
    type: "tool_call";
    traceId: string;
    timestamp: string;
    toolName: string;
    toolCategory: "local" | "mcp" | "skill";
    callerAgent: string;
    inputParams: Record<string, unknown>;
    outputResult: unknown;
    success: boolean;
    errorMessage?: string;
    durationMs: number;
    mcpServerName?: string;
    taskId: string;
    metadata?: Record<string, unknown>;
}
export interface SnapshotEntry {
    type: "snapshot";
    traceId: string;
    timestamp: string;
    snapshotType: "pre_execute" | "post_verify" | "pre_replan" | "post_evolution" | "custom";
    loopState: string;
    systemState: Record<string, unknown>;
    taskId: string;
    metadata?: Record<string, unknown>;
}
export interface ReasoningTraceEntry {
    type: "reasoning";
    traceId: string;
    timestamp: string;
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
    metadata?: Record<string, unknown>;
}
export type TraceEntry = StepTraceEntry | DecisionTraceEntry | ToolCallTraceEntry | SnapshotEntry | ReasoningTraceEntry;
export interface EvidenceChainMeta {
    chainId: string;
    taskId: string;
    taskInput: string;
    startedAt: string;
    endedAt?: string;
    totalEntries: number;
    entryCounts: {
        steps: number;
        decisions: number;
        toolCalls: number;
        snapshots: number;
        reasonings: number;
    };
}
//# sourceMappingURL=types.d.ts.map