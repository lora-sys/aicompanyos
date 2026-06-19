# ADR-004: 目标驱动自验证停止条件体系 (Goal-Driven Self-Validation Stop Conditions)

> 状态：**草案 (Draft)** | 提出日期：2026-06-18 | 影响范围：loop-engine, evidence-chain

---

## 1. 问题陈述 (Problem Statement)

### 1.1 现状

当前 Loop Engine 的 Inner Loop 停止条件本质上是 **「分数门控 + 硬性迭代上限」**：

```
┌─ 当前停止条件 (engine.ts:445-458) ───────────────┐
│  excellent?  → score >= 90 (EXCELLENCE_STOP)       │ ← 分数够高就停
│  passed?     → score >= 75 (EVALUATOR_PASS)         │ ← 及格就停
│  maxIter?    → round >= 4 (maxRewrites + 1)         │ ← 次数用完就停
│  degrade?    → score < lastScore                    │ ← 退化了就停
│  stagnant?   → stagnationCount >= threshold          │ ← 停滞了就停
│  error?      → Generator 失败                        │ ← 出错就停
└────────────────────────────────────────────────────┘
```

**核心缺陷**：

| 缺陷 | 说明 |
|------|------|
| **无目标感知** | Agent 不知道"任务完成了没有"，只知道" critic 打了多少分" |
| **迭代上限是安全网，不是智能停止** | `maxIterations=4` 是为了防止无限循环，不是"做完了"的判断 |
| **验证依赖 LLM 主观判断** | Critic 的评分是 LLM 的主观意见，缺乏确定性证据（测试通过？类型检查？文件存在？） |
| **无法区分"及格但未完成"和"真正完成"** | score=76 通过了 passThreshold，但可能核心功能还没实现 |

### 1.2 目标

让 AI Agent 从 **「输出一段答案」** 走向 **「完成一个任务」**：

```
目标没完成     → 继续迭代（不是因为次数到了，是因为 goal 未达成）
证据不足       → 执行自动验证（lint/test/typecheck/截图）
真正阻塞       → 停下并报告阻塞原因（需要人类输入、依赖缺失等）
完整完成       → 交付产物（有完整证据链支撑）
```

---

## 2. 核心概念区分

### 2.1 GradingCriteria vs AcceptanceCriteria

这是两套正交的评价体系，解决不同的问题：

| 维度 | GradingCriteria (现有) | AcceptanceCriteria (新增) |
|------|----------------------|--------------------------|
| **问题** | "这个产出质量如何？" | "这个任务完成了没有？" |
| **性质** | 质量打分 (0-100) | 完成度 checklist (done/undone) |
| **值域** | 连续分数 | 三元状态 (verified/failed/blocked) |
| **评估者** | LLM (CriticAgent) | 确定性工具 + LLM 兜底 |
| **用途** | 驱动 Inner Loop 迭代改进质量 | 决定何时停止并交付 |
| **类比** | 考试得分 | 交付清单 (Deliverable Checklist) |

**关键洞察**：一个产出可以 **score=95 (优秀)** 但仍然 **goals 未全部完成**（比如漏实现了一个函数）。反之也可以 **score=72 (不及格)** 但 **所有 acceptance goals 已 verified**（功能正确但代码风格不好——后者可以通过后续 refine 解决）。

### 2.2 停止条件范式转换

```
┌─ 当前范式 ──────────────────────────────┐
│  FOR round IN 1..maxIterations:          │
│    output = generate()                    │
│    score = evaluate(output)               │
│    IF score >= threshold: BREAK           │
│  // 结束：要么达标，要么次数用完            │
└──────────────────────────────────────────┘

           ↓ 转换为

┌─ 目标范式 (新增) ─────────────────────────┐
│  goals = defineAcceptanceCriteria(task)    │
│  WHILE NOT allDone(goals):                 │
│    output = generate()                     │
│    score = evaluate(output)                // 质量反馈仍保留      │
│    status = verifyGoals(goals, output)     // ★ 新增              │
│    IF anyBlocked(status): BREAK & REPORT   │ ★ 新增              │
│    IF allVerified(status): BREAK & DELIVER │ ★ 新增              │
│  // 结束：目标全达成 / 遇到阻塞 / 达到最大努力上限 │
└──────────────────────────────────────────┘
```

---

## 3. 类型系统设计

### 3.1 AcceptanceCriteria — 任务完成度标准

