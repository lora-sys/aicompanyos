# @aicos/loop-engine — Loop 引擎核心模块

> 模块定位：双层嵌套循环引擎，是整个 AI Company OS 的 Canonical 核心 | 版本 v0.3.0 | ESM | 最后更新 2026-06-18

## 概述

`@aicos/loop-engine` 是 AI Company OS 的核心执行引擎，实现了一套**双层嵌套循环架构**（Outer Loop: Plan 级 Replan + Inner Loop: Step 级 Writer→Critic 反馈环）。它以 `LoopStateMachine`（7 态有限状态机）驱动完整生命周期——从用户任务输入出发，经 `InterrogateEngine` 澄清需求、`PlanEngine` 生成执行计划、`LoopHarness`（委托给 `LoopModule`）执行 Writer→Critic 迭代优化、`ConsensusLock` 多票制审核、`VerifyEngine` 质量门控、最终由 `ArtifactManager` 输出产物（含 HTML 渲染能力），并在关键节点通过 `RollbackManager` 保障可恢复性。v0.3.0 起，通过 **ADR-005 部门制架构**支持多部门配置剖面注入（`ContentProductionDepartment` 为首个实现，`DepartmentConfig` 可直接传入 `LoopHarnessConfig`），以及 **ADR-004 目标驱动停止条件体系**（`CompletionGuard` 驱动基于 `AcceptanceGoal[]` 的自验证停止，替代纯分数门控）。

整个系统的设计哲学围绕四大 Seam 接口（`IPlannerAgent` / `IGeneratorAgent` / `IEvaluatorAgent` / `IEvolutionAgent`）展开，任何 Agent 只需实现这些接口即可接入循环引擎，实现了**物理层焊死**（Critic 完整输出直接注入 Writer 输入）与**Context Reset**（每次迭代清空上下文，通过 `IterationHandoff` 传递状态）两大核心原则。

## 架构总览

```
                        ┌──────────────────────────────────────┐
                        │          LoopStateMachine (7态)       │
                        │  IDLE → INTERROGATING → PLANNING      │
                        │    → EXECUTING → VERIFYING            │
                        │      → EVOLVING → DONE                │
                        │        ↑__________↓ (Replan 回路)     │
                        └──────────┬───────────┬────────────────┘
                                   │           │
                    ┌──────────────▼──┐   ┌─────▼────────────┐
                    │InterrogateEngine│   │   PlanEngine     │
                    │  需求澄清(多轮)  │   │ 执行计划生成(LLM) │
                    └───────┬─────────┘   └──────┬───────────┘
                            │                     │
                            ▼                     ▼
              ┌───────────────────────────────────────────┐
              │             LoopHarness (包装层)            │
              │  [departmentConfig?: DepartmentConfig] ★   │
              │  ┌─────────────────────────────────────┐  │
              │  │     LoopModule (Canonical 核心)      │  │
              │  │  Planner → Generator → Evaluator     │  │
              │  │  [+ SimpleEvolution] × N rounds     │  │
              │  └─────────────────────────────────────┘  │
              │         ↑ Writer-Critic 主路径             │
              │  ┌─────────────────┐                      │
              │  │ExecutionOrchestr.│ ← 非 Writer step    │
              │  │  (ui-ux 等)      │                      │
              │  └─────────────────┘                      │
              └─────────────────┬─────────────────────────┘
                                │
              ┌─────────────────┼─────────────────────────┐
              │                 │                         │
      ┌───────▼──────┐  ┌──────▼──────┐         ┌────────▼────────┐
      │ ConsensusLock │  │VerifyEngine │         │ ArtifactManager  │
      │ 多票制审核     │  │ 文件+质量验证│         │ 产物管理+HTML渲染 │
      └───────────────┘  └─────────────┘         └─────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   RollbackManager     │
                    │  状态快照 & 回滚恢复    │
                    └───────────────────────┘

  ── 基础设施层 ─────────────────────────────────────────────
  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐
  │ ToolRegistry │  │PiAILLMProvider│  │ LLMStructuredOutput│
  │ Local/MCP/   │  │(pi-ai/fetch) │  │ retryWithBackoff   │
  │ Skill 三类   │  │              │  │ CircuitBreaker     │
  └──────────────┘  └──────────────┘  │ ErrorClassifier     │
                                     └────────────────────┘
```

## 子模块清单

