// Self-Evolution System
// Evolution Agent + design.mdx/user.md/self.md 自进化引擎

// 类型
export {
  EvolutionMode,
  type TaskMetrics,
  type EvolutionSignal,
  type AnomalyDetectorConfig,
  type PreferencePatterns,
  type ToolUsagePatterns,
  type UXDecisionPatterns,
  type ExtractedPatterns,
  type DesignDiffItem,
  type UserDiffItem,
  type DiffResult,
  type MergeResult,
  type EvolutionResult,
  type EvolutionDependencies,
  type EvolutionParams,
  type CriticSummary,
  type IPatternExtractor,
  type IDiffGenerator,
  type IAutoMerger,
  type IAnomalyDetector,
  // #2.2 解耦接口
  type IEvidenceReader,
  type IEvolutionDocWriter,
} from "./types.js";

// 核心类
export { AnomalyDetector } from "./anomaly-detector.js";
export { PatternExtractor } from "./pattern-extractor.js";
export { DiffGenerator } from "./diff-generator.js";
export { AutoMerger } from "./auto-merger.js";
export { EvolutionAgent } from "./agent.js";
