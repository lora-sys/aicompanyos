import type { UIUXSkillOutput } from "../ui-ux-pro-max/types.js";
export interface WriterInput {
    taskId: string;
    planStep: {
        stepId: string;
        description: string;
        expectedOutput: string;
        toolsNeeded: string[];
    };
    context: {
        interrogationResults: Record<string, string>;
        userPreferences?: Record<string, string>;
        designMDX?: string;
        uiuxGuidance?: UIUXSkillOutput;
        previousOutputs?: Record<string, unknown>;
    };
    lengthConstraint?: string;
    languagePreference?: string;
    criticFeedback?: string;
    rewriteRound?: number;
    customSystemPrompt?: string;
}
export interface WriterOutput {
    content: string;
    artifactPath: string;
    wordCount: number;
    references: string[];
    usedTools: string[];
}
//# sourceMappingURL=types.d.ts.map