import type { ExecutionPlan } from "../types.js";
export interface PlanGenerationInput {
    taskInput: string;
    interrogationResults: Record<string, string>;
    availableAgents: string[];
    availableTools: string[];
}
export interface PlanGenerationResult {
    plan: ExecutionPlan;
    reasoning: string;
}
//# sourceMappingURL=types.d.ts.map