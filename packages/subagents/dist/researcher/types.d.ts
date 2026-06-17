export interface ResearcherInput {
    taskId: string;
    topic: string;
    taskInput: string;
    interrogationResults?: Record<string, string>;
    maxSources?: number;
}
export interface ResearchSource {
    title: string;
    url: string;
    relevance: number;
    publishedDate?: string;
    keyPoints: string[];
    credibility: "high" | "medium" | "low";
}
export interface ResearcherOutput {
    sources: ResearchSource[];
    summary: string;
    sourceCount: number;
    usedTools: string[];
}
//# sourceMappingURL=types.d.ts.map