| 名称 | 职责 | 核心导出 | 关键文件 |
|------|------|----------|----------|
| **LoopModule** | Canonical 循环引擎，Planner→Generator→Evaluator+Evolution 四 Agent 架构 | `LoopModule`, `IPlannerAgent`, `IGeneratorAgent`, `IEvaluatorAgent`, `IEvolutionAgent` | `src/loop-module/engine.ts` |
| **GradingCriteria** | 固定评估标准体系，5 维评分 + 战略决策类型 | `GradingCriteria`, `GradingResult`, `StrategicDecision`, `IterationHandoff`, `DEFAULT_WRITING_CRITERIA` | `src/loop-module/grading-criteria.ts` |
| **LoopHarness** | 包装层，单路径模式（仅 LoopModule 主路径，v0.2.0 移除 fallback） | `LoopHarness`, `LoopHarnessConfig`, `DynamicExample`, `HarnessExecutionResult` | `src/loop-harness/engine.ts` |
| **LoopStateMachine** | 7 态有限状态机，含 Guard/Hook/事件发射 | `LoopStateMachine`, `LoopState`, `StateTransition` | `src/state-machine.ts` |
| **InterrogateEngine** | 需求澄清引擎，多轮追问式收集上下文 | `InterrogateEngine`, `InterrogationSession`, `InterrogationQuestion` | `src/interrogate/engine.ts` |
| **PlanEngine** | 执行计划生成器，LLM 驱动 + 后处理去重 | `PlanEngine`, `PlanGenerationInput`, `PlanGenerationResult` | `src/plan/engine.ts` |
| **VerifyEngine** | 质量验证引擎，文件存在性检查 + LLM 内容审核 | `VerifyEngine`, `VerifyInput`, `VerifyResult` | `src/verify/engine.ts` |
| **ConsensusLock** | 多 Agent 投票共识机制（Critic + Writer 自评 + UI-UX 可选） | `ConsensusLock`, `ConsensusVote`, `ConsensusResult`, `ConsensusConfig` | `src/consensus/engine.ts` |
| **ArtifactManager** | 产出物管理器，支持 Markdown→HTML 渲染（动态样式注入） | `ArtifactManager`, `Artifact`, `ArtifactType`, `HTMLStyleConfig` | `src/output/manager.ts` |
| **ToolRegistry** | 统一工具注册中心，三类工具源（Local / MCP / Skill） | `ToolRegistry`, `ToolDefinition`, `ToolCategory`, `MCPToolsAdapter`, `SkillToolsAdapter` | `src/tool-registry/registry.ts` |
| **RollbackManager** | 回滚管理器，状态快照创建与恢复 | `RollbackManager`, `RollbackPoint`, `RollbackResult` | `src/rollback/engine.ts` |
| **ExecutionOrchestrator** | 串行编排器（用于非 Writer step 如 ui-ux 的顺序执行） | `ExecutionOrchestrator`, `StepExecutionResult`, `AgentExecutor` | `src/orchestrator/engine.ts` |
| **Team Architecture** (v0.3.1+) | 动态团队抽象层：任务特征驱动的智能组队 | `TeamManager`, `TaskAnalyzer`, `TeamComposer`, `WorkerRegistry`, `HistoryReader` | `src/team/` |

## 动态团队架构 (v0.3.1+)

> 模块定位：通用层（不依赖任何部门），位于 `src/team/` 目录下 | 6 个文件 + 34 个单元测试

### 设计理念

团队是**任务的函数**，不是 contentType 的函数。同一个「内容产出部」的不同任务可能组成完全不同的团队：

```
任务输入 → TaskAnalyzer(规则引擎) → TaskFeatures(7维特征)
                                        ↓
                              TeamComposer(8条优先级规则)
                                        ↓
                              ITeam(2-5个Worker)
                                        ↓
                         createWorkerFactories() → Map<agentType, Factory>
                                        ↓
                              LoopHarness.registerAgent() 注入执行
```

### 核心组件

| 组件 | 职责 | 关键 API |
|------|------|----------|
| **TaskAnalyzer** | 从 taskInput 提取结构化特征（不调用 LLM） | `analyze(input): TaskFeatures` |
| **TeamComposer** | 优先级规则匹配引擎，第一个命中决定团队 | `compose(features): TeamWorkerDef[]` |
| **TeamManager** | 编排器：组合 Analyzer + Composer | `composeTeam(): ITeam` / `createWorkerFactories(): Map` |
| **WorkerRegistry** | 全局 Worker 注册表（role/agentType 双索引） | `register() / getWorkersByRole()` |
| **HistoryReader** | Memory 回流读取器：self.jsonl → Prompt 前缀 | `buildPromptPrefix(): HistoryPromptResult` |

### TaskFeatures（7 维特征）

```typescript
interface TaskFeatures {
  domain: ContentDomain;           // tech/lifestyle/finance/education/general
  needsResearch: boolean;          // 是否需要外部调研
  hasVisualContent: boolean;       // 是否有视觉设计需求
  length: "short"|"medium"|"long";
  qualityTier: "draft"|"standard"|"premium";
  complexity: "low"|"medium"|"high";
  estimatedSteps: number;
}
```

### 组合规则示例（content-production 部门的 8 条规则）

| Priority | 规则 ID | 匹配条件 | 团队 |
|----------|---------|----------|------|
| 10 | cp-premium-full-team | 高复杂度+调研+视觉+premium | Writer+Critic+Researcher+UIUX+Reviewer(5人) |
| 20 | cp-research-heavy | 高复杂度+调研+premium | Writer+Critic+Researcher+Reviewer(4人) |
| 30 | cp-visual-creative | 有视觉内容(非高复杂度) | Writer+Critic+UIUX(3人) |
| 50 | cp-light-research | 一般调研需求 | Writer+Critic+Researcher(light)(3人) |
| 60 | cp-premium-core | Premium质量无特殊需求 | Writer+Critic+Reviewer(3人) |
| 70 | cp-standard | 标准质量 | Writer+Critic(2人) |
| 80 | cp-draft | 草稿模式 | Writer+Critic(1轮)(2人) |
| 999 | cp-fallback | 兜底（始终匹配） | Writer+Critic(2人) |

### Memory 护城河（HistoryReader）

```
写入端: EvolutionAgent → addExperience() → self.md + self.jsonl
                                              ↓ (断裂点，v0.3.1 修复)
读取端: HistoryReader → getSelfMD() → buildPromptPrefix() → Writer System Prompt 前缀
```

HistoryReader 输出的 Prompt 前缀包含：
- ✅ 已掌握的能力（熟练度排序）
- 💡 相关经验教训（关键词匹配优先）
- 🚫 已知限制/注意事项
- 👤 目标用户画像

## 核心类型与接口

### LoopModule（Canonical 循环引擎）

#### 类签名与构造函数

```typescript
class LoopModule<TInput = string, TPlan = any, TOutput = any> {
  constructor(params: {
    planner: IPlannerAgent<TInput, TPlan>;
    generator: IGeneratorAgent<TPlan, TOutput>;
    evaluator: IEvaluatorAgent<TOutput>;
    evolution?: IEvolutionAgent;
    criteria?: GradingCriteria;
    config?: Partial<LoopModuleConfig>;
  });

  getConfig(): Readonly<LoopModuleConfig>;
  getCriteria(): Readonly<GradingCriteria>;
  run(input: TInput): Promise<LoopModuleResult<TOutput>>;
}
```