```typescript
// ============================================================
// 文件位置：packages/loop-engine/src/completion-guard/types.ts
// ============================================================

/** 单个验收目标的身份标识 */
export interface GoalId {
  /** 目标唯一 ID（如 "func_auth_login", "type_zero_errors", "ui_nav Renders"） */
  id: string;
  /** 所属 Step ID（关联到 ExecutionPlan 的某个 PlanStep） */
  stepId: string;
}

/**
 * 验证方法 — 按确定性从高到低排列
 *
 * 设计原则：自动验证优先，LLM 判断为最后手段
 */
export type VerificationMethod =
  | CommandVerification
  | TestVerification
  | LintVerification
  | BrowserVerification
  | FileExistenceVerification
  | ContentMatchVerification
  | LLMAssertionVerification;

/** Shell 命令验证（确定性最高） */
export interface CommandVerification {
  type: "command";
  /** 要执行的命令 */
  command: string;
  /** 工作目录（默认项目根目录） */
  cwd?: string;
  /** 超时时间 ms（默认 30000） */
  timeoutMs?: number;
  /** 成功判定：exitCode == 0 即通过 */
  expectExitCode?: number;
}

/** 测试运行器验证 */
export interface TestVerification {
  type: "test";
  /** 测试模式匹配（如 "**/*.test.ts", "src/auth/**/*.test.ts"） */
  pattern: string;
  /** 测试运行器命令（默认 "npx vitest run"） */
  runner?: string;
  /** 超时时间 ms（默认 60000） */
  timeoutMs?: number;
}

/** Lint 检查验证 */
export interface LintVerification {
  type: "lint";
  /** Lint 工具（如 "eslint", "prettier --check", "biome check"） */
  tool: string;
  /** 检查范围（如 "src/", "packages/cli/src/"） */
  target?: string;
  /** 是否将 warning 视为失败（默认 false） */
  failOnWarning?: boolean;
}

/** 浏览器 UI 验证 */
export interface BrowserVerification {
  type: "browser_check";
  /** 页面 URL 或本地服务地址 */
  url: string;
  /** CSS 选择器断言（元素必须存在） */
  selectorExists?: string[];
  /** 截图对比（可选基准图路径） */
  screenshotBaseline?: string;
  /** 自定义 JS 断言（在页面上下文中执行） */
  customAssertion?: string;
}

/** 文件存在性验证 */
export interface FileExistenceVerification {
  type: "file_exists";
  /** 文件路径 glob 模式（支持 * 和 **） */
  path: string;
  /** 文件最小字节大小（可选，用于排除空文件） */
  minSizeBytes?: number;
}

/** 内容匹配验证（grep/regex） */
export interface ContentMatchVerification {
  type: "content_match";
  /** 目标文件或目录 */
  target: string;
  /** 必须匹配的正则表达式 */
  pattern: RegExp | string;
  /** 不应出现的正则表达式（反模式检测） */
  antiPattern?: RegExp | string;
}

/** LLM 断言验证（最后手段） */
export interface LLMAssertionVerification {
  type: "llm_assertion";
  /** 让 LLM 判断的声明（如 "所有导出的函数都有 JSDoc 注释"） */
  claim: string;
  /** 需要检查的文件范围 */
  targetFiles?: string;
  /** 用于判断的上下文提示 */
  contextPrompt?: string;
}
```

### 3.2 GoalStatus — 目标状态机

```typescript
/**
 * 单个验收目标的状态
 *
 * 状态转换：
 *   pending → verifying → verified ✅
 *                       → failed    → verifying (retry)
 *                       → blocked   🛑 (终态)
 *
 *   pending → skipped ⏭️  (手动跳过)
 */
export type GoalStatus =
  | { state: "pending"; goal: AcceptanceGoal }
  | { state: "verifying"; goal: AcceptanceGoal; startedAt: Date }
  | { state: "verified"; goal: AcceptanceGoal; evidence: EvidenceRecord }
  | { state: "failed"; goal: AcceptanceGoal; evidence: EvidenceRecord; retryCount: number }
  | { state: "blocked"; goal: AcceptanceGoal; blocker: BlockerReason }
  | { state: "skipped"; goal: AcceptanceGoal; reason: string };

/**
 * 单个验收目标
 */
export interface AcceptanceGoal {
  id: string;
  stepId: string;
  /** 人类可读的目标描述（如 "TypeScript 编译零错误"） */
  description: string;
  /** 验证方法（支持多种，任一通过即视为该 goal 通过） */
  verifyBy: VerificationMethod[];
  /** 优先级（影响验证顺序和阻塞判断权重） */
  priority: "critical" | "major" | "minor";
  /** 该 goal 是否为"必须通过"（critical 且 required=true 时，blocked 会终止整个 loop） */
  required: boolean;
}
```

### 3.3 EvidenceRecord — 验证证据

```typescript
/**
 * 验证证据记录
 *
 * 每次验证执行产生的确定性证据，
 * 用于证明"这个 goal 确实通过了/失败了"。
 */
export interface EvidenceRecord {
  /** 关联的 Goal ID */
  goalId: string;
  /** 使用的验证方法 */
  method: VerificationMethod["type"];
  /** 验证执行时间 */
  timestamp: string; // ISO 8601
  /** 是否通过 */
  passed: boolean;
  /** 确定性证据内容 */
  evidence: EvidenceContent;
  /** 耗时 ms */
  durationMs: number;
}

/**
 * 证据内容（联合类型，根据验证方法不同而不同）
 */
export type EvidenceContent =
  | CommandEvidence
  | TestEvidence
  | LintEvidence
  | BrowserEvidence
  | FileEvidence
  | ContentMatchEvidence
  | LLMEvidence;

export interface CommandEvidence {
  type: "command";
  /** 执行的完整命令 */
  command: string;
  /** exit code */
  exitCode: number;
  /** stdout（截断至 10KB） */
  stdout: string;
  /** stderr（截断至 10KB） */
  stderr: string;
}

export interface TestEvidence {
  type: "test";
  /** 测试运行器命令 */
  runner: string;
  /** 总测试数 */
  totalTests: number;
  /** 通过数 */
  passedTests: number;
  /** 失败数 */
  failedTests: number;
  /** 失败的测试名列表 */
  failedTestNames: string[];
  /** 覆盖率（如果可用） */
  coverage?: { lines: number; functions: number; branches: number };
}

export interface LintEvidence {
  type: "lint";
  /** Lint 工具名 */
  tool: string;
  /** 错误数 */
  errors: number;
  /** 警告数 */
  warnings: number;
  /** 问题列表（前 20 条） */
  issues: Array<{ file: string; line: number; rule: string; message: string }>;
}

export interface BrowserEvidence {
  type: "browser_check";
  /** 页面 URL */
  url: string;
  /** 截图 base64 或路径 */
  screenshot?: string;
  /** DOM 断言结果 */
  assertions: Array<{ selector: string; exists: boolean }>;
  /** 页面 console 错误（如果有） */
  consoleErrors?: string[];
}

export interface FileEvidence {
  type: "file_exists";
  /** 匹配到的文件路径列表 */
  matchedPaths: string[];
  /** 文件大小 bytes */
  fileSize?: number;
}

export interface ContentMatchEvidence {
  type: "content_match";
  /** 匹配到的行 */
  matchedLines: Array<{ file: string; line: number; content: string }>;
  /** 是否匹配到反模式 */
  antiPatternMatched?: boolean;
}

export interface LLMEvidence {
  type: "llm_assertion";
  /** 使用的模型 */
  model: string;
  /** LLM 的判断结果 */
  judgement: "pass" | "fail";
  /** LLM 给出的理由 */
  reasoning: string;
  /** 置信度 */
  confidence: number;
}
```

