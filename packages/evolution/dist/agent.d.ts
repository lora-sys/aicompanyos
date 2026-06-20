import type { IEvidenceReader, IEvolutionDocWriter } from "./types.js";
import type { EvolutionResult, TaskMetrics, EvolutionDependencies } from "./types.js";
export declare class EvolutionAgent {
    static readonly AGENT_NAME = "evolution";
    static readonly SYSTEM_PROMPT = "\u4F60\u662F\u4E00\u4E2A\u81EA\u6211\u53CD\u601D\u4E0E\u6A21\u5F0F\u5B66\u4E60\u5F15\u64CE\u3002\u4F60\u7684\u4EFB\u52A1\u662F\uFF1A\n1. \u56DE\u987E\u5B8C\u6574\u7684\u6267\u884C\u8BC1\u636E\u94FE\uFF08Evidence Chain\uFF09\n2. \u8BC6\u522B\u91CD\u590D\u51FA\u73B0\u7684\u6A21\u5F0F\u548C\u504F\u597D\n3. \u68C0\u6D4B\u5F02\u5E38\u4FE1\u53F7\n4. \u751F\u6210\u5BF9\u7CFB\u7EDF\u8FDB\u5316\u6587\u6863\u7684\u589E\u91CF\u66F4\u65B0\u5EFA\u8BAE\n\n\u4F60\u5173\u6CE8\u4EE5\u4E0B\u7EF4\u5EA6\u7684\u8FDB\u5316\uFF1A\n- design.mdx: \u89C6\u89C9 DNA / Design System \u66F4\u65B0\n- user.md: \u7528\u6237\u504F\u597D\u753B\u50CF\u66F4\u65B0\n- self.md: \u7CFB\u7EDF\u81EA\u6211\u8BA4\u77E5 / \u7ECF\u9A8C\u79EF\u7D2F";
    private patternExtractor;
    private diffGenerator;
    private autoMerger;
    private anomalyDetector;
    private llmProvider;
    constructor(deps: EvolutionDependencies);
    run(params: {
        evidenceChain: IEvidenceReader;
        evolutionDocs: IEvolutionDocWriter;
        taskId: string;
        taskInput: string;
        taskSuccess: boolean;
        taskMetrics: TaskMetrics;
        criticSummary?: import("./types.js").CriticSummary;
        guardSummary?: {
            totalGoals: number;
            verifiedGoals: number;
            stopReason?: string;
        };
    }): Promise<EvolutionResult>;
    private regularEvolve;
    private deepEvolve;
    private decideMode;
    private inferTaskType;
    private deepReflect;
}
//# sourceMappingURL=agent.d.ts.map