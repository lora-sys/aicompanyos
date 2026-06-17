import type { TraceEntry } from "@aicos/evidence-chain";
import type { DesignMDXData, UserMemoryData, SelfMemoryData, SelfExperienceEntry } from "@aicos/memory";
import type { LLMProvider } from "@aicos/loop-engine/types";
/**
 * 证据链读取接口
 * Evolution 包只需要从 EvidenceChain 读取数据，不需要写入能力
 * 任何实现了此接口的对象都可注入（真实 EvidenceChain 或 Mock）
 */
export interface IEvidenceReader {
    /** 获取所有证据条目 */
    getEntries(): TraceEntry[];
    /** 按类型筛选证据条目 */
    getEntriesByType(type: string): TraceEntry[];
}
/**
 * 进化文档读写接口
 * Evolution 包需要读写 design.mdx / user.md / self.md
 * 此接口抽象了 EvolutionDocsManager 的具体实现
 */
export interface IEvolutionDocWriter {
    /** 读取当前 design.mdx 内容 */
    getDesignMDX(): Promise<DesignMDXData | null>;
    /** 读取当前 user.md 内容 */
    getUserMD(): Promise<UserMemoryData | null>;
    /** 读取当前 self.md 内容 */
    getSelfMD(): Promise<SelfMemoryData | null>;
    /** 更新 design.mdx 中的某个设计块 */
    updateDesignBlock(blockType: string, content: string, source?: string): Promise<void>;
    /** 更新 user.md 中的某个字段 */
    updateUserField(key: string, value: string, source?: string, confidence?: number): Promise<void>;
    /** 向 self.md 追加一条经验条目 */
    addExperience(entry: Omit<SelfExperienceEntry, "entryId" | "timestamp">): Promise<void>;
}
export declare enum EvolutionMode {
    REGULAR = "regular",// 常规进化（每次任务后）
    DEEP = "deep"
}
export interface TaskMetrics {
    consensusRounds: number;
    consensusPassed: boolean;
    replanCount: number;
    executionDuration: number;
    userModifications?: number;
}
export interface EvolutionSignal {
    type: "consensus_failure_rate" | "replan_frequency" | "user_modification" | "pattern_anomaly";
    value: number;
    threshold: number;
    triggered: boolean;
}
export interface AnomalyDetectorConfig {
    consensusFailureThreshold: number;
    replanFrequencyThreshold: number;
    maxRounds: number;
}
export interface PreferencePatterns {
    writingStyleChanges?: {
        from: string;
        to: string;
    };
    topicTendencies?: string[];
    newPreferences?: Array<{
        key: string;
        value: string;
        confidence: number;
    }>;
}
export interface ToolUsagePatterns {
    frequentTools: Array<{
        toolName: string;
        callCount: number;
        avgDuration: number;
    }>;
    failedTools: Array<{
        toolName: string;
        failCount: number;
        commonErrors: string[];
    }>;
    usageEfficiencyTips: string[];
}
export interface UXDecisionPatterns {
    colorChanges?: {
        palette: object;
        reasoning: string;
    };
    typographyChanges?: {
        settings: object;
        reasoning: string;
    };
    layoutPreferences?: string[];
}
export interface ExtractedPatterns {
    preferences: PreferencePatterns;
    toolUsage: ToolUsagePatterns;
    uxDecisions: UXDecisionPatterns;
    successPatterns: string[];
    failurePatterns: string[];
}
export interface DesignDiffItem {
    blockType: string;
    currentContent: string;
    suggestedContent: string;
    reason: string;
}
export interface UserDiffItem {
    key: string;
    currentValue: string;
    suggestedValue: string;
    confidence: number;
}
export interface DiffResult {
    designDiffs: DesignDiffItem[];
    userDiffs: UserDiffItem[];
    selfDiff: Omit<SelfExperienceEntry, "entryId" | "timestamp">;
}
export interface MergeResult {
    designBlocksUpdated: number;
    userFieldsUpdated: number;
    selfEntriesAdded: number;
    highRiskChangesDeferred: unknown[];
}
export interface EvolutionResult {
    mode: EvolutionMode;
    designUpdates: {
        blockType: string;
        diff: string;
    }[];
    userUpdates: {
        key: string;
        oldValue: string;
        newValue: string;
    }[];
    selfExperience: {
        taskType: string;
        pattern: string;
        lesson: string;
        capabilityDelta?: object;
    };
    durationMs: number;
    signalsDetected: EvolutionSignal[];
}
export interface EvolutionDependencies {
    patternExtractor: IPatternExtractor;
    diffGenerator: IDiffGenerator;
    autoMerger: IAutoMerger;
    anomalyDetector: IAnomalyDetector;
    llmProvider: LLMProvider;
}
export type EvolutionParams = {
    evidenceChain: IEvidenceReader;
    evolutionDocs: IEvolutionDocWriter;
    taskId: string;
    taskSuccess: boolean;
};
export interface IPatternExtractor {
    extractPatterns(evidenceChain: IEvidenceReader): Promise<ExtractedPatterns>;
    /** 设置轻量级模式（跳过 LLM 分析，仅使用规则引擎） */
    setLightweightMode(enabled: boolean): void;
}
export interface IDiffGenerator {
    generateDesignDiff(currentDesign: DesignMDXData, patterns: UXDecisionPatterns): DesignDiffItem[];
    generateUserDiff(currentUser: UserMemoryData, patterns: PreferencePatterns): UserDiffItem[];
    generateSelfDiff(currentSelf: SelfMemoryData, patterns: ExtractedPatterns, taskSuccess: boolean, taskType: string): Omit<SelfExperienceEntry, "entryId" | "timestamp">;
}
export interface IAutoMerger {
    mergeAll(diff: DiffResult): Promise<MergeResult>;
    mergeDesignChanges(diffs: DesignDiffItem[]): Promise<number>;
    mergeUserChanges(diffs: UserDiffItem[]): Promise<number>;
    mergeSelfChange(entry: Omit<SelfExperienceEntry, "entryId" | "timestamp">): Promise<void>;
    assessRisk(change: unknown): {
        level: "low" | "medium" | "high";
        score: number;
    };
}
export interface IAnomalyDetector {
    recordMetrics(taskId: string, metrics: TaskMetrics): void;
    detect(taskId: string): EvolutionSignal[];
    getStats(): {
        totalTasks: number;
        avgConsensusRate: number;
        avgReplanCount: number;
    };
}
//# sourceMappingURL=types.d.ts.map