### 3.4 StopCondition — 停止条件（替代现有 stopReason）

```typescript
/**
 * 完成守护者的停止条件判决
 *
 * 替代现有的简单 stopReason ("excellent"|"passed"|"max_iterations"|...)
 * 为结构化的、可追溯的停止决策。
 */
export type StopCondition =
  | AllGoalsVerifiedStop
  | AnyGoalBlockedStop
  | MaxEffortExceededStop
  | ErrorStop;

/** 所有目标已验证通过 → 交付 */
export interface AllGoalsVerifiedStop {
  reason: "all_goals_verified";
  /** 所有已验证的目标及其证据 */
  verifiedGoals: Array<{ goalId: string; evidence: EvidenceRecord }>;
  /** 总轮次 */
  totalRounds: number;
  /** 总耗时 */
  totalDurationMs: number;
}

/** 存在阻塞目标 → 停止并报告 */
export interface AnyGoalBlockedStop {
  reason: "any_goal_blocked";
  /** 已验证通过的目标 */
  verifiedGoals: Array<{ goalId: string; evidence: EvidenceRecord }>;
  /** 被阻塞的目标 */
  blockedGoals: Array<{ goalId: string; blocker: BlockerReason }>;
  /** 仍待验证的目标 */
  pendingGoals: string[];
}

/** 达到最大努力上限 → 停止并汇报剩余目标 */
export interface MaxEffortExceededStop {
  reason: "max_effort_exceeded";
  /** 已验证通过的目标 */
  verifiedGoals: Array<{ goalId: string; evidence: EvidenceRecord }>;
  /** 仍未通过的目标 */
  remainingGoals: Array<{
    goalId: string;
    lastStatus: "failed" | "pending";
    failureSummary?: string;
  }>;
  /** 已花费的总努力（加权迭代次数 × 复杂度） */
  effortSpent: number;
  /** 最大允许努力值 */
  maxEffort: number;
}

/** 执行错误 → 停止 */
export interface ErrorStop {
  reason: "error";
  error: Error;
  /** 错误发生时的目标状态快照 */
  goalSnapshot: Array<{ goalId: string; status: GoalStatus["state"] }>;
}

/**
 * 阻塞原因
 */
export interface BlockerReason {
  /** 阻塞类别 */
  category:
    | "missing_dependency"   // 缺少依赖（如需要安装某个包）
    | "human_input_required" // 需要人类决策（如架构选型）
    | "external_service"     // 外部服务不可达（如 API down）
    | "circular_dependency"  // 目标间循环依赖
    | "environment"          // 环境问题（如权限、磁盘空间）
    | "unknown";             // 未知的阻塞原因
  /** 人类可读的描述 */
  description: string;
  /** 建议的解决方案（可由 Agent 尝试自动解决） */
  suggestedAction?: string;
}
```

### 3.5 CompletionGuardConfig — 配置

```typescript
/**
 * CompletionGuard 配置
 */
export interface CompletionGuardConfig {
  /**
   * 最大努力上限（替代简单的 maxIterations）
   *
   * "努力" = Σ(每轮迭代权重)，权重由 goal 的 priority 决定：
   * - critical goal 未通过: weight=3
   * - major goal 未通过:   weight=2
   * - minor goal 未通过:   weight=1
   *
   * 默认值 20 意味着：
   * - 如果只剩 1 个 critical goal 未通过，最多再迭代 ~6 轮
   * - 如果有 3 个 major + 2 个 minor 未通过，最多再迭代 ~3 轮
   */
  maxEffort: number;

  /**
   * 单个 goal 最大重试次数
   * 超过后标记为 failed（不标记为 blocked）
   */
  maxRetriesPerGoal: number;

  /**
   * 验证并行度
   * 同一轮内并行执行的验证任务数（默认 3）
   */
  verificationConcurrency: number;

  /**
   * 是否启用快速路径：
   * 如果上一轮某 goal 已 verified，本轮跳过重新验证（除非产出发生了变化）
   */
  cacheVerifiedGoals: boolean;

  /**
   * 验证超时时间（单个验证任务）
   */
  verificationTimeoutMs: number;
}

const DEFAULT_COMPLETION_GUARD_CONFIG: CompletionGuardConfig = {
  maxEffort: 20,
  maxRetriesPerGoal: 3,
  verificationConcurrency: 3,
  cacheVerifiedGoals: true,
  verificationTimeoutMs: 30000,
};
```

---

## 4. 架构设计

### 4.1 整体架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│                         LoopHarness (Outer)                          │
│                                                                      │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐  │
│  │  PlanEngine  │───▶│  LoopModule      │───▶│  VerifyEngine       │  │
│  │  (生成计划)   │    │  (Inner Loop)    │    │  (Outer Loop 验证)   │  │
│  └──────┬──────┘    └───────┬──────────┘    └──────────┬──────────┘  │
│         │                   │                           │             │
│         ▼                   ▼                           ▼             │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐  │
│  │ Acceptance   │    │  CompletionGuard │    │  CompletionGuard     │  │
│  │ Criteria     │    │  (Inner Loop     │    │  (Outer Loop         │
│  │ Generator    │    │   每轮验证)       │    │   全量验证)          │  │
│  │ (新! Planner │    └─────────┬────────┘    └──────────┬──────────┘  │
│  │  阶段产出)    │              │                         │           │
│  └─────────────┘              ▼                         ▼           │
│                      ┌──────────────────┐    ┌─────────────────────┐  │
│                      │ Verification     │    │ EvidenceChain       │  │
│                      │ Pipeline         │    │ (扩展: 新增          │  │
│                      │ (自动验证执行器)   │    │  VerificationEntry) │  │
│                      └────────┬─────────┘    └─────────────────────┘  │
│                               │                                      │
│                    ┌──────────┼──────────┐                           │
│                    ▼          ▼          ▼                           │
│              ┌──────────┐ ┌────────┐ ┌──────────┐                     │
│              │Command   │ │Test    │ │Browser   │  ... (确定性验证)    │
│              │Executor  │ │Runner  │ │Checker   │                     │
│              └──────────┘ └────────┘ └──────────┘                     │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 CompletionGuard 核心 API