#### 默认配置 (`LoopModuleConfig`)

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `maxIterations` | `5` | 最大迭代次数（含首次） |
| `enableDegradationGuard` | `true` | 是否启用退化保护（分数下降则终止） |
| `enableEvolution` | `true` | 是否启用自进化分析 |
| `stagnationThreshold` | `2` | 连续多少轮分数无改善触发 pivot |
| `useContextReset` | `true` | Context Reset: 每次迭代间重置 Generator 上下文 |

#### 四大 Seam 接口

```typescript
/** 规划器：将任务拆解为执行计划 */
interface IPlannerAgent<Input = any, Plan = any> {
  plan(input: Input, context?: Record<string, unknown>): Promise<Plan>;
}

/** 生成器：根据计划 + 反馈生成产出 */
interface IGeneratorAgent<Plan = any, Output = any> {
  generate(
    plan: Plan,
    feedback?: string,
    handoff?: IterationHandoff
  ): Promise<Output>;
}

/** 评估器：按照固定标准评估产出 */
interface IEvaluatorAgent<Output = any> {
  evaluate(
    output: Output,
    criteria: GradingCriteria,
    originalTask: string
  ): Promise<GradingResult>;
}

/** 自进化器：学习迭代模式，优化策略 */
interface IEvolutionAgent {
  analyze(
    history: GradingResult[]
  ): Promise<{
    decision: StrategicDecision;
    reason: string;
    patternInsights?: string[];
  }>;
}
```

#### `run()` 执行流程

```
run(input)
  ├─ Step 1: Planner.plan(input)          [带重试: maxAttempts=2, baseDelayMs=1000]
  │
  ├─ Step 2~4: for round = 1..maxIterations
  │   ├─ Generator.generate(plan, feedback?, handoff?)  [重试: maxAttempts=3, baseDelayMs=1500]
  │   ├─ Evaluator.evaluate(output, criteria, task)     [重试: maxAttempts=2, baseDelayMs=1000]
  │   ├─ makeStrategicDecision(evaluation)              → refine | pivot | accept
  │   ├─ Degradation Guard: score < lastScore? → break (保留最佳版本)
  │   ├─ 更新 bestOutput / bestScore / stagnationCount
  │   └─ determineStopReason() → excellent | passed | max_iterations | stagnation_pivot
  │       └─ excellent 或 passed → break
  │
  └─ Step 5: Evolution.analyze(evalHistory)    [可选, 重试: maxAttempts=2]
      └─ 返回 LoopModuleResult { iterations, bestOutput, finalScore, passed, excellent, ... }
```

### GradingCriteria（评估标准体系）

#### 5 维固定标准定义

`DEFAULT_WRITING_CRITERIA` 定义了技术内容写作的 5 个评估维度：

| 维度 ID | 名称 | 权重 | 满分 | 说明 |
|---------|------|------|------|------|
| `topic_accuracy` | Topic Accuracy | 25% (0.25) | 20 | 主题准确性 — 是否紧密围绕原始任务主题 |
| `technical_depth` | Technical Depth | 25% (0.25) | 20 | 技术深度 — 是否触及实现原理和 trade-off |
| `code_quality` | Code Quality | 20% (0.20) | 20 | 代码质量 — 语法正确性、命名、注释、类型完整性 |
| `readability` | Readability | 15% (0.15) | 20 | 可读性 — 结构清晰度、Markdown 格式规范性 |
| `originality` | Originality | 15% (0.15) | 20 | 原创性 — 是否有独特见解 vs AI slop |

#### 关键类型

```typescript
/** 完整的评估标准集 */
interface GradingCriteria {
  name: string;              // 如 "Technical Writing Standard"
  version: string;           // 如 "1.0.0"
  dimensions: GradingDimension[];
  passThreshold: number;     // 通过线，默认 THRESHOLDS.EVALUATOR_PASS (75)
  excellenceThreshold: number; // 优秀线，默认 THRESHOLDS.EXCELLENCE_STOP (90)
}

/** 单次评估结果 */
interface GradingResult {
  totalScore: number;        // 总分 0-100
  weightedScore: number;     // 加权总分 0-100
  passed: boolean;
  excellent: boolean;
  dimensionScores: Array<{
    dimensionId: string;
    dimensionName: string;
    rawScore: number;
    maxScore: number;
    weightedScore: number;
    comment: string;
  }>;
  reasoning: string;         // 总体评语
  suggestions: Array<{       // 修改建议
    dimensionId: string;
    severity: "critical" | "major" | "minor";
    description: string;
    suggestion: string;
  }>;
  round: number;
}
```

#### StrategicDecision 与 IterationHandoff

```typescript
/** Generator 的战略决策 */
type StrategicDecision = "refine" | "pivot" | "accept";
// refine: 继续精炼（分数在上升）
// pivot:  转向新方向（分数停滞或下降）
// accept: 已达优秀线，接受当前产出

/** 迭代状态交接（Context Reset 时传递） */
interface IterationHandoff {
  round: number;
  bestScore: number;
  bestOutput?: string;
  lastEvaluation?: GradingResult;
  scoreTrend: number[];              // 分数趋势数组
  currentStrategy: StrategicDecision;
  accumulatedSuggestions: string[];  // 去重后的累计建议
}
```

### LoopHarness（包装层）

#### 与 LoopModule 的关系

`LoopHarness` 是 `LoopModule` 的 thin wrapper，在 Step 级别实现 Writer-Critic 反馈环：

