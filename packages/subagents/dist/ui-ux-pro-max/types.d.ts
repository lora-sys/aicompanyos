export interface UIUXSkillInput {
    taskType: string;
    contentType: string;
    currentDesignMDX?: string;
    userPreferences?: Record<string, string>;
    contextHints?: string[];
}
export interface UIUXSkillOutput {
    colorPalette: {
        primary: string;
        secondary: string;
        accent: string;
        background: string;
        text: string;
        reasoning: string;
    };
    typography: {
        headingFont: string;
        bodyFont: string;
        headingSizes: Record<string, string>;
        lineHeight: string;
        letterSpacing: string;
        reasoning: string;
    };
    layoutSuggestion: {
        template: string;
        spacing: string;
        componentStructure: string[];
        reasoning: string;
    };
    designTokens: {
        borderRadius: string;
        shadow: string;
        paddingScale: string;
        reasoning: string;
    };
    overallGuidance: string;
    confidence: number;
}
export interface UIUXAgentInput {
    artifactPath: string;
    artifactContent: string;
    taskType: string;
    designMDX?: string;
}
export interface UIUXAgentOutput {
    score: number;
    dimensions: {
        colorHarmony: {
            score: number;
            comment: string;
        };
        typography: {
            score: number;
            comment: string;
        };
        layout: {
            score: number;
            comment: string;
        };
        visualHierarchy: {
            score: number;
            comment: string;
        };
        accessibility: {
            score: number;
            comment: string;
        };
    };
    passed: boolean;
    suggestions: Array<{
        type: "color" | "typography" | "layout" | "general";
        priority: "high" | "medium" | "low";
        description: string;
        suggestion: string;
    }>;
    reasoning: string;
}
export declare enum UIUXMode {
    SKILL = "skill",
    AGENT = "agent"
}
//# sourceMappingURL=types.d.ts.map