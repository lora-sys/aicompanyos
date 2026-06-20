import type { SelfExperienceEntry } from "@aicos/memory";
import type { IEvolutionDocWriter } from "./types.js";
import type { DiffResult, DesignDiffItem, UserDiffItem, MergeResult } from "./types.js";
export declare class AutoMerger {
    private evolutionDocs;
    private riskThreshold;
    constructor(evolutionDocs: IEvolutionDocWriter, riskThreshold?: number);
    mergeAll(diff: DiffResult): Promise<MergeResult>;
    mergeDesignChanges(diffs: DesignDiffItem[]): Promise<number>;
    mergeUserChanges(diffs: UserDiffItem[]): Promise<number>;
    mergeSelfChange(entry: Omit<SelfExperienceEntry, "entryId" | "timestamp">): Promise<void>;
    assessRisk(change: unknown): {
        level: "low" | "medium" | "high";
        score: number;
    };
    private isDesignDiff;
    private isUserDiff;
    private assessDesignRisk;
    private assessUserRisk;
}
//# sourceMappingURL=auto-merger.d.ts.map