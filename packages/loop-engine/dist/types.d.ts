export declare enum LoopState {
    IDLE = "idle",
    INTERROGATING = "interrogating",
    PLANNING = "planning",
    EXECUTING = "executing",
    VERIFYING = "verifying",
    EVOLVING = "evolving",
    DONE = "done"
}
export type StateTransition = {
    from: LoopState.IDLE;
    to: LoopState.INTERROGATING;
} | {
    from: LoopState.INTERROGATING;
    to: LoopState.PLANNING;
} | {
    from: LoopState.PLANNING;
    to: LoopState.EXECUTING;
} | {
    from: LoopState.EXECUTING;
    to: LoopState.VERIFYING;
} | {
    from: LoopState.VERIFYING;
    to: LoopState.EVOLVING;
} | {
    from: LoopState.EVOLVING;
    to: LoopState.DONE;
} | {
    from: LoopState.VERIFYING;
    to: LoopState.PLANNING;
};
export interface StateChangeEvent {
    previousState: LoopState;
    nextState: LoopState;
    timestamp: Date;
    reason?: string;
    trigger?: string;
}
export type TransitionGuard = (transition: StateTransition, context: LoopContext) => boolean | Promise<boolean>;
export type StateHook = (event: StateChangeEvent, context: LoopContext) => void | Promise<void>;
export interface LoopContext {
    taskId: string;
    taskInput: string;
    retryCount: number;
    consensusRound: number;
    interrogationResults?: Record<string, string>;
    plan?: ExecutionPlan;
    currentStep?: number;
    artifacts?: string[];
    evidenceChainId?: string;
    selfExperience?: {
        lessons?: string[];
        content?: string;
        pattern?: string;
        type?: "success" | "learning";
    };
    designMDX?: string;
    userPreferences?: Record<string, string>;
    uiuxGuidance?: unknown;
    previousOutputs?: Record<string, {
        content: string;
    }>;
    extensions?: Record<string, unknown>;
}
export type TaskProfile = "technical-blog" | "tutorial" | "design-doc" | "code-review" | "generic";
export interface ExecutionPlan {
    id: string;
    steps: PlanStep[];
    createdAt: Date;
    /** 任务类型档位，用于选取对应的阈值配置 */
    taskProfile?: TaskProfile;
}
export interface PlanStep {
    stepId: string;
    agentType: "writer" | "critic" | "ui-ux";
    description: string;
    expectedOutput: string;
    toolsNeeded: string[];
}
//# sourceMappingURL=types.d.ts.map