```typescript
/**
 * CompletionGuard — 目标驱动的完成度守护者
 *
 * 核心职责：
 * 1. 管理 AcceptanceGoal[] 的生命周期
 * 2. 每轮迭代后执行验证流水线
 * 3. 根据目标状态产生 StopCondition
 * 4. 将验证证据记录到 EvidenceChain
 */
export class CompletionGuard {
  private goals: Map<string, GoalStatus>;
  private config: CompletionGuardConfig;
  private evidenceChain?: EvidenceChain; // 可选注入
  private effortSpent: number = 0;
  private roundCount: number = 0;

  constructor(
    goals: AcceptanceGoal[],
    config?: Partial<CompletionGuardConfig>,
    evidenceChain?: EvidenceChain
  ) {
    this.config = { ...DEFAULT_COMPLETION_GUARD_CONFIG, ...config };
    this.evidenceChain = evidenceChain;
    // 初始化所有目标为 pending
    this.goals = new Map(
      goals.map((g) => [g.id, { state: "pending", goal: g }])
    );
  }

  // ============================================================
  // 核心方法
  // ============================================================

  /**
   * 执行一轮验证检查
   *
   * @param currentOutput 当前 Generator 的产出（用于文件类验证）
   * @returns 验证结果 + 停止条件建议
   */
  async check(currentOutput?: unknown): Promise<CompletionCheckResult>;

  /**
   * 仅验证指定的目标（增量验证）
   *
   * 当已知某些目标受本次产出变化影响时使用
   */
  async checkGoals(goalIds: string[], currentOutput?: unknown): Promise<CompletionCheckResult>;

  /**
   * 获取当前所有目标状态（只读快照）
   */
  getGoalSnapshot(): ReadonlyMap<string, GoalStatus>;

  /**
   * 获取完成进度摘要
   */
  getProgress(): {
    total: number;
    verified: number;
    failed: number;
    pending: number;
    blocked: number;
    progressPercent: number; // verified / total * 100
    effortRemaining: number;  // 估算剩余努力值
  };

  /**
   * 重置指定目标的状态（用于 replan 后重新验证）
   */
  resetGoals(goalIds: string[]): void;

  // ============================================================
  // 内部：验证调度
  // ============================================================

  /**
   * 执行单个目标的验证
   * 按 verifyBy 数组顺序尝试，任一通过即视为通过
   */
  private async verifyGoal(goal: AcceptanceGoal): Promise<GoalStatus>;

  /**
   * 根据验证方法分发到对应的执行器
   */
  private async executeVerification(
    method: VerificationMethod,
    goal: AcceptanceGoal
  ): Promise<EvidenceRecord>;

  /**
   * 计算当前停止条件
   */
  private determineStopCondition(): StopCondition;

  /**
   * 记录验证证据到 EvidenceChain
   */
  private recordEvidence(evidence: EvidenceRecord): void;
}

/** CompletionGuard.check() 的返回值 */
export interface CompletionCheckResult {
  /** 本轮验证过的目标 */
  checkedGoals: Array<{ goalId: string; previousStatus: GoalStatus["state"]; newStatus: GoalStatus["state"] }>;
  /** 停止条件建议 */
  stopCondition: StopCondition | null; // null = 继续迭代
  /** 本轮产生的所有证据 */
  evidences: EvidenceRecord[];
  /** 进度摘要 */
  progress: ReturnType<CompletionGuard["getProgress"]>;
}
```

### 4.3 VerificationPipeline — 自动验证流水线

```typescript
/**
 * VerificationPipeline — 确定性验证执行器集合
 *
 * 设计原则：
 * 1. 每种验证方法是独立的 Executor
 * 2. 统一的 EvidenceRecord 输出接口
 * 3. 支持超时取消
 * 4. 并发控制（信号量模式）
 */
export class VerificationPipeline {
  private executors: Map<VerificationMethod["type"], VerificationExecutor>;

  constructor(config?: { timeoutMs?: number }) {}

  /**
   * 注册自定义验证执行器
   */
  registerExecutor(type: VerificationMethod["type"], executor: VerificationExecutor): void;

  /**
   * 执行单个验证方法
   */
  async execute(method: VerificationMethod, context: VerificationContext): Promise<EvidenceRecord>;

  /**
   * 并发执行多个验证方法
   */
  async executeParallel(
    methods: VerificationMethod[],
    concurrency: number,
    context: VerificationContext
  ): Promise<EvidenceRecord[]>;
}

/**
 * 验证执行器接口
 *
 * 所有验证执行器必须实现此接口，
 * 保证统一的输入/输出契约。
 */
export interface VerificationExecutor {
  /** 验证方法类型 */
  readonly methodType: VerificationMethod["type"];

  /**
   * 执行验证
   * @param method 验证方法配置
   * @param context 验证上下文（工作目录、当前产出等）
   * @returns 证据记录
   */
  execute(method: VerificationMethod, context: VerificationContext): Promise<EvidenceRecord>;
}

/**
 * 验证上下文 — 传递给每个执行器的环境信息
 */
export interface VerificationContext {
  /** 项目根目录 */
  projectRoot: string;
  /** 当前 Generator 产出的文件路径（如有） */
  outputFiles?: string[];
  /** 当前运行的 dev server URL（如有） */
  devServerUrl?: string;
  /** 环境变量 */
  env?: Record<string, string>;
}
```

### 4.4 内置验证执行器