- **唯一路径**：当注册了 `IGeneratorAgent` + `IEvaluatorAgent` 工厂时，委托给 `LoopModule.run()` 执行（v0.2.0 移除了 ExecutionOrchestrator fallback 路径）
- 非 Writer step（如 ui-ux）仍通过 `ExecutionOrchestrator` 顺序执行

#### API 签名

```typescript
class LoopHarness {
  constructor(
    toolRegistry: ToolRegistry,
    llmProvider: LLMProvider,
    config?: Partial<LoopHarnessConfig>
  );

  registerAgent(
    agentType: string,                           // "writer" | "critic" | "ui-ux"
    factory: (ctx: OrchestratorAgentContext) => AgentExecutor | IGeneratorAgent | IEvaluatorAgent
  ): void;

  setCriteria(criteria: GradingCriteria): void;

  /** v0.2.0: 注入动态 Few-shot 样例（从 Memory 历史数据提取） */
  setDynamicExamples(examples: DynamicExample[]): void;

  /** ★ ADR-005: 注入部门配置（Writer Prompt / Critic 维度 / GoalTemplate / OutputPipeline） */
  setDepartmentConfig(config: DepartmentConfig): void;

  /** ★ ADR-005: 注入输出后处理器回调（解决 loop-engine ↔ content-production 循环依赖） */
  setOutputProcessor(
    processor: (rawContent: string, context: {
      rawContent: string;
      metadata?: Record<string, unknown>;
      taskId?: string;
    }) => Promise<ProcessedOutput>
  ): void;

  executeWithLoop(
    plan: ExecutionPlan,                          // plan.taskProfile 用于阈值自适应
    context: LoopContext,
    agentContext?: OrchestratorAgentContext
  ): Promise<HarnessExecutionResult>;
}
```

#### DynamicExample 接口 (v0.2.0)

```typescript
interface DynamicExample {
  description: string;   // 样例描述（如"任务要求写 Rust 异步编程..."）
  score: number;         // 该产出获得的评分
  reason: string;        // 评分理由
}
```

通过 `setDynamicExamples()` 注入后，样例会被追加到 `GradingCriteria.dimensions[].examples[]` 中每个维度的末尾。

#### TaskProfile 阈值自适应 (v0.2.0)

`executeWithLoop()` 读取 `plan.taskProfile`，通过 `getThresholdsForProfile()` 选取对应阈值档位，覆盖 `GradingCriteria.passThreshold` 和 `.excellenceThreshold`：

| Profile | Pass | Excellence |
|---------|------|------------|
| `technical-blog` (默认) | 75 | **90** |
| `tutorial` | 70 | **85** |
| `design-doc` | **80** | 88 |
| `code-review` | **82** | **92** |
| `generic` | 70 | **82** |

#### 默认配置 (`LoopHarnessConfig`)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxRewrites` | `number` | `3` | 单步最大重写次数 |
| `qualityThreshold` | `number` | `85` | Critic score >= 此值才通过 |
| `maxReplans` | `number` | `2` | 全局最大 replan 次数 |
| `enableDegradationGuard` | `boolean` | `true` | 退化保护开关 |
| `departmentConfig` | `DepartmentConfig?` | `undefined` | ★ ADR-005: 部门配置（Writer Prompt / Critic 维度等） |
| `outputProcessor` | `function?` | `undefined` | ★ ADR-005: 输出后处理器回调（CLI 层注入，避免循环依赖） |

#### 物理层焊死原则

Critic 的完整输出通过 `injectCriticFeedback()` 直接注入到 `context.extensions.criticFeedback` 中，Writer Agent 在下次 `generateContent` 时读取此字段。反馈格式为完整的文本报告（包含各维度评分、修改建议等），而非摘要。

### 状态机（7 态）

#### LoopState 枚举

```typescript
enum LoopState {
  IDLE = "idle",              // 初始态
  INTERROGATING = "interrogating", // 拷问中
  PLANNING = "planning",      // 规划中
  EXECUTING = "executing",    // 执行中
  VERIFYING = "verifying",    // 验证中
  EVOLVING = "evolving",      // 进化中
  DONE = "done",              // 终态
}
```

#### 状态转换表

| 当前状态 | 可转换到目标状态 | 说明 |
|----------|------------------|------|
| `IDLE` | `INTERROGATING` | 任务启动 |
| `INTERROGATING` | `PLANNING` | 拷问完成 |
| `PLANNING` | `EXECUTING` | 计划就绪 |
| `EXECUTING` | `VERIFYING` | 步骤执行完成 |
| `VERIFYING` | `EVOLVING` | 正常流转（进入进化） |
| `VERIFYING` | `PLANNING` | **Replan 回路**（验证不达标） |
| `EVOLVING` | `DONE` | 全部完成 |
| `DONE` | *(无)* | 终态 |

#### Replan 回路说明

- `VERIFYING → PLANNING` 是唯一的回退转换（Replan）
- 受 `MAX_RETRY_COUNT = 3` 上限保护：`retryCount >= 3` 时抛出错误阻止转换
- 每次 Replan 会递增 `context.retryCount`
- 支持注册 `TransitionGuard` 和 `StateHook`（onEnter / onExit）
- 内置 `EventEmitter`，每次状态变更 emit `"stateChange"` 事件

### 其他引擎组件

#### InterrogateEngine（拷问引擎）

