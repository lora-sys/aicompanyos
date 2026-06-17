# @aicos/evolution — 自进化系统

> 模式学习 / 异常检测 / 差异生成 / 自动合并 | v0.1.0 | ESM

## 概述

`@aicos/evolution` 是 AICOS 系统的自进化引擎，负责在每个任务完成后从证据链（Evidence Chain）中提取行为模式、检测异常信号、生成对三份进化文档（`design.mdx` / `user.md` / `self.md`）的增量更新建议，并通过风险评估后自动合并低风险变更。

**核心设计理念**:
- **双模式进化**: 常规模式（每次任务后轻量分析）vs 深度模式（异常信号触发全面反思）
- **解耦接口**: 通过 `IEvidenceReader` 和 `IEvolutionDocWriter` 抽象依赖，可独立编译和测试
- **渐进降级**: LLM 分析 → 规则引擎 fallback → 安全兜底，确保永不阻塞主流程

## 核心导出

### 类型导出

| 符号 | 分类 | 说明 |
|------|------|------|
| `EvolutionMode` | 枚举 | 进化模式：`REGULAR` / `DEEP` |
| `TaskMetrics` | 接口 | 任务执行指标 |
| `EvolutionSignal` | 接口 | 异常信号（触发深度进化的条件） |
| `AnomalyDetectorConfig` | 接口 | 异常检测器配置 |
| `PreferencePatterns` | 接口 | 提取的用户偏好模式 |
| `ToolUsagePatterns` | 接口 | 提取的工具使用模式 |
| `UXDecisionPatterns` | 接口 | 提取的 UI/UX 决策模式 |
| `ExtractedPatterns` | 接口 | 综合提取结果 |
| `DesignDiffItem` | 接口 | design.mdx 差异项 |
| `UserDiffItem` | 接口 | user.md 差异项 |
| `DiffResult` | 接口 | 差异生成总结果 |
| `MergeResult` | 接口 | 合并操作结果 |
| `EvolutionResult` | 接口 | 进化执行最终结果 |
| `EvolutionDependencies` | 接口 | EvolutionAgent 构造依赖 |
| `EvolutionParams` | 类型 | 进化流程参数 |
| `IPatternExtractor` | 接口 | 模式提取器接口 |
| `IDiffGenerator` | 接口 | 差异生成器接口 |
| `IAutoMerger` | 接口 | 自动合并器接口 |
| `IAnomalyDetector` | 接口 | 异常检测器接口 |
| `IEvidenceReader` | 接口 | 证据链只读接口（#2.2 解耦） |
| `IEvolutionDocWriter` | 接口 | 进化文档读写接口（#2.2 解耦） |

### 类导出

| 符号 | 说明 |
|------|------|
| `EvolutionAgent` | 自进化引擎主入口，编排完整进化流程 |
| `PatternExtractor` | 从 Evidence Chain 中提取行为模式 |
| `AnomalyDetector` | 检测异常信号，决定是否触发深度进化 |
| `DiffGenerator` | 对比当前文档与新模式，生成增量差异 |
| `AutoMerger` | 评估变更风险并自动合并低风险项 |

## API 参考

---

### EvolutionAgent — 自进化引擎主入口

```typescript
class EvolutionAgent {
  static readonly AGENT_NAME = "evolution";
  static readonly SYSTEM_PROMPT: string;

  constructor(deps: EvolutionDependencies)

  // 主入口：执行一次完整的进化分析
  async run(params: {
    evidenceChain: IEvidenceReader;
    evolutionDocs: IEvolutionDocWriter;
    taskId: string;
    taskInput: string;
    taskSuccess: boolean;
    taskMetrics: TaskMetrics;
  }): Promise<EvolutionResult>
}
```

#### EvolutionDependencies（构造依赖）

```typescript
interface EvolutionDependencies {
  patternExtractor: IPatternExtractor;
  diffGenerator: IDiffGenerator;
  autoMerger: IAutoMerger;
  anomalyDetector: IAnomalyDetector;
  llmProvider: LLMProvider;
}
```

#### run() 内部流程

```
1. anomalyDetector.recordMetrics(taskId, taskMetrics)   // 记录指标
2. anomalyDetector.detect(taskId)                         // 检测异常信号
3. 若 executionDuration > 120s → 启用轻量级模式
4. decideMode(metrics, signals) → EvolutionMode           // 决定 REGULAR 或 DEEP
5. regularEvolve(params) 或 deepEvolve(params)            // 执行对应流程
6. 填充 durationMs / signalsDetected / mode               // 补充元信息
```