```typescript
/**
 * 内置执行器清单（按优先级排序）
 */

/** 1. CommandExecutor — Shell 命令执行 */
export class CommandExecutor implements VerificationExecutor {
  readonly methodType = "command";
  async execute(method: CommandVerification, ctx: VerificationContext): Promise<EvidenceRecord> {
    // 使用 child_process.exec 执行命令
    // 捕获 stdout/stderr/exitCode
    // 超时控制
    // 返回 CommandEvidence
  }
}

/** 2. TestExecutor — 测试运行器 */
export class TestExecutor implements VerificationExecutor {
  readonly methodType = "test";
  async execute(method: TestVerification, ctx: VerificationContext): Promise<EvidenceRecord> {
    // 执行 npx vitest run --reporter=json
    // 解析 JSON 输出提取 pass/fail/count
    // 返回 TestEvidence
  }
}

/** 3. LintExecutor — 代码检查 */
export class LintExecutor implements VerificationExecutor {
  readonly methodType = "lint";
  async execute(method: LintVerification, ctx: VerificationContext): Promise<EvidenceRecord> {
    // 执行 eslint --format=json 或 biome check --json
    // 解析输出提取 errors/warnings/issues
    // 返回 LintEvidence
  }
}

/** 4. BrowserExecutor — 浏览器 UI 检查 */
export class BrowserExecutor implements VerificationExecutor {
  readonly methodType = "browser_check";
  async execute(method: BrowserVerification, ctx: VerificationContext): Promise<EvidenceRecord> {
    // 使用 Puppeteer/Playwright 或 MCP browser tools
    // 导航到 URL → 截图 → DOM 断言
    // 返回 BrowserEvidence
  }
}

/** 5. FileExistenceExecutor — 文件存在性检查 */
export class FileExistenceExecutor implements VerificationExecutor {
  readonly methodType = "file_exists";
  async execute(method: FileExistenceVerification, ctx: VerificationContext): Promise<EvidenceRecord> {
    // 使用 glob 匹配文件
    // 检查文件大小
    // 返回 FileEvidence
  }
}

/** 6. ContentMatchExecutor — 内容匹配 */
export class ContentMatchExecutor implements VerificationExecutor {
  readonly methodType = "content_match";
  async execute(method: ContentMatchVerification, ctx: VerificationContext): Promise<EvidenceRecord> {
    // 读取目标文件 → 正则匹配
    // 返回 ContentMatchEvidence
  }
}

/** 7. LLMAssertionExecutor — LLM 断言（最后手段） */
export class LLMAssertionExecutor implements VerificationExecutor {
  readonly methodType = "llm_assertion";
  private llmProvider: LLMProvider;

  async execute(method: LLMAssertionVerification, ctx: VerificationContext): Promise<EvidenceRecord> {
    // 将目标文件内容 + claim 发送给 LLM
    // 让 LLM 判断 pass/fail + reasoning
    // 返回 LLMEvidence
  }
}
```

---

## 5. 与现有系统的集成点

### 5.1 集成点总览

```
┌───────────────────────────────────────────────────────────────────┐
│                      现有系统 (Existing)                            │
│                                                                    │
│  packages/config     ◀─── 新增 CompletionGuard 相关类型            │
│  packages/loop-engine ◀───★ 核心集成点（主要改动）                  │
│  packages/evidence-chain ◀─ 新增 VerificationTraceEntry           │
│  packages/cli        ◀─── 注册 executors、注入配置                 │
│  packages/subagents  ◀─── Planner 生成 AcceptanceCriteria           │
└───────────────────────────────────────────────────────────────────┘
```

### 5.2 LoopModule 集成（核心改动）

**修改文件**: [engine.ts](packages/loop-engine/src/loop-module/engine.ts)

**改动位置**: `run()` 方法的 Inner Loop 循环体内

```typescript
// === 改动前 (当前逻辑 engine.ts:208-313) ===
for (let round = 1; round <= this.config.maxIterations; round++) {
  const output = await this.generator.generate(plan, feedback, handoff);
  const evaluation = await this.evaluator.evaluate(output, this.criteria, input);
  const strategicDecision = await this.makeStrategicDecision(evaluation, iterations, round);
  // ... degradation guard ...
  const stopReason = this.determineStopReason(evaluation, round, stagnationCount, strategicDecision);
  if (stopReason === "excellent" || stopReason === "passed") break;
}

// === 改动后 (目标驱动) ===
for (let round = 1; ; round++) {  // 注意：不再以 maxIterations 为上界
  const output = await this.generator.generate(plan, feedback, handoff);
  const evaluation = await this.evaluator.evaluate(output, this.criteria, input);
  const strategicDecision = await this.makeStrategicDecision(evaluation, iterations, round);

  // ... degradation guard 保留 ...

  // ★ 新增：CompletionGuard 检查
  const guardResult = await this.completionGuard?.check(output);

  // ★ 新增：基于目标状态的停止判断
  if (guardResult?.stopCondition) {
    // all_goals_verified → 交付（即使分数未达 excellence）
    // any_goal_blocked  → 报告阻塞
    // max_effort_exceeded → 在合理位置停下
    break;
  }

  // 安全阀：maxIterations 仍作为最终兜底（防止死循环）
  if (round >= this.config.maxIterations) {
    break;
  }

  lastScore = evaluation.totalScore;
}
```

**LoopModuleConfig 扩展**:

```typescript
export interface LoopModuleConfig {
  // ... 现有字段 ...
  maxIterations: number;           // 保留作为安全阀
  enableDegradationGuard: boolean;
  enableEvolution: boolean;
  stagnationThreshold: number;
  useContextReset: boolean;

  // ★ 新增
  /** 是否启用 CompletionGuard（目标驱动停止） */
  enableCompletionGuard: boolean;
  /** AcceptanceCriteria（验收标准） */
  acceptanceCriteria?: AcceptanceGoal[];
  /** CompletionGuard 配置 */
  completionGuardConfig?: Partial<CompletionGuardConfig>;
}
```

**LoopModuleResult 扩展**:

