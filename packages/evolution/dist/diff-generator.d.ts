import type { DesignMDXData, UserMemoryData, SelfMemoryData, SelfExperienceEntry } from "@aicos/memory";
import type { ExtractedPatterns, PreferencePatterns, UXDecisionPatterns, DesignDiffItem, UserDiffItem } from "./types";
export declare class DiffGenerator {
    generateDesignDiff(currentDesign: DesignMDXData, patterns: UXDecisionPatterns): DesignDiffItem[];
    generateUserDiff(currentUser: UserMemoryData, patterns: PreferencePatterns): UserDiffItem[];
    generateSelfDiff(_currentSelf: SelfMemoryData, patterns: ExtractedPatterns, taskSuccess: boolean, taskType: string): Omit<SelfExperienceEntry, "entryId" | "timestamp">;
    private generateLesson;
}
//# sourceMappingURL=diff-generator.d.ts.map