```typescript
class InterrogateEngine {
  constructor(llmProvider: LLMProvider, options?: {
    maxQuestionsPerRound?: number;  // 默认 3
    maxRounds?: number;             // 默认 3
  });

  startSession(taskId: string, userInput: string): Promise<InterrogationSession>;
  getCurrentQuestion(session: InterrogationSession): InterrogationQuestion | null;
  submitAnswer(session: InterrogationSession, answer: string): Promise<InterrogationSession>;
  skipQuestion(session: InterrogationSession): InterrogationSession;
  goBack(session: InterrogationSession): InterrogationSession;
  isRoundComplete(session: InterrogationSession): boolean;
  shouldContinue(session: InterrogationSession): Promise<boolean>;   // LLM 判断是否继续追问
  generateFollowUpQuestions(session: InterrogationSession): Promise<InterrogationSession>;
  finalize(session: InterrogationSession): Record<string, string>;  // 收集到的上下文
  getSummary(session: InterrogationSession): { ... };               // CLI 展示用摘要
}
```

多轮追问机制：每轮生成 1-3 个问题，收集回答后调用 LLM 判断信息是否充足（`shouldContinue`），不足则追加下一轮问题。

#### PlanEngine（规划引擎）

```typescript
class PlanEngine {
  constructor(llmProvider: LLMProvider);
  generatePlan(input: PlanGenerationInput): Promise<PlanGenerationResult>;
}
```

- 使用 `LLMStructuredOutput`（THROW 模式）解析 LLM 返回的 JSON 计划
- 后处理：`deduplicateConsecutiveSteps()` 合并连续相同 agentType 的步骤
- System Prompt 强约束：步骤数 4-6 步，Writer 步需差异化描述，Critic 步应紧跟首 Writer

#### VerifyEngine（验证引擎）

```typescript
class VerifyEngine {
  constructor(llmProvider: LLMProvider, config?: Partial<VerifyConfig>);
  verify(input: VerifyInput): Promise<VerifyResult>;
}
```

两阶段验证：
1. **文件存在性检查**：`existsSync` + `stat.size > 0`
2. **内容质量验证**：LLM 审核（使用 `LLMStructuredOutput` RETURN_FALLBACK 模式，默认分 50）

默认阈值：`threshold = THRESHOLDS.VERIFY_BASELINE (60)`

#### ConsensusLock（共识锁）

```typescript
class ConsensusLock {
  constructor(config?: Partial<ConsensusConfig>);
  setWriterReviewer(reviewer: IEvaluatorAgent): void;
  setCriteria(criteria: GradingCriteria): void;
  setUIUXReviewer(reviewer: AgentExecutor): void;
  setLLMProvider(provider: LLMProvider): void;
  reachConsensus(params: { writerOutput, originalTask, plan, context }): Promise<ConsensusResult>;
}
```

**投票参与者**（默认配置）：
- **Critic**（`IEvaluatorAgent.evaluate()`）：使用 `GradingResult` 转为投票
- **Writer Self-Review**（LLM 直接审核）：自评视角
- **UI-UX Reviewer**（可选，`enableUIUXVoting=true`）：设计角度审核

**判定模式**：
- `requireUnanimous=true`：全票 approve 才通过
- `requireUnanimous=false`（默认）：阈值模式 — 平均分 >= `threshold (70)` 或 approve 占比 >= threshold

默认配置：`threshold=70`, `maxRounds=3`, `requireUnanimous=false`, `enableUIUXVoting=false`

#### ArtifactManager（产物管理器 + HTML 渲染）

```typescript
class ArtifactManager {
  constructor(config?: Partial<ArtifactManagerConfig>);
  createArtifact(params: { name, content, type }): Promise<Artifact>;
  readArtifact(name: string): Promise<Artifact | null>;
  listArtifacts(): Promise<Artifact[]>;
  getPath(name: string): string;
  createHTMLArtifact(params: {
    name: string;
    markdownContent: string;
    title?: string;
    metadata?: Record<string, string>;
    styleConfig?: Partial<HTMLStyleConfig>;  // 🔄 从 UIUX 进化链注入
  }): Promise<Artifact>;
}
```

**HTML 渲染能力**：
- 结构模板固定（flexbox/grid 布局规则不变）
- 视觉 CSS 变量从 `HTMLStyleConfig` 动态注入（颜色/字体/间距可进化）
- 默认暗色主题 fallback（GitHub Dark 风格）
- 支持 `uiuxToHTMLStyle()` 将 UIUXProMaxSkill 输出转为样式配置

产物类型：`"blog" | "tweet" | "design-doc" | "html" | "generic"`

#### ToolRegistry（工具注册中心）

```typescript
class ToolRegistry {
  register(definition: ToolDefinition, handler: ToolHandler): void;
  registerLocalTools(llmProvider?: LLMProvider): void;
  connectMCP(mcpAdapter: MCPClientAdapter): void;
  connectSkills(skillsAdapter: SkillToolsAdapter): void;
  find(toolName: string): ToolDefinition | undefined;
  listAll(): ToolDefinition[];
  listByCategory(category: ToolCategory): ToolDefinition[];
  execute(request: ToolExecuteRequest): Promise<ToolExecuteResult>;
  validateParams(toolName: string, params: Record<string, unknown>): { valid: boolean; errors?: string[] };
  has(toolName: string): boolean;
}
```

**三类工具源**：

| 类别 | 枚举值 | 来源 | 适配器 |
|------|--------|------|--------|
| Local | `ToolCategory.LOCAL` | 内置工具集 | `createLocalToolsHandler()` |
| MCP | `ToolCategory.MCP` | MCP Server | `MCPToolsAdapter` |
| Skill | `ToolCategory.SKILL` | Built-in Skills | `SkillToolsAdapter` |

#### RollbackManager（回滚管理器）

```typescript
class RollbackManager {
  constructor(stateMachine: LoopStateMachine, maxRetries?: number);  // 默认 maxRetries=3
  createRollbackPoint(context, plan?, evidenceChainSnapshotId?): RollbackPoint;
  rollback(pointId: string): Promise<RollbackResult>;
  rollbackToLastStable(): Promise<RollbackResult>;
  canRetry(): boolean;
  getRetryCount(): number;
  incrementRetry(): number;
  getHistory(): RollbackPoint[];
  reset(): void;
}
```