```typescript
export interface LoopModuleResult<TOutput = any> {
  // ... 现有字段 ...
  iterations: LoopIteration<TOutput>[];
  bestOutput: TOutput | null;
  finalScore: number;
  passed: boolean;
  excellent: boolean;
  totalRounds: number;
  totalDurationMs: number;
  evolutionSummary?: { ... };

  // ★ 新增
  /** 目标完成度快照 */
  goalSnapshot?: Array<{ goalId: string; status: GoalStatus["state"]; evidence?: EvidenceRecord }>;
  /** 最终停止条件（结构化，替代原来的 stopReason 字符串） */
  stopCondition?: StopCondition;
  /** 完成进度 */
  completionProgress?: {
    totalGoals: number;
    verifiedGoals: number;
    progressPercent: number;
  };
}
```

### 5.3 LoopHarness 集成

**修改文件**: [engine.ts](packages/loop-engine/src/loop-harness/engine.ts)

**改动位置**: `getOrCreateLoopModule()` 中构建 LoopModule 时传入 acceptanceCriteria

```typescript
// LoopHarness.getOrCreateLoopModule() 中新增：
private getOrCreateLoopModule(step: PlanStep): LoopModule<...> {
  // ... 现有逻辑 ...

  // ★ 新增：从 PlanStep 中提取（或由 CLI 层注入）AcceptanceCriteria
  const stepGoals = this.extractGoalsForStep(step);

  this.loopModule = new LoopModule({
    planner: identityPlanner,
    generator,
    evaluator,
    criteria: this.buildProfileAwareCriteria(),
    config: {
      maxIterations: this.config.maxRewrites + 1,
      enableDegradationGuard: this.config.enableDegradationGuard,
      enableEvolution: true,
      stagnationThreshold: 1,
      useContextReset: true,

      // ★ 新增
      enableCompletionGuard: stepGoals.length > 0,
      acceptanceCriteria: stepGoals,
      completionGuardConfig: {
        maxEffort: this.config.maxRewrites * 4, // 与 maxRewrites 联动
        verificationConcurrency: 3,
      },
    },
  });

  return this.loopModule;
}

/** 从 PlanStep 的 metadata 或全局配置中提取验收目标 */
private extractGoalsForStep(step: PlanStep): AcceptanceGoal[] {
  // 优先从 step.metadata.acceptanceGoals 读取
  // 其次从预定义的 goal templates 匹配
  // 返回空数组表示该 step 不启用 CompletionGuard
  return step.metadata?.acceptanceGoals ?? [];
}
```

### 5.4 Outer Loop (VerifyEngine) 升级

VerifyEngine 从当前的"粗筛底线"升级为**逐条 goal 验证**：

```typescript
// === 当前 VerifyEngine（概念） ===
// 1. 检查产物文件是否存在
// 2. LLM 审核: "这个产物是否满足原始任务要求？"
// 3. score >= VERIFY_BASELINE(60)? → PASS → 进入 EVOLVING
//                              → FAIL → Replan (≤3 次)

// === 升级后 VerifyEngine ===
// 1. 运行 CompletionGuard 全量检查（所有步骤的所有 goals）
// 2. 结果：
//    - all_goals_verified → PASS → 进入 EVOLVING
//    - some_failed + can_replan → Replan（带上具体哪些 goal 失败）
//    - any_blocked → STOP（需要人类介入）
// 3. Replan 时将 failed goals 作为 Planner 的输入约束
```

### 5.5 Evidence Chain 扩展

**新增 TraceEntry 类型**: `VerificationTraceEntry`

```typescript
// ============================================================
// 文件位置：packages/evidence-chain/src/types.ts (追加)
// ============================================================

/** 验证追踪记录（新增） */
export interface VerificationTraceEntry {
  type: "verification";  // ★ 新类型
  traceId: string;
  timestamp: string;      // ISO 8601
  taskId: string;

  /** 关联的目标 ID */
  goalId: string;
  /** 使用的验证方法 */
  method: VerificationMethod["type"];
  /** 验证是否通过 */
  passed: boolean;
  /** 验证耗时 ms */
  durationMs: number;
  /** 证据摘要（完整证据存储在单独的证据文件中） */
  evidenceSummary: {
    methodType: string;
    passed: boolean;
    /** 关键输出（截断） */
    keyOutput: string;
  };
  /** 所在的迭代轮次 */
  round: number;
  metadata?: Record<string, unknown>;
}

// 更新 TraceEntry 联合类型
export type TraceEntry =
  | StepTraceEntry
  | DecisionTraceEntry
  | ToolCallTraceEntry
  | SnapshotEntry
  | ReasoningTraceEntry
  | VerificationTraceEntry; // ★ 新增
```

**新增 Recorder**:

```typescript
// ============================================================
// 文件位置：packages/evidence-chain/src/trace-recorders.ts (追加)
// ============================================================

/** 验证记录器（新增） */
export class VerificationTraceRecorder {
  record(params: {
    goalId: string;
    method: VerificationMethod["type"];
    passed: boolean;
    durationMs: number;
    evidenceSummary: VerificationTraceEntry["evidenceSummary"];
    round: number;
    taskId: string;
  }): VerificationTraceEntry;
}
```

**EvidenceChain 集成**:

```typescript
class EvidenceChain {
  // 现有: steps, decisions, toolCalls, snapshots, reasoning
  readonly verifications: VerificationTraceRecorder; // ★ 新增
}
```

### 5.6 Planner (subagents) 增强

Planner Agent 在生成 ExecutionPlan 时，同时输出每个 Step 的 AcceptanceCriteria：

```typescript
// === 当前 PlanStep ===
interface PlanStep {
  stepId: string;
  agentType: string;
  description: string;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

// === 增强 PlanStep ===
interface PlanStep {
  stepId: string;
  agentType: string;
  description: string;
  dependencies?: string[];

  // ★ 新增
  /** 该步骤的验收目标 */
  acceptanceGoals?: AcceptanceGoal[];

  metadata?: Record<string, unknown>;
}
```

Planner 的 Prompt 中增加指令：

