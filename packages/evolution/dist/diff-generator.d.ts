import type { DesignMDXData, UserMemoryData, SelfMemoryData, SelfExperienceEntry } from "@aicos/memory";
import type { ExtractedPatterns, PreferencePatterns, UXDecisionPatterns, DesignDiffItem, UserDiffItem, CriticSummary } from "./types.js";
export declare class DiffGenerator {
    generateDesignDiff(currentDesign: DesignMDXData, patterns: UXDecisionPatterns): DesignDiffItem[];
    generateUserDiff(currentUser: UserMemoryData, patterns: PreferencePatterns): UserDiffItem[];
    generateSelfDiff(_currentSelf: SelfMemoryData, patterns: ExtractedPatterns, taskSuccess: boolean, taskType: string, criticSummary?: CriticSummary, guardSummary?: {
        totalGoals: number;
        verifiedGoals: number;
        stopReason?: string;
    }): Omit<SelfExperienceEntry, "entryId" | "timestamp">;
    private generateLesson;
}
//# sourceMappingURL=diff-generator.d.ts.map