快照包含：`snapshotId`, `timestamp`, `loopState`, `contextSnapshot` (structuredClone), `planSnapshot`, `evidenceChainSnapshotId`

### 工具函数

#### retryWithBackoff（指数退避重试）

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions<T>>
): Promise<T>;
```

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `maxAttempts` | `3` | 最大尝试次数（含首次） |
| `baseDelayMs` | `1000` | 基础延迟 ms，第 N 次重试延迟 = baseDelayMs × 2^(N-1) |
| `maxDelayMs` | `30000` | 最大延迟上限 ms |
| `jitterFactor` | `0.15` | 抖动因子 (0-1)，推荐 0.1-0.3 |
| `retryOnTransientOnly` | `true` | 仅对 TransientError 重试 |

回调钩子：`onRetry(attempt, errorClassification, delayMs)`, `onFinalFailure(lastError)`, `onSuccess(result, attempt)`

#### CircuitBreaker（熔断器）

```typescript
class CircuitBreaker {
  constructor(options?: Partial<CircuitBreakerOptions>);
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): { state: "closed"|"open"|"half-open"; failures: number; openedAtAgo?: number };
  reset(): void;
}
```

三态模型：`closed`(正常) → 连续失败 >= `failureThreshold(5)` → `open`(快速失败) → `recoveryTimeoutMs(30000ms)` 后 → `half-open`(放行测试请求 `halfOpenTestRequests(1)`)

#### ErrorClassifier / TransientError / PermanentError

```typescript
class TransientError extends Error {
  readonly name = "TransientError";
  readonly retryable = true as const;
  constructor(message: string, cause?: Error);
}

class PermanentError extends Error {
  readonly name = "PermanentError";
  readonly retryable = false as const;
  constructor(message: string, cause?: Error);
}

class ErrorClassifier {
  constructor(options?: { extraTransientPatterns?: RegExp[]; extraPermanentPatterns?: RegExp[] });
  classify(error: unknown): ErrorClassification;  // { type: "transient"|"permanent", error, reason }
  isRetryable(error: unknown): boolean;
}

const defaultClassifier = new ErrorClassifier();  // 全局共享实例
```

分类策略（优先级：Permanent > Transient > 未知归 Transient）：
- **Transient**：timeout, rate limit (429), 5xx, network error, DNS failure 等 23 种模式
- **Permanent**：400/401/403/404/422, auth failure, validation error, schema error 等 18 种模式

#### LLMStructuredOutput / createLLMParser

```typescript
enum FallbackStrategy {
  THROW = "throw",                // 解析失败抛异常
  RETURN_FALLBACK = "return-fallback",  // 返回兜底值
  RETURN_NULL = "return-null",    // 返回 null
}

function extractJSON(raw: string): JSONExtractResult | null;
// 四级回退: codeblock → array → object(取最后一个) → raw

class LLMStructuredOutput<T> {
  constructor(options: {
    schema: ZodSchema<T>;         // Zod schema 运行时验证
    fallback: T;                   // 兜底值
    strategy?: FallbackStrategy;   // 默认 RETURN_FALLBACK
    logPrefix?: string;            // 日志前缀
  });
  parse(raw: string): ParseResult<T>;   // extractJSON → JSON.parse → Zod.safeParse
  extract(raw: string): JSONExtractResult | null;  // 仅提取不解析
  getFallback(): T;
  getSchema(): ZodSchema<T>;
}

function createLLMParser<T>(options: {
  schema: ZodSchema<T>;
  fallback: T;
  strategy?: FallbackStrategy;
  logPrefix?: string;
}): LLMStructuredOutput<T>;
```

## 导出索引

### 主入口 (`.`)

```
// 类型
LoopState, StateTransition, StateChangeEvent, TransitionGuard, StateHook
LoopContext, ExecutionPlan, PlanStep, TaskProfile

// 核心类
LoopStateMachine

// Tool Registry
ToolCategory, ToolDefinition, ToolExecuteRequest, ToolExecuteResult, ToolHandler
ToolRegistry, MCPToolsAdapter, SkillToolsAdapter
createLocalToolsHandler, getLocalToolDefinitions

// 拷问引擎
InterrogateEngine, InterrogationQuestion, InterrogationSession, LLMProvider

// 规划引擎
PlanEngine, PlanGenerationInput, PlanGenerationResult

// 编排器 (@deprecated)
ExecutionOrchestrator, StepExecutionResult, OrchestratorConfig
AgentExecutor, StandardAgentContext, OrchestratorAgentContext
EvidenceChainRef, MemoryManagerRef

// 共识锁
ConsensusLock, ConsensusVote, ConsensusResult, ConsensusConfig

// 验证引擎
VerifyEngine, VerifyInput, VerifyResult, VerifyConfig

// 回滚管理器
RollbackManager, RollbackPoint, RollbackResult

// 产出管理器
ArtifactManager, Artifact, ArtifactType, ArtifactManagerConfig

// LLM Provider
PiAILLMProvider

// LLM 结构化输出
LLMStructuredOutput, createLLMParser, extractJSON, FallbackStrategy
ParseResult, ParseSuccess, ParseFailure, JSONExtractResult, JSONExtractSource

// 错误处理
TransientError, PermanentError, ErrorClassifier, defaultClassifier
ErrorClassification
retryWithBackoff, CircuitBreaker, RetryOptions, CircuitBreakerOptions

// Loop Harness
LoopHarness, LoopHarnessConfig, DynamicExample
StepLoopIteration, StepLoopResult, HarnessExecutionResult

