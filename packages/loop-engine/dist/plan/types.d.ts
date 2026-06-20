import type { ExecutionPlan, WorkerRole } from "../types.js";
export interface PlanGenerationInput {
    taskInput: string;
    interrogationResults: Record<string, string>;
    availableAgents: (WorkerRole | string)[];
    availableTools: string[];
}
export interface PlanGenerationResult {
    plan: ExecutionPlan;
    reasoning: string;
}
//# sourceMappingURL=types.d.ts.map