#### 进化模式决策逻辑

- **REGULAR 模式**: 无任何异常信号触发时使用，标准提取→差异→合并流程
- **DEEP 模式**: 任一 `EvolutionSignal.triggered === true` 时触发，在常规流程基础上追加 LLM 深度反思

#### deepReflect()（仅 DEEP 模式）

将完整证据链截断至 4000 字符，发送给 LLM 要求一句话总结最值得记住的经验教训，追加到 `selfExperience.lesson` 中。

---

### PatternExtractor — 模式提取器

```typescript
class PatternExtractor implements IPatternExtractor {
  constructor(
    llmProvider: LLMProvider,
    config?: PatternExtractorConfig
  )

  setLightweightMode(enabled: boolean): void
  extractPatterns(evidenceChain: IEvidenceReader): Promise<ExtractedPatterns>
}
```

#### PatternExtractorConfig

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxLLMCalls` | `number` | `3` | 最大 LLM 调用次数，超限后降级规则引擎 |
| `lightweightMode` | `boolean` | `false` | 强制跳过 LLM，仅用规则引擎 |

#### extractPatterns() 执行策略

```
lightweightMode=true 或 llmCallCount >= maxLLMCalls
  → ruleBasedExtract()          // 零 LLM 调用的规则引擎
  → batchAnalyze()              // 一次 LLM 调用分析三类数据（批量优化）
    → 失败/超时 → ruleBasedExtract()  // 降级
```

#### batchAnalyze() 批量 Prompt

将三类数据（决策记录 / 工具调用记录 / UI/UX 决策）合并为一次 LLM 调用，期望返回 JSON 格式的 `ExtractedPatterns`。

#### 规则引擎 Fallback 方法

| 方法 | 分析目标 | 策略 |
|------|----------|------|
| `fallbackPreferenceAnalysis()` | 用户偏好 | 从 decisionPoint/finalChoice 提取关键词，高频主题作为偏好 |
| `fallbackToolAnalysis()` | 工具使用 | 统计调用频次/成功率/平均耗时，Top 5 常用 + 失败工具 |
| `fallbackUXAnalysis()` | UI/UX 决策 | 筛选 ui-ux agentType 决策，提取布局/颜色关键词 |
| `extractSuccessPatterns()` | 成功模式 | 工具成功率 + 高置信度决策占比 |
| `extractFailurePatterns()` | 失败模式 | 失败工具明细 + 低置信度决策计数 |

#### LLM 调用保护

- 单次超时: `30_000ms`（通过 `Promise.race` + `AbortController` 实现）
- 最大调用次数: 可配置（默认 3 次），超限自动切换规则引擎

---

### AnomalyDetector — 异常检测器

```typescript
class AnomalyDetector implements IAnomalyDetector {
  constructor(config?: Partial<AnomalyDetectorConfig>)

  recordMetrics(taskId: string, metrics: TaskMetrics): void
  detect(taskId: string): EvolutionSignal[]
  getStats(): { totalTasks: number; avgConsensusRate: number; avgReplanCount: number }
}
```

#### AnomalyDetectorConfig（默认配置）

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `consensusFailureThreshold` | `0.6` | 共识失败率阈值（60%） |
| `replanFrequencyThreshold` | `2` | Replan 频率阈值（次） |
| `maxRounds` | `10` | 最大轮次上限 |

#### 三类检测信号

| 信号 type | 触发条件 | 默认阈值 |
|-----------|----------|----------|
| `consensus_failure_rate` | 最近 10 任务中有争议（consensusRounds > 1）的比例 | ≥ 60% |
| `replan_frequency` | 最大 replanCount ≥ 阈值 或 平均 ≥ 1.5 | max ≥ 2 或 avg ≥ 1.5 |
| `user_modification` | 平均每任务用户手动修改次数 | ≥ 1.0 |

#### detect() 返回值

返回所有被触发的 `EvolutionSignal[]`，空数组表示无需深度进化。`EvolutionAgent.run()`据此决定 `EvolutionMode`。

---

### DiffGenerator — 差异生成器

```typescript
class DiffGenerator implements IDiffGenerator {
  generateDesignDiff(currentDesign: DesignMDXData, patterns: UXDecisionPatterns): DesignDiffItem[]
  generateUserDiff(currentUser: UserMemoryData, patterns: PreferencePatterns): UserDiffItem[]
  generateSelfDiff(
    currentSelf: SelfMemoryData,
    patterns: ExtractedPatterns,
    taskSuccess: boolean,
    taskType: string
  ): Omit<SelfExperienceEntry, "entryId" | "timestamp">
}
```

#### generateDesignDiff() — design.mdx 差异

按 `blockType` 匹配并生成差异：

| 检测条件 | blockType | 说明 |
|----------|-----------|------|
| `patterns.colorChanges` 存在 | `color_palette` | 色彩偏好变化 |
| `patterns.typographyChanges` 存在 | `typography` | 排版设置变化 |
| `patterns.layoutPreferences` 非空 | `layout_templates` | 布局偏好变化 |

#### generateUserDiff() — user.md 差异

| 检测条件 | key | confidence |
|----------|-----|------------|
| `writingStyleChanges` 存在 | `writingStyle` | 固定 0.85 |
| `newPreferences` 存在 | 各 pref.key | 取自 pref.confidence |

#### generateSelfDiff() — self.md 经验条目

根据 `taskSuccess` 选择 `successPatterns` 或 `failurePatterns`，综合生成：
- `type`: `"success"` 或 `"learning"`
- `taskType`: 从证据链决策推断（ui-ux → content-creation → review → general）
- `lesson`: 由 `generateLesson()` 综合 patterns 生成
- `capabilityDelta`: 含 `improvedStrategies`（效率提升）和/or `discoveredLimitations`（发现局限）

---

### AutoMerger — 自动合并引擎

```typescript
class AutoMerger implements IAutoMerger {
  constructor(evolutionDocs: IEvolutionDocWriter, riskThreshold?: number)

