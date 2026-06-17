import type { PlanStep } from "@aicos/loop-engine/types";
import type { WriterOutput } from "../writer/types.js";
export interface CriticInput {
    taskId: string;
    writerOutput: WriterOutput | {
        content: string;
        artifactPath: string;
    };
    originalTask: string;
    planStep: PlanStep;
    context: {
        interrogationResults: Record<string, string>;
        designMDX?: string;
        userPreferences?: Record<string, string>;
    };
}
export interface CriticOutput {
    overallScore: number;
    dimensions: {
        topicAccuracy: {
            score: number;
            comment: string;
        };
        technicalDepth: {
            score: number;
            comment: string;
        };
        codeQuality: {
            score: number;
            comment: string;
        };
        readability: {
            score: number;
            comment: string;
        };
        originality: {
            score: number;
            comment: string;
        };
    };
    passed: boolean;
    suggestions: Array<{
        type: "content" | "structure" | "style" | "format" | "ux";
        severity: "critical" | "major" | "minor";
        location?: string;
        description: string;
        suggestion: string;
    }>;
    reasoning: string;
}
//# sourceMappingURL=types.d.ts.map