// Department (ADR-005)
DepartmentConfig, ContentType, AgentProfile, WriterConstraints
OutputPipelineConfig, OutputPostProcessor, QualityGateConfig
GoalTemplate

// CompletionGuard (ADR-004)
AcceptanceGoal, GoalStatus, GoalId, StopCondition
CompletionGuard, CompletionGuardConfig, CompletionCheckResult
VerificationMethod, EvidenceRecord, EvidenceContent, BlockerReason
CommandVerification, TestVerification, LintVerification
BrowserVerification, FileExistenceVerification, ContentMatchVerification, LLMAssertionVerification
VerificationPipeline, VerificationExecutor, VerificationContext

// 阈值配置
THRESHOLDS, THRESHOLD_PROFILES, getThresholdsForProfile
ThresholdKey, ThresholdProfile

// Team Architecture (v0.3.1+)
WorkerRole, IWorker, WorkerConfig
TaskFeatures, ContentDomain, ITeam
TeamCompositionRule, TeamWorkerDef, ITeamManager, TeamContext
AgentFactory, IWorkerRegistry, WorkerRegistration
WORKER_ROLES, LENGTH_THRESHOLDS

TaskAnalyzer, TeamComposer, TeamManager, WorkerRegistry
HistoryReader, DEFAULT_HISTORY_READER_CONFIG
HistoryReaderConfig, HistoryPromptResult

// Loop Module
LoopModule, SimpleEvolutionAgent
DEFAULT_WRITING_CRITERIA, formatCriteriaForEvaluator, formatCriteriaForGenerator
LoopModuleConfig, LoopIteration (as LoopModuleIteration), LoopModuleResult
GradingCriteria, GradingDimension, GradingResult
StrategicDecision, IterationHandoff
IPlannerAgent, IGeneratorAgent, IEvaluatorAgent, IEvolutionAgent
```

### 子路径 `./types`

仅导出类型定义（无运行时代码），适用于仅需类型的场景：

```
LoopState, StateTransition, StateChangeEvent, TransitionGuard, StateHook
LoopContext, ExecutionPlan, PlanStep, TaskProfile
LLMProvider
StandardAgentContext, AgentExecutor
ToolRegistry
IPlannerAgent, IGeneratorAgent, IEvaluatorAgent, IEvolutionAgent
IterationHandoff, GradingCriteria, GradingResult, StrategicDecision

// Department (ADR-005)
DepartmentConfig, ContentType, AgentProfile, WriterConstraints
OutputPipelineConfig, QualityGateConfig

// CompletionGuard (ADR-004)
AcceptanceGoal, GoalStatus, GoalId, StopCondition
VerificationMethod, EvidenceRecord, BlockerReason
```

### 子路径 `./interrogate`

拷问引擎独立子路径：

```
InterrogateEngine
InterrogationQuestion, InterrogationSession, LLMProvider
```

### 子路径 `./tools`

工具注册表独立子路径：

```
ToolCategory, ToolDefinition, ToolExecuteRequest, ToolExecuteResult, ToolHandler
ToolRegistry
MCPToolsAdapter, SkillToolsAdapter
createLocalToolsHandler, getLocalToolDefinitions
```

### 子路径 `./utils`

工具函数独立子路径：

```
LLMStructuredOutput, createLLMParser, extractJSON, FallbackStrategy
ParseResult, ParseSuccess, ParseFailure, JSONExtractResult, JSONExtractSource
```

## 依赖关系

### 外部依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `@aicos/mcp` | `workspace:*` | MCP Client Adapter，连接外部 MCP Server 工具 |
| `@earendil-works/pi-ai` | `^0.79.3` | LLM 调用（pi-ai complete 函数），支持 OpenAI 兼容 API 降级 |
| `zod` | `^4.4.3` | Schema 运行时验证（LLMStructuredOutput、各引擎的 LLM 输出解析） |

### 内部依赖图

```
index.ts (桶文件)
  ├── types.ts                          ← 无内部依赖
  ├── state-machine.ts                  ← types.ts
  ├── loop-module/
  │   ├── engine.ts (LoopModule)        ← grading-criteria.ts, utils/retry.ts
  │   ├── grading-criteria.ts           ← config/thresholds.ts
  │   ├── simple-evolution.ts           ← grading-criteria.ts
  │   └── index.ts                      ← engine.ts, grading-criteria.ts, simple-evolution.ts
  ├── loop-harness/
  │   ├── engine.ts (LoopHarness)       ← loop-module/, orchestrator/, types.ts, interrogate/types.ts
  │   └── index.ts                      ← engine.ts
  ├── interrogate/
  │   ├── engine.ts (InterrogateEngine) ← types.ts, prompts.ts, utils/llm-structured-output.ts
  │   ├── prompts.ts                    ← 无内部依赖
  │   └── types.ts                      ← 无内部依赖
  ├── plan/
  │   ├── engine.ts (PlanEngine)        ← types.ts, interrogate/types.ts, utils/llm-structured-output.ts
  │   └── types.ts                      ← types.ts
  ├── orchestrator/
  │   ├── engine.ts (ExecutionOrchestrator) ← tool-registry/, types.ts
  │   └── types.ts                      ← types.ts
  ├── consensus/
  │   ├── engine.ts (ConsensusLock)     ← types.ts, loop-module/, orchestrator/types.ts, utils/llm-structured-output.ts, config/thresholds.ts
  │   └── types.ts                      ← 无内部依赖
  ├── verify/
  │   ├── engine.ts (VerifyEngine)      ← types.ts, interrogate/types.ts, utils/llm-structured-output.ts, config/thresholds.ts
  │   └── types.ts                      ← types.ts
  ├── output/
  │   ├── manager.ts (ArtifactManager)  ← types.ts
  │   └── types.ts                      ← 无内部依赖
  ├── tool-registry/
  │   ├── registry.ts (ToolRegistry)    ← types.ts, local-tools.ts, mcp-tools-adapter.ts, skill-tools-adapter.ts
  │   ├── types.ts                      ← 无内部依赖
  │   ├── local-tools.ts                ← types.ts, interrogate/types.ts
  │   ├── mcp-tools-adapter.ts          ← types.ts, @aicos/mcp
  │   └── skill-tools-adapter.ts        ← types.ts
  ├── rollback/
  │   ├── engine.ts (RollbackManager)   ← state-machine.ts, types.ts
  │   └── types.ts                      ← types.ts
  ├── llm/
  │   └── pi-ai-provider.ts (PiAILLMProvider) ← interrogate/types.ts, @earendil-works/pi-ai
  ├── utils/
  │   ├── retry.ts (retryWithBackoff, CircuitBreaker) ← error-classifier.ts
  │   ├── error-classifier.ts           ← 无内部依赖
  │   └── llm-structured-output.ts      ← zod
  └── config/
      └── thresholds.ts (THRESHOLDS)    ← 无内部依赖