  mergeAll(diff: DiffResult): Promise<MergeResult>
  mergeDesignChanges(diffs: DesignDiffItem[]): Promise<number>
  mergeUserChanges(diffs: UserDiffItem[]): Promise<number>
  mergeSelfChange(entry: Omit<SelfExperienceEntry, "entryId" | "timestamp">): Promise<void>
  assessRisk(change: unknown): { level: "low" | "medium" | "high"; score: number }
}
```

#### 风险评估策略

**Design 变更**（基于内容变化幅度 `changeRatio`）:

| changeRatio | 风险等级 | score |
|-------------|----------|-------|
| < 0.3 | `low` | 0.9 |
| 0.3 ~ 0.7 | `medium` | 0.6 |
| ≥ 0.7 | `high` | 0.3 |

**User 变更**（基于置信度 `confidence` vs `riskThreshold`，默认 0.8）:

| confidence | 风险等级 |
|------------|----------|
| ≥ riskThreshold (0.8) | `low` |
| ≥ 0.5 | `medium` |
| < 0.5 | `high` |

**Self 变更**: 始终视为低风险，直接追加。

#### mergeAll() 行为

- 高风险变更（`level === "high"`）静默跳过，不计入 `highRiskChangesDeferred`
- design.mdx / user.md 不存在时 catch 后静默跳过
- self.md 不存在时 catch 后 `selfEntriesAdded = 0`

## 数据模型

### EvolutionSignal

```typescript
interface EvolutionSignal {
  type: "consensus_failure_rate" | "replan_frequency" | "user_modification" | "pattern_anomaly";
  value: number;       // 当前检测值
  threshold: number;   // 触发阈值
  triggered: boolean;  // 是否触发
}
```

### TaskMetrics

```typescript
interface TaskMetrics {
  consensusRounds: number;      // 本任务共识轮次
  consensusPassed: boolean;     // 最终是否通过
  replanCount: number;          // Replan 次数
  executionDuration: number;    // 执行耗时 (ms)
  userModifications?: number;   // 用户手动修改次数
}
```

### ExtractedPatterns

```typescript
interface ExtractedPatterns {
  preferences: PreferencePatterns;   // 用户偏好变化
  toolUsage: ToolUsagePatterns;      // 工具使用模式
  uxDecisions: UXDecisionPatterns;   // UI/UX 决策
  successPatterns: string[];         // 成功模式
  failurePatterns: string[];         // 失败模式
}
```

### EvolutionResult

```typescript
interface EvolutionResult {
  mode: EvolutionMode;
  designUpdates: Array<{ blockType: string; diff: string }>;
  userUpdates: Array<{ key: string; oldValue: string; newValue: string }>;
  selfExperience: {
    taskType: string;
    pattern: string;
    lesson: string;
    capabilityDelta?: object;
  };
  durationMs: number;
  signalsDetected: EvolutionSignal[];
}
```

### MergeResult

```typescript
interface MergeResult {
  designBlocksUpdated: number;       // 实际更新的 design block 数
  userFieldsUpdated: number;         // 实际更新的 user field 数
  selfEntriesAdded: number;          // 追加的经验条目数
  highRiskChangesDeferred: unknown[];// 被延期的高风险变更
}
```

### #2.2 解耦接口

```typescript
// 证据链只读接口 — 替代对 @aicos/evidence-chain 的直接依赖
interface IEvidenceReader {
  getEntries(): TraceEntry[];
  getEntriesByType(type: string): TraceEntry[];
}