```
你在生成执行计划时，除了拆解步骤外，还需要为每个 Writer 步骤定义验收标准(Acceptance Criteria)。

规则：
1. 每个 Writer 步骤至少定义 1 个 critical goal
2. goal 必须是**可验证的**（优先使用自动化验证方式）
3. 使用具体的、确定性的描述（避免"代码质量好"这种模糊表述）

示例：
- ❌ "代码质量好" (不可验证)
- ✅ "TypeScript 编译零错误: verifyBy=[{type:'command', command:'npx tsc --noEmit'}]"
- ✅ "单元测试全部通过: verifyBy=[{type:'test', pattern:'src/**/*.test.ts'}]"
- ✅ "登录页面渲染正常: verifyBy=[{type:'browser_check', url:'http://localhost:3000/login', selectorExists:['#login-form']}]"
```

---

## 6. 停止条件状态机

### 6.1 状态转换图

```
                    ┌──────────────┐
                    │   PENDING     │
                    │  (待验证)     │
                    └──────┬───────┘
                           │ check()
                           ▼
                    ┌──────────────┐
              ┌────▶│  VERIFYING   │◀────┐
              │     │  (验证中)     │     │
              │     └──┬───┬───┬───┘     │
              │        │   │   │         │
              │   passed│   │failed      │retry
              │        ▼   │   ▼         │
              │  ┌──────────┐ ┌──────────┐│
              │  │ VERIFIED │ │ FAILED   ││
              │  │ (通过✅)  │ │ (失败❌)  ││
              │  └──────────┘ └─────┬────┘│
              │                       │     │
              │                retryCount│     │
              │                >= max?  │     │
              │                  │ yes │     │
              │                  ▼     │     │
              │           ┌──────────┐    │
              │           │ BLOCKED  │    │
              │           │ (阻塞🛑)  │    │
              │           └──────────┘    │
              │                            │
              │  manual_skip               │
              └────────────────────────----┘
                    │
                    ▼
              ┌──────────┐
              │ SKIPPED  │
              │ (跳过⏭️)  │
              └──────────┘
```

### 6.2 CompletionGuard.check() 决策流程

```
check(currentOutput)
  │
  ├─ 1. 收集 pending + failed(可重试) 的 goals
  │
  ├─ 2. 按 priority 排序 (critical > major > minor)
  │
  ├─ 3. 并发执行验证 (concurrency = config.verificationConcurrency)
  │     ├─ Goal A (command: tsc --noEmit)  → EvidenceRecord { passed: true  }
  │     ├─ Goal B (test: vitest run)       → EvidenceRecord { passed: false }
  │     └─ Goal C (file_exists: dist/**)   → EvidenceRecord { passed: true  }
  │
  ├─ 4. 更新 goal states
  │     A: pending → verified ✅
  │     B: failed (retryCount: 0→1)
  │     C: pending → verified ✅
  │
  ├─ 5. 记录证据到 EvidenceChain
  │
  ├─ 6. 计算 effortSpent += Σ(weight of checked goals)
  │
  └─ 7. determineStopCondition()
        │
        ├─ ALL(verified)        → AllGoalsVerifiedStop     → DELIVER ✅
        ├─ ANY(blocked)         → AnyGoalBlockedStop       → STOP 🛑
        ├─ effortSpent >= max   → MaxEffortExceededStop    → STOP ⚠️
        └─ 否则                 → null                     → CONTINUE ➡️
```

---

## 7. 使用示例

### 7.1 完整流程示例

**用户任务**: "创建一个 REST API 模块，包含用户 CRUD 操作"

```typescript
// === Step 1: Planner 生成计划 + AcceptanceCriteria ===
const plan: ExecutionPlan = {
  taskProfile: "code-review",
  steps: [
    {
      stepId: "define-types",
      agentType: "writer",
      description: "定义 User 类型和接口",
      acceptanceGoals: [
        {
          id: "types_exported",
          stepId: "define-types",
          description: "User 类型已导出且字段完整",
          verifyBy: [{
            type: "content_match",
            target: "src/types/user.ts",
            pattern: /export\s+(interface|type)\s+User\s*\{/,
          }],
          priority: "critical",
          required: true,
        },
        {
          id: "types_tsc_clean",
          stepId: "define-types",
          description: "类型定义文件 TypeScript 编译无错误",
          verifyBy: [{
            type: "command",
            command: "npx tsc --noEmit src/types/user.ts",
          }],
          priority: "critical",
          required: true,
        },
      ],
    },
    {
      stepId: "implement-crud",
      agentType: "writer",
      description: "实现 CRUD 操作函数",
      acceptanceGoals: [
        {
          id: "crud_functions_exist",
          stepId: "implement-crud",
          description: "getUser/createUser/updateUser/deleteUser 四个函数均已定义",
          verifyBy: [{
            type: "content_match",
            target: "src/api/users.ts",
            pattern: /(export\s+(async\s+)?function\s+(get|create|update|delete)User)/,
          }],
          priority: "critical",
          required: true,
        },
        {
          id: "crud_tests_pass",
          stepId: "implement-crud",
          description: "CRUD 单元测试全部通过",
          verifyBy: [{
            type: "test",
            pattern: "src/api/**/*.user*.test.ts",
            runner: "npx vitest run",
          }],
          priority: "major",
          required: false,
        },
        {
          id: "no_lint_errors",
          stepId: "implement-crud",
          description: "代码无 ESLint 错误",
          verifyBy: [{
            type: "lint",
            tool: "eslint",
            target: "src/api/users.ts",
          }],
          priority: "minor",
          required: false,
        },
      ],
    },
  ],
};

// === Step 2: LoopHarness 执行（Inner Loop 带 CompletionGuard） ===
const harness = new LoopHarness(toolRegistry, llmProvider);
const result = await harness.executeWithLoop(plan, context);

// === Step 3: 结果中包含完整的完成度信息 ===
console.log(result.allPassed);             // true/false
console.log(result.stopCondition);
// {
//   reason: "all_goals_verified",
//   verifiedGoals: [
//     { goalId: "types_exported", evidence: { ... } },
//     { goalId: "types_tsc_clean", evidence: { ... } },
//     { goalId: "crud_functions_exist", evidence: { ... } },
//     { goalId: "crud_tests_pass", evidence: { ... } },
//   ],
//   totalRounds: 3,
//   totalDurationMs: 45000,
// }

// === Step 4: Evidence Chain 包含完整验证轨迹 ===
const chain = await EvidenceChain.loadFromFile("./evidence/task-001.jsonl");
const verifications = chain.getEntriesByType("verification");
// [
//   { type: "verification", goalId: "types_tsc_clean", method: "command", passed: true, ... },
//   { type: "verification", goalId: "crud_tests_pass", method: "test", passed: true, ... },
// ]
```