```

## 开发注意事项

### 物理层焊死原则

Critic 的完整输出通过 `LoopModule.run()` 内部的 Generator→Evaluator 循环传递：

- v0.2.0 前：Critic 输出通过 `injectCriticFeedback()` 手动注入 `context.extensions.criticFeedback`
- v0.2.0 起：Critic 输出通过 `IterationHandoff.accumulatedSuggestions` + `feedback` 参数自动传递给 Generator
- 反馈包含完整的维度级评分 + 修改建议（非摘要）

**不可违反**：禁止只传总分或摘要，必须传递完整的维度级反馈。

### Context Reset 设计

`LoopModule.run()` 中每次迭代间不累积 Generator 上下文，而是通过 `IterationHandoff` 传递精炼后的状态：

- `buildHandoff()` 构建 handoff 对象，包含 `scoreTrend`（纯数字数组）、`currentStrategy`、`accumulatedSuggestions`（去重后）
- 不传递完整 `bestOutput` 以节省 token
- `useContextReset=true`（默认开启）控制此行为
- Generator 通过 `generate(plan, feedback, handoff)` 接收状态

### ConsensusLock 多票制

默认启用双票机制（Critic 他评 + Writer 自评），可选第三票（UI-UX）：

- Critic 使用 `IEvaluatorAgent.evaluate()` 接口，将 `GradingResult.totalScore` 映射为投票分数
- Writer Self-Review 使用 LLM 直接审核（需要 `setLLMProvider()`）
- UI-UX 使用 `AgentExecutor.execute()` 接口（向后兼容）
- 所有投票解析失败时 fallback 为 `ABSTAIN`
- Zod schema 验证失败时有正则兜底解析（`fallbackParseVote()`）

### 扩展新 Agent 的方式

实现四大 Seam 接口即可接入 `LoopModule`：

```typescript
// 1. 实现 IPlannerAgent — 任务拆解
const myPlanner: IPlannerAgent<string, MyPlan> = {
  async plan(input) { /* ... */ }
};

// 2. 实现 IGeneratorAgent — 产出生成
const myGenerator: IGeneratorAgent<MyPlan, MyOutput> = {
  async generate(plan, feedback, handoff) { /* ... */ }
};

// 3. 实现 IEvaluatorAgent — 质量评估
const myEvaluator: IEvaluatorAgent<MyOutput> = {
  async evaluate(output, criteria, originalTask) { /* ... */ }
};

// 4. (可选) 实现 IEvolutionAgent — 自进化分析
const myEvolution: IEvolutionAgent = {
  async analyze(history) { /* ... */ }
};

// 接入 LoopModule
const loop = new LoopModule({
  planner: myPlanner,
  generator: myGenerator,
  evaluator: myEvaluator,
  evolution: myEvolution,
  criteria: myCustomCriteria,  // 可选，默认 DEFAULT_WRITING_CRITERIA
});

const result = await loop.run("我的任务");
```

### 统一阈值配置

所有质量阈值集中在 `THRESHOLDS` 常量中，层级关系（从松到严）：

#### 全局默认阈值 (THRESHOLDS)

| 阈值常量 | 值 | 用途 |
|----------|-----|------|
| `VERIFY_BASELINE` | **60** | VerifyEngine 全局质量门控最低线 |
| `CONSENSUS_PASS` | **70** | ConsensusLock 共识投票通过线 |
| `EVALUATOR_PASS` | **75** | GradingCriteria 单次审核通过线（默认/technical-blog 档位） |
| `EXCELLENCE_STOP` | **90** | GradingCriteria 优秀停止迭代线（默认/technical-blog 档位） |

#### TaskProfile 预设档位 (v0.2.0, THRESHOLD_PROFILES)

不同任务类型使用不同的 pass/excellence 阈值，通过 `getThresholdsForProfile(profile?)` 获取：

| Profile | Pass | Excellence | 适用场景 |
|---------|------|------------|----------|
| `technical-blog` | 75 | **90** | 默认高标（技术博客、分析文章） |
| `tutorial` | 70 | **85** | 教程类任务（清晰实用优先于深度原创） |
| `design-doc` | **80** | 88 | 设计文档（严谨完整优先） |
| `code-review` | **82** | **92** | 代码审查（最高标准，零容忍模糊表述） |
| `generic` | 70 | **82** | 最保守档位（不确定类型时使用） |

类型导出：`TaskProfile`, `ThresholdProfile`, `getThresholdsForProfile()`

## 相关文档

- [UBIQUITOUS_LANGUAGE.md](../UBIQUISTOUS_LANGUAGE.md) — 项目统一术语表