// 进化文档读写接口 — 替代对 EvolutionDocsManager 的直接依赖
interface IEvolutionDocWriter {
  getDesignMDX(): Promise<DesignMDXData | null>;
  getUserMD(): Promise<UserMemoryData | null>;
  getSelfMD(): Promise<SelfMemoryData | null>;
  updateDesignBlock(blockType: string, content: string, source?: string): Promise<void>;
  updateUserField(key: string, value: string, source?: string, confidence?: number): Promise<void>;
  addExperience(entry: Omit<SelfExperienceEntry, "entryId" | "timestamp">): Promise<void>;
}
```

## 与其他模块的集成

```
┌─────────────────────────────────────────────────────────┐
│                   EvolutionAgent.run()                   │
│                                                           │
│  ┌──────────────┐                                         │
│  │AnomalyDetector│ ← recordMetrics + detect              │
│  │ (信号检测)     │                                         │
│  └──────┬───────┘                                         │
│         ↓ decideMode                                      │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐  │
│  │PatternExtractor│  │DiffGenerator │  │  AutoMerger   │  │
│  │ (模式提取)     │──→│ (差异生成)   │──→│ (风险评估合并)│  │
│  └──────────────┘    └─────────────┘    └──────┬───────┘  │
│                                              ↓           │
│                                    ┌─────────────────┐   │
│                                    │IEvolutionDocWriter│   │
│                                    │ design.mdx       │   │
│                                    │ user.md          │   │
│                                    │ self.md          │   │
│                                    └─────────────────┘   │
│                                                           │
│  输入: IEvidenceReader (@aicos/evidence-chain)            │
│  输出: EvolutionResult → CLI evolution-panel 展示         │
└─────────────────────────────────────────────────────────┘

依赖:
  @aicos/config         → 配置管理
  @aicos/evidence-chain → TraceEntry, DecisionTraceEntry, ToolCallTraceEntry
  @aicos/loop-engine    → LLMProvider
  @aicos/memory         → DesignMDXData, UserMemoryData, SelfMemoryData, SelfExperienceEntry
```

**典型调用链（来自 CLI 的 EVOLVING 阶段）**:

```
CLI.executeLoop()
  → evolutionAgent.run({
      evidenceChain: evidenceChain,       // 实现 IEvidenceReader
      evolutionDocs: evolutionDocsManager, // 实现 IEvolutionDocWriter
      taskId, taskInput, taskSuccess, taskMetrics
    })
    → result.designUpdates  → 更新 design.mdx
    → result.userUpdates    → 更新 user.md
    → result.selfExperience → 追加 self.md 经验条目
```

## 开发注意事项

1. **轻量级模式自动启用**: 当 `taskMetrics.executionDuration > 120_000ms`（120秒）时，`PatternExtractor` 自动切换到零 LLM 调用的规则引擎模式，避免拖慢主流程。
2. **LLM 调用有硬上限**: `PatternExtractor` 默认最多 3 次 LLM 调用，超限后永久降级到规则引擎。通过 `maxLLMCalls` 配置项可调整。
3. **高风险变更静默丢弃**: `AutoMerger` 对 `high` 风险变更不会抛错，只是跳过且不记录到 `highRiskChangesDeferred`（当前为空数组）。如需审计高风险变更需扩展此字段。
4. **IEvidenceReader / IEvolutionDocWriter 是关键抽象**: 这两个接口使 evolution 包可以脱离真实 `EvidenceChain` 和 `MemoryManager` 进行单元测试，注入 Mock 即可。
5. **deepReflect 截断保护**: 深度反思的证据链摘要截断至 4000 字符，防止 LLM 输入过长导致超时或费用过高。
6. **AnomalyDetector 滑动窗口**: `detect()` 只看最近 10 个任务的指标（`getRecentTasks(10)`），历史数据不影响当前判断。

## 相关文档

- [Evidence Chain 模块指南](../evidence-chain/MODULE_GUIDE.md)
- [Memory 模块指南](../memory/MODULE_GUIDE.md)
- [Loop Engine 模块指南](../loop-engine/MODULE_GUIDE.md)
- [CLI 应用模块指南](../cli/MODULE_GUIDE.md)
