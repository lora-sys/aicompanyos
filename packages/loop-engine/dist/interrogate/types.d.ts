export interface InterrogationQuestion {
    questionId: string;
    dimension: string;
    dimensionEmoji: string;
    question: string;
    hints?: string[];
    required: boolean;
    answer?: string;
    skipped: boolean;
}
export interface InterrogationSession {
    sessionId: string;
    taskId: string;
    originalInput: string;
    questions: InterrogationQuestion[];
    currentIndex: number;
    collectedContext: Record<string, string>;
    isComplete: boolean;
    round: number;
    maxRounds: number;
}
export interface LLMProvider {
    chat(messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
    }>): Promise<string>;
}
//# sourceMappingURL=types.d.ts.map