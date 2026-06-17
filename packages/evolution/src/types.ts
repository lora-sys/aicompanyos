// Self-Evolution System 类型定义

import type { TraceEntry, DecisionTraceEntry, ToolCallTraceEntry } from "@aicos/evidence-chain";
import type { DesignMDXData, UserMemoryData, SelfMemoryData, SelfExperienceEntry } from "@aicos/memory";
import type { LLMProvider } from "@aicos/loop-engine/types";

// ============================================================
// #2.2 Evolution 解耦接口
// 替代对 @aicos/evidence-chain 和 @aicos/memory 的直接依赖
// 使 evolution 包可独立编译和测试
// ============================================================

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

// === 进化模式 ===
export enum EvolutionMode {
  REGULAR = "regular", // 常规进化（每次任务后）
  DEEP = "deep", // 深度进化（异常检测触发）
}

// === 任务指标 ===
export interface TaskMetrics {
  consensusRounds: number; // 本任务共识轮次
  consensusPassed: boolean; // 最终是否通过
  replanCount: number; // Replan 次数
  executionDuration: number; // 执行耗时 ms
  userModifications?: number; // 用户手动修改次数（如有）
}

// === 进化信号（触发深度进化的条件） ===
export interface EvolutionSignal {
  type: "consensus_failure_rate" | "replan_frequency" | "user_modification" | "pattern_anomaly";
  value: number;
  threshold: number;
  triggered: boolean;
}

// === 异常检测器配置 ===
export interface AnomalyDetectorConfig {
  consensusFailureThreshold: number; // 共识失败率阈值，默认 0.6（60% 失败则触发）
  replanFrequencyThreshold: number; // Replan 频率阈值，默认 2 次
  maxRounds: number; // 最大轮次上限
}

// === 提取的模式 ===
export interface PreferencePatterns {
  writingStyleChanges?: { from: string; to: string };
  topicTendencies?: string[];
  newPreferences?: Array<{ key: string; value: string; confidence: number }>;
}

export interface ToolUsagePatterns {
  frequentTools: Array<{ toolName: string; callCount: number; avgDuration: number }>;
  failedTools: Array<{ toolName: string; failCount: number; commonErrors: string[] }>;
  usageEfficiencyTips: string[];
}

export interface UXDecisionPatterns {
  colorChanges?: { palette: object; reasoning: string };
  typographyChanges?: { settings: object; reasoning: string };
  layoutPreferences?: string[];
}

export interface ExtractedPatterns {
  preferences: PreferencePatterns; // 用户偏好变化
  toolUsage: ToolUsagePatterns; // 工具使用模式
  uxDecisions: UXDecisionPatterns; // UI/UX 决策
  successPatterns: string[]; // 成功模式
  failurePatterns: string[]; // 失败模式
}

// === 差异结果 ===
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

// === 合并结果 ===
export interface MergeResult {
  designBlocksUpdated: number;
  userFieldsUpdated: number;
  selfEntriesAdded: number;
  highRiskChangesDeferred: unknown[];
}

// === 进化结果 ===
export interface EvolutionResult {
  mode: EvolutionMode;
  designUpdates: { blockType: string; diff: string }[];
  userUpdates: { key: string; oldValue: string; newValue: string }[];
  selfExperience: {
    taskType: string;
    pattern: string;
    lesson: string;
    capabilityDelta?: object;
  };
  durationMs: number;
  signalsDetected: EvolutionSignal[];
}

// === 内部类型 ===
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

// === 类接口声明（实现在各自文件中） ===
export interface IPatternExtractor {
  extractPatterns(evidenceChain: IEvidenceReader): Promise<ExtractedPatterns>;
  /** 设置轻量级模式（跳过 LLM 分析，仅使用规则引擎） */
  setLightweightMode(enabled: boolean): void;
}

export interface IDiffGenerator {
  generateDesignDiff(currentDesign: DesignMDXData, patterns: UXDecisionPatterns): DesignDiffItem[];
  generateUserDiff(currentUser: UserMemoryData, patterns: PreferencePatterns): UserDiffItem[];
  generateSelfDiff(
    currentSelf: SelfMemoryData,
    patterns: ExtractedPatterns,
    taskSuccess: boolean,
    taskType: string,
  ): Omit<SelfExperienceEntry, "entryId" | "timestamp">;
}

export interface IAutoMerger {
  mergeAll(diff: DiffResult): Promise<MergeResult>;
  mergeDesignChanges(diffs: DesignDiffItem[]): Promise<number>;
  mergeUserChanges(diffs: UserDiffItem[]): Promise<number>;
  mergeSelfChange(entry: Omit<SelfExperienceEntry, "entryId" | "timestamp">): Promise<void>;
  assessRisk(change: unknown): { level: "low" | "medium" | "high"; score: number };
}

export interface IAnomalyDetector {
  recordMetrics(taskId: string, metrics: TaskMetrics): void;
  detect(taskId: string): EvolutionSignal[];
  getStats(): { totalTasks: number; avgConsensusRate: number; avgReplanCount: number };
}
