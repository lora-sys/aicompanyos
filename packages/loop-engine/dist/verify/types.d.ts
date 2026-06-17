import type { ExecutionPlan } from "../types.js";
export interface VerifyInput {
    artifacts: string[];
    originalTask: string;
    interrogationResults: Record<string, string>;
    plan: ExecutionPlan;
}
export interface VerifyResult {
    passed: boolean;
    score: number;
    reasons: string[];
    artifactChecks: Array<{
        path: string;
        exists: boolean;
        nonEmpty: boolean;
        qualityScore: number;
    }>;
}
export interface VerifyConfig {
    threshold: number;
    checkFileExistence: boolean;
    checkContentQuality: boolean;
}
//# sourceMappingURL=types.d.ts.map