### 7.2 与 GradingCriteria 共存的场景

```
Round 1:
  Writer 产出 → Critic 评分: 68/100 (未通过)
  CompletionGuard: types_exported=verified ✅, crud_functions_exist=failed ❌
  → 继续迭代 (feedback: "CRUD 函数缺少 deleteUser")

Round 2:
  Writer 产出 (根据反馈修改) → Critic 评分: 82/100 (通过!)
  CompletionGuard: types_exported=verified ✅, crud_tests_pass=failed ❌
  → 继续迭代 (虽然 Critic 说通过了，但 goal 未全部完成!)

Round 3:
  Writer 产出 (补充测试) → Critic 评分: 85/100
  CompletionGuard: ALL VERIFIED ✅✅✅✅
  → STOP & DELIVER (目标驱动停止，不管分数是否达到 90)
```

**这个例子展示了为什么需要两套系统共存**：Critic 的 82 分说明"质量还可以"，但 CompletionGuard 发现"测试还没写完"。两者互补。

---

## 8. 向后兼容策略

### 8.1 渐进式启用

| 阶段 | 行为 | 说明 |
|------|------|------|
| **Phase 0 (当前)** | 纯 GradingCriteria 驱动 | 无变化 |
| **Phase 1** | `enableCompletionGuard: false` (默认) | 新代码存在但不生效，现有行为不变 |
| **Phase 2** | Planner 开始生成 acceptanceGoals | 有 goals 的 step 启用 Guard，没有的走旧逻辑 |
| **Phase 3** | `enableCompletionGuard: true` (默认开启) | 全量切换为目标驱动 |

### 8.2 接口兼容

- `stopReason` 字段保留在 `LoopIteration` 中，与新的 `stopCondition` 共存
- `maxIterations` 保留作为安全阀，不再作为主停止条件
- `GradingCriteria` 完全保留，质量反馈环不受影响

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **验证命令本身有 bug** | 误判 goal 状态 | 每种验证方法配置 `expectExitCode`；支持多方法 fallback |
| **验证耗时过长** | 拖慢迭代速度 | `verificationTimeoutMs` 超时控制；`cacheVerifiedGoals` 跳过已通过的 |
| **AcceptanceCriteria 定义不准确** | goal 过宽/过严 | Planner prompt 工程化 + 动态模板库；支持手动调整 |
| **LLMAssertion 作为兜底不可靠** | 最后手段给出错误判断 | 明确标注置信度 `< 0.7` 时视为 `failed` 而非 `verified` |
| **循环依赖的 goals** | 永远无法全部 verified | 检测环路 → 自动降级部分 goal 为 `skipped` |

---

## 10. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/loop-engine/src/completion-guard/types.ts` | **新增** | 核心类型定义 |
| `packages/loop-engine/src/completion-guard/guard.ts` | **新增** | CompletionGuard 主类 |
| `packages/loop-engine/src/completion-guard/pipeline.ts` | **新增** | VerificationPipeline + Executor 接口 |
| `packages/loop-engine/src/completion-guard/executors/` | **新增** | 7 种内置执行器实现 |
| `packages/loop-engine/src/loop-module/engine.ts` | **修改** | run() 集成 CompletionGuard.check() |
| `packages/loop-engine/src/loop-module/grading-criteria.ts` | **不变** | GradingCriteria 保留 |
| `packages/loop-engine/src/loop-harness/engine.ts` | **修改** | 提取 goals + 传递给 LoopModule |
| `packages/loop-engine/src/index.ts` | **修改** | re-export 新模块 |
| `packages/loop-engine/src/types-entry.ts` | **修改** | re-export 新类型 |
| `packages/evidence-chain/src/types.ts` | **修改** | 新增 VerificationTraceEntry |
| `packages/evidence-chain/src/trace-recorders.ts` | **修改** | 新增 VerificationTraceRecorder |
| `packages/evidence-chain/src/evidence-chain.ts` | **修改** | 新增 verifications 属性 |
| `packages/loop-engine/MODULE_GUIDE.md` | **修改** | 新增 CompletionGuard 章节 |

---

## 11. 与现有概念的映射关系

| 新概念 | 对应/替换现有概念 | 关系 |
|--------|------------------|------|
| `AcceptanceCriteria` | 无直接对应 | **全新** — 任务完成度标准 |
| `AcceptanceGoal` | 无直接对应 | **全新** — 单个验收目标 |
| `CompletionGuard` | `determineStopReason()` | **增强** — 结构化替代 |
| `StopCondition` | `stopReason: string` | **替代** — 联合类型替代字符串 |
| `VerificationMethod` | 无直接对应 | **全新** — 验证方式枚举 |
| `EvidenceRecord` | `GradingResult.suggestions` | **互补** — 确定性证据 vs LLM 建议 |
| `VerificationTraceEntry` | 无直接对应 | **全新** — Evidence Chain 新 entry |
| `maxEffort` | `maxIterations` | **演进** — 加权努力值替代简单计数 |
| `GoalStatus` | `passed: boolean` | **增强** — 多状态替代布尔值 |

---

*文档版本: v0.1-draft | 作者: Loop Engineering Architecture Team | 日期: 2026-06-18*
