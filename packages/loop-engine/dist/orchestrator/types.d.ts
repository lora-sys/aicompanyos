export interface StepExecutionResult {
    stepId: string;
    agentType: string;
    success: boolean;
    output: unknown;
    error?: string;
    durationMs: number;
}
export interface OrchestratorConfig {
    maxConcurrentSteps: number;
    timeoutPerStep: number;
}
export interface StandardAgentContext {
    taskId: string;
    taskInput: string;
    interrogationResults?: Record<string, string>;
    selfExperience?: {
        lessons?: string[];
        content?: string;
        pattern?: string;
        type?: "success" | "learning";
    };
    designMDX?: string;
    userPreferences?: Record<string, string>;
    uiuxGuidance?: unknown;
    extensions?: Record<string, unknown>;
}
export interface AgentExecutor {
    execute(params: {
        step: import("../types.js").PlanStep;
        tools: import("../tool-registry/registry.js").ToolRegistry;
        context: StandardAgentContext;
        previousOutputs: Record<string, {
            content: string;
        }>;
    }): Promise<unknown>;
}
export interface EvidenceChainRef {
    readonly id: string;
    append(entry: unknown): Promise<void>;
}
export interface MemoryManagerRef {
    read(key: string): Promise<unknown>;
    write(key: string, value: unknown): Promise<void>;
}
export interface OrchestratorAgentContext {
    taskId: string;
    evidenceChain: EvidenceChainRef;
    memoryManager: MemoryManagerRef;
    designMDX?: string;
    userPreferences?: Record<string, string>;
}
//# sourceMappingURL=types.d.ts.map