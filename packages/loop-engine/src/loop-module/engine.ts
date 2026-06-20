/**
 * Loop Module — 可复用的循环执行引擎
 *
 * 基于 Planner → Generator → Evaluator + Evolution 三/四 Agent 架构
 *
 * 核心设计（参考 frontend design harness 的最佳实践）：
 * 1. 固定评估标准 (GradingCriteria) — 任务开始前定义，全程不变
 * 2. Context Reset — 每次迭代清空上下文，通过 IterationHandoff 传递状态
 * 3. Strategic Decision — 每轮评估后：refine（精炼）或 pivot（转向）或 accept（接受）
 * 4. Evolution Module — 学习评分趋势，自动调整策略
 * 5. Degradation Guard — 分数下降则终止，保留最佳版本
 *
 * 与 monolithic LoopHarness 的区别：
 * - LoopHarness: 内部硬编码 Writer/Critic 的调用逻辑
 * - LoopModule: 抽象接口，任何实现 Planner/Generator/Evaluator 的 Agent 都可以接入
 */

import type { GradingCriteria, GradingResult, StrategicDecision, IterationHandoff } from "./grading-criteria.js";
import { DEFAULT_WRITING_CRITERIA, formatCriteriaForEvaluator, formatCriteriaForGenerator } from "./grading-criteria.js";
import { retryWithBackoff } from "../utils/retry.js";
import type {
  AcceptanceGoal,
  StopCondition,
  CompletionGuardConfig,
} from "../completion-guard/types.js";
import { CompletionGuard } from "../completion-guard/guard.js";
import { StopPolicy, evaluateStop, isSignificantImprovement, type StopContext } from "../stop-policy/policy.js";

// ============================================================
// Agent 接口定义（Seam — 可替换的实现）
// ============================================================

/** 规划器：将任务拆解为执行计划 */
export interface IPlannerAgent<Input = any, Plan = any> {
  /** 生成执行计划 */
  plan(input: Input, context?: Record<string, unknown>): Promise<Plan>;
}

/** 生成器：根据计划 + 反馈生成产出 */
export interface IGeneratorAgent<Plan = any, Output = any> {
  /**
   * 生成产出
   * @param plan 当前步骤的计划
   * @param feedback 来自上一次 Evaluator 的反馈（首次为空）
   * @param handoff 迭代状态交接（包含历史趋势、战略方向等）
   */
  generate(plan: Plan, feedback?: string, handoff?: IterationHandoff): Promise<Output>;
}

/** 评估器：按照固定标准评估产出 */
export interface IEvaluatorAgent<Output = any> {
  /**
   * 评估产出
   * @param output 待评估的产出
   * @param criteria 固定评估标准
   * @param originalTask 原始任务（用于 topic accuracy 检测）
   */
  evaluate(output: Output, criteria: GradingCriteria, originalTask: string): Promise<GradingResult>;
}

/** 自进化器：学习迭代模式，优化策略 */
export interface IEvolutionAgent {
  /**
   * 分析迭代历史，给出策略建议
   * @param history 所有迭代的评估结果
   * @returns 建议的战略决策和原因
   */
  analyze(history: GradingResult[]): Promise<{
    decision: StrategicDecision;
    reason: string;
    patternInsights?: string[];
  }>;
}

// ============================================================
// LoopModule 配置
// ============================================================

export interface LoopModuleConfig {
  /** 最大迭代次数（含首次）— 作为安全阀保留，主停止由 CompletionGuard 控制 */
  maxIterations: number;
  /** 是否启用退化保护 */
  enableDegradationGuard: boolean;
  /** 是否启用自进化分析 */
  enableEvolution: boolean;
  /** 连续多少轮分数无改善触发 pivot */
  stagnationThreshold: number;
  /** Context Reset: 是否在每次迭代间重置 Generator 上下文 */
  useContextReset: boolean;

  // === Completion Guard (ADR-004: 目标驱动停止) ===
  /** 是否启用 CompletionGuard（目标驱动停止条件） */
  enableCompletionGuard?: boolean;
  /** AcceptanceCriteria — 验收目标列表 */
  acceptanceCriteria?: AcceptanceGoal[];
  /** CompletionGuard 配置 */
  completionGuardConfig?: Partial<CompletionGuardConfig>;
  // === LLM Provider (P0-2a: 用于 LLMAssertionExecutor 对接) ===
  /** LLM Provider 包装函数 — 用于验证阶段的 LLM 断言 */
  llmProviderFn?: (prompt: string) => Promise<string>;
}

const DEFAULT_CONFIG: LoopModuleConfig = {
  maxIterations: 5,
  enableDegradationGuard: true,
  enableEvolution: true,
  stagnationThreshold: 2,
  useContextReset: true,
};

// ============================================================
// 单次迭代结果
// ============================================================

export interface LoopIteration<TOutput = any> {
  /** 迭代轮次 (1-based) */
  round: number;
  /** 生成器的产出 */
  output: TOutput;
  /** 评估结果 */
  evaluation: GradingResult;
  /** 战略决策 */
  strategicDecision: StrategicDecision;
  /** 终止原因 */
  stopReason: import("../stop-policy/policy.js").StopReason;
  /** 本轮耗时 ms */
  durationMs: number;
}

/** LoopModule 完整执行结果 */
export interface LoopModuleResult<TOutput = any> {
  /** 所有迭代记录 */
  iterations: LoopIteration<TOutput>[];
  /** 最终使用的产出（最佳版本） */
  bestOutput: TOutput | null;
  /** 最终评分 */
  finalScore: number;
  /** 最终是否通过 */
  passed: boolean;
  /** 最终是否优秀 */
  excellent: boolean;
  /** 总迭代次数 */
  totalIterations: number;
  /** 总耗时 ms */
  totalDurationMs: number;
  /** Evolution 分析结果（如果启用） */
  evolutionSummary?: {
    patternFound: string;
    suggestions: string[];
  };

  // === Completion Guard (ADR-004) ===
  /** 目标完成度快照 */
  goalSnapshot?: Array<{ goalId: string; status: "pending" | "verifying" | "verified" | "failed" | "blocked" | "skipped" }>;
  /** 结构化停止条件（替代 stopReason 字符串） */
  stopCondition?: StopCondition;
  /** 完成进度 */
  completionProgress?: {
    totalGoals: number;
    verifiedGoals: number;
    progressPercent: number;
  };
}

// ============================================================
// LoopModule 核心
// ============================================================

/**
 * Loop Module — 可复用的循环执行引擎
 *
 * 使用方式：
 * ```typescript
 * const loop = new LoopModule({
 *   planner: myPlanner,
 *   generator: myWriterAgent,
 *   evaluator: myCriticAgent,
 *   evolution: myEvolutionAgent, // optional
 *   criteria: DEFAULT_WRITING_CRITERIA,
 * });
 *
 * const result = await loop.run("写一篇关于 AI Agent 的技术博客");
 * console.log(result.passed, result.finalScore, result.totalIterations);
 * ```
 */
export class LoopModule<
  TInput = string,
  TPlan = any,
  TOutput = any,
> {
  private planner: IPlannerAgent<TInput, TPlan>;
  private generator: IGeneratorAgent<TPlan, TOutput>;
  private evaluator: IEvaluatorAgent<TOutput>;
  private evolution?: IEvolutionAgent;
  private criteria: GradingCriteria;
  private config: LoopModuleConfig;
  /** ADR-004: 目标驱动完成度守护者 */
  private completionGuard?: CompletionGuard;
  /** 最新一轮 CompletionGuard 检查结果（供 shouldStop() 读取） */
  private latestGuardResult: import("../completion-guard/types.js").CompletionCheckResult | null = null;
  /** 统一停止策略模块 */
  private stopPolicy: StopPolicy;

  constructor(params: {
    planner: IPlannerAgent<TInput, TPlan>;
    generator: IGeneratorAgent<TPlan, TOutput>;
    evaluator: IEvaluatorAgent<TOutput>;
    evolution?: IEvolutionAgent;
    criteria?: GradingCriteria;
    config?: Partial<LoopModuleConfig>;
  }) {
    this.planner = params.planner;
    this.generator = params.generator;
    this.evaluator = params.evaluator;
    this.evolution = params.evolution;
    this.criteria = params.criteria ?? DEFAULT_WRITING_CRITERIA;
    this.config = { ...DEFAULT_CONFIG, ...params.config };

    this.stopPolicy = new StopPolicy({
      maxIterations: this.config.maxIterations,
      enableDegradationGuard: this.config.enableDegradationGuard,
      degradationThreshold: 10,
      enableStagnationDetection: true,
      stagnationThreshold: this.config.stagnationThreshold,
      improvementThreshold: 3,
      minQualityScore: this.config.completionGuardConfig?.minQualityScore,
    });

    // 初始化 CompletionGuard（如果启用且有验收目标）
    if (this.config.enableCompletionGuard && this.config.acceptanceCriteria && this.config.acceptanceCriteria.length > 0) {
      this.completionGuard = new CompletionGuard(
        this.config.acceptanceCriteria,
        {
          ...this.config.completionGuardConfig,
          llmProvider: this.config.llmProviderFn, // ★ P0-2a: LLM Provider 对接
        }
      );
      console.log(`[LoopModule] CompletionGuard 启用: ${this.config.acceptanceCriteria.length} 个验收目标`);
    }
  }

  /** 获取当前配置（只读） */
  getConfig(): Readonly<LoopModuleConfig> { return this.config; }
  getCriteria(): Readonly<GradingCriteria> { return this.criteria; }

  // ============================================================
  // 主入口：执行完整循环
  // ============================================================

  async run(input: TInput): Promise<LoopModuleResult<TOutput>> {
    const startTime = Date.now();
    const iterations: LoopIteration<TOutput>[] = [];
    let bestOutput: TOutput | null = null;
    let bestScore = -1;
    let lastScore = -1;
    let stagnationCount = 0;

    // Step 1: Planner 生成计划（带重试）
    console.log(`[LoopModule] Step 1: Planner 生成计划...`);
    const plan = await retryWithBackoff(
      () => this.planner.plan(input),
      { maxAttempts: 2, baseDelayMs: 1000, onRetry: (a, e) => console.warn(`[LoopModule] Planner 第 ${a} 次失败 (${e.reason}), 重试中...`) }
    );

    // Step 2-4: Generator → Evaluator → [目标驱动循环]
    // ★ ADR-004 改造：从回合制 for 循环改为目标驱动 while 循环
    // 停止条件由 StopPolicy 统一处理，maxIterations 仅作为安全阀
    let round = 0;
    while (!this.shouldStop(iterations, bestScore, lastScore, round)) {
      round++;
      const iterStart = Date.now();
      console.log(`[LoopModule] Iteration ${round} (目标驱动: guard=${this.completionGuard ? "ON" : "OFF"})`);

      // --- Generate（带重试）---
      const handoff = this.buildHandoff(round, iterations, bestScore, lastScore);
      const feedback = iterations.length > 0
        ? this.formatFeedback(iterations[iterations.length - 1].evaluation)
        : undefined;

      let output: TOutput;
      try {
        output = await retryWithBackoff(
          () => this.generator.generate(plan, feedback, handoff),
          {
            maxAttempts: 3,
            baseDelayMs: 1500,
            onRetry: (a, e) => console.warn(`[LoopModule] Iteration ${round} Generator 第 ${a} 次失败 (${e.reason}), 重试中...`),
          }
        );
      } catch (e) {
        console.error(`[LoopModule] Iteration ${round} Generator 失败:`, e instanceof Error ? e.message : e);
        iterations.push({
          round,
          output: {} as TOutput,
          evaluation: this.emptyEvaluation(round),
          strategicDecision: "accept",
          stopReason: "error",
          durationMs: Date.now() - iterStart,
        });
        break;
      }

      // --- Evaluate（带重试）---
      let evaluation: GradingResult;
      try {
        evaluation = await retryWithBackoff(
          () => this.evaluator.evaluate(
            output,
            this.criteria,
            typeof input === "string" ? input : JSON.stringify(input)
          ),
          {
            maxAttempts: 2,
            baseDelayMs: 1000,
            onRetry: (a, e) => console.warn(`[LoopModule] Iteration ${round} Evaluator 第 ${a} 次失败 (${e.reason}), 重试中...`),
          }
        );
      } catch (e) {
        console.warn(`[LoopModule] Iteration ${round} Evaluator 失败:`, e instanceof Error ? e.message : e);
        evaluation = this.emptyEvaluation(round);
      }

      // --- Strategic Decision ---
      const strategicDecision = await this.makeStrategicDecision(evaluation, iterations, round);

      // --- ★ 目标驱动：CompletionGuard 检查（结果供 shouldStop() 在循环条件中使用）---
      if (this.completionGuard) {
        try {
          this.completionGuard.setQualityScore(evaluation.totalScore);
          const guardResult = await this.completionGuard.check(output);
          // 缓存最新 guard 结果，shouldStop() 会在下次循环条件判断时读取
          this.latestGuardResult = guardResult;
          if (guardResult.stopCondition) {
            console.log(
              `[LoopModule] Iteration ${round}: CompletionGuard → ${guardResult.stopCondition.reason} ` +
              `(${guardResult.progress.verified}/${guardResult.progress.total} verified)`
            );
          }
        } catch (e) {
          console.warn(`[LoopModule] CompletionGuard 检查异常:`, e instanceof Error ? e.message : e);
        }
      }

      // --- 停止决策（统一由 StopPolicy）---
      const stopDecision = this.stopPolicy.evaluate({
        iteration: round,
        evaluation,
        bestScore,
        lastScore,
        stagnationCount,
        guardResult: this.latestGuardResult,
        hasError: false,
      });

      // --- 更新最佳版本跟踪 ---
      const improvement = isSignificantImprovement(
        evaluation.totalScore,
        bestScore,
        lastScore,
        this.stopPolicy.getConfig().improvementThreshold
      );

      let isDegraded = false;
      if (improvement === "new_best") {
        bestScore = evaluation.totalScore;
        bestOutput = output;
        stagnationCount = 0;
      } else if (improvement === "improved") {
        // 有显著改善但不创新高，不增加停滞
      } else {
        stagnationCount++;
        // 退化保护：仅当下降超过阈值时标记
        if (this.config.enableDegradationGuard && round > 1 && lastScore - evaluation.totalScore > this.stopPolicy.getConfig().degradationThreshold) {
          console.warn(`[LoopModule] Iteration ${round}: 退化! ${evaluation.totalScore} < ${lastScore}（超过阈值）, 保留最佳版本`);
          isDegraded = true;
        }
      }

      // 记录本轮迭代
      const stopReason: LoopIteration<TOutput>["stopReason"] = isDegraded
        ? "degradation"
        : stopDecision.reason;
      iterations.push({
        round,
        output,
        evaluation,
        strategicDecision,
        stopReason,
        durationMs: Date.now() - iterStart,
      });

      // Log
      console.log(
        `[LoopModule] Iteration ${round}: score=${evaluation.totalScore}/100, ` +
        `passed=${evaluation.passed}, decision=${strategicDecision}, stopReason=${stopReason}`
      );

      // Pivot 通知（不终止循环，仅日志）
      if (stopReason === "stagnation_pivot") {
        console.log(`[LoopModule] Pivot 触发! 连续 ${stagnationCount} 轮无改善`);
      }

      lastScore = evaluation.totalScore;
    }

    // Step 5: Evolution Analysis（如果启用，带重试）
    let evolutionSummary: LoopModuleResult["evolutionSummary"];
    if (this.config.enableEvolution && this.evolution && iterations.length > 1) {
      try {
        const evalHistory = iterations.map((it) => it.evaluation);
        const analysis = await retryWithBackoff(
          () => this.evolution!.analyze(evalHistory),
          { maxAttempts: 2, baseDelayMs: 1000, onRetry: (a, e) => console.warn(`[LoopModule] Evolution 第 ${a} 次失败 (${e.reason}), 重试中...`) }
        );
        evolutionSummary = {
          patternFound: analysis.reason,
          suggestions: analysis.patternInsights ?? [],
        };
        console.log(`[LoopModule] Evolution: ${analysis.decision} — ${analysis.reason}`);
      } catch (e) {
        console.warn("[LoopModule] Evolution 分析失败:", e instanceof Error ? e.message : e);
      }
    }

    // 构建最终结果
    const finalEval = iterations[iterations.length - 1]?.evaluation ?? this.emptyEvaluation(0);

    // ★ ADR-004: 从 CompletionGuard 提取目标完成度信息
    let goalSnapshot: LoopModuleResult["goalSnapshot"];
    let stopCondition: StopCondition | undefined;
    let completionProgress: LoopModuleResult["completionProgress"];
    if (this.completionGuard) {
      const snapshot = this.completionGuard.getGoalSnapshot();
      goalSnapshot = Array.from(snapshot.entries()).map(([id, gs]) => ({
        goalId: id,
        status: gs.state,
      }));
      // 获取最终停止条件（如果 guard 触发了停止）
      const lastCheckProgress = this.completionGuard.getProgress();
      completionProgress = {
        totalGoals: lastCheckProgress.total,
        verifiedGoals: lastCheckProgress.verified,
        progressPercent: lastCheckProgress.progressPercent,
      };
      // stopCondition 在循环中已通过 guardResult.stopCondition 设置
      // 这里从最后一次 check 结果中重新获取（简化：直接用 progress 推断）
      if (lastCheckProgress.verified === lastCheckProgress.total && lastCheckProgress.total > 0) {
        stopCondition = {
          reason: "all_goals_verified",
          verifiedGoals: goalSnapshot
            .filter((g) => g.status === "verified")
            .map((g) => ({ goalId: g.goalId, evidence: {} as any })),
          totalIterations: iterations.length,
          totalDurationMs: Date.now() - startTime,
        };
      }
    }

    return {
      iterations,
      bestOutput: bestOutput ?? (iterations[0]?.output ?? null),
      finalScore: bestScore > 0 ? bestScore : finalEval.totalScore,
      passed: finalEval.passed || bestScore >= this.criteria.passThreshold,
      excellent: finalEval.excellent || bestScore >= this.criteria.excellenceThreshold,
      totalIterations: iterations.length,
      totalDurationMs: Date.now() - startTime,
      evolutionSummary,
      // ★ ADR-004
      goalSnapshot,
      stopCondition,
      completionProgress,
    };
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /** 构建 IterationHandoff（Context Reset 状态交接） */
  private buildHandoff(
    round: number,
    history: LoopIteration[],
    bestScore: number,
    lastScore: number
  ): IterationHandoff {
    const scoreTrend = history.map((it) => it.evaluation.totalScore);
    const lastEval = history.length > 0 ? history[history.length - 1].evaluation : undefined;

    // 收集所有建议（去重）
    const allSuggestions = new Set<string>();
    for (const it of history) {
      for (const s of it.evaluation.suggestions) {
        allSuggestions.add(s.suggestion);
      }
    }

    return {
      round,
      bestScore,
      bestOutput: undefined, // 不传递完整输出以节省 token，只传分数趋势
      lastEvaluation: lastEval,
      scoreTrend,
      currentStrategy: this.inferCurrentStrategy(scoreTrend),
      accumulatedSuggestions: Array.from(allSuggestions),
    };
  }

  /** 格式化反馈文本（注入到 Generator） */
  private formatFeedback(evaluation: GradingResult): string {
    const lines: string[] = [
      `═══ 上一次评估结果 (Iteration ${evaluation.round}) ═══`,
      ``,
      `【总分】${evaluation.totalScore}/100 (加权: ${evaluation.weightedScore.toFixed(1)})`,
      `【是否通过】${evaluation.passed ? "✅ 通过" : "❌ 未通过"}`,
      ``,
      `【各维度得分】`,
    ];

    for (const ds of evaluation.dimensionScores) {
      lines.push(`  • ${ds.dimensionName} (${ds.dimensionId}): ${ds.rawScore}/20 — ${ds.comment}`);
    }

    if (evaluation.suggestions.length > 0) {
      lines.push(``, `【修改建议 (${evaluation.suggestions.length} 条)】`);
      for (let i = 0; i < evaluation.suggestions.length; i++) {
        const s = evaluation.suggestions[i];
        lines.push(`  ${i + 1}. [${s.severity}] ${s.description}`);
        lines.push(`     → ${s.suggestion}`);
      }
    }

    if (evaluation.reasoning) {
      lines.push(``, `【总体评语】${evaluation.reasoning}`);
    }

    lines.push(``, `═══ 请根据以上反馈改进你的产出 ═══`);

    return lines.join("\n");
  }

  /** 做出战略决策 */
  private async makeStrategicDecision(
    evaluation: GradingResult,
    history: LoopIteration[],
    round: number
  ): Promise<StrategicDecision> {
    // 已达到优秀线 → accept
    if (evaluation.excellent) return "accept";

    // 有 Evolution Agent → 使用其分析
    if (this.config.enableEvolution && this.evolution && history.length > 0) {
      try {
        const evalHistory = [...history.map((it) => it.evaluation), evaluation];
        const analysis = await this.evolution.analyze(evalHistory);
        return analysis.decision;
      } catch {
        // Evolution 失败，使用默认逻辑
      }
    }

    // 默认逻辑：基于分数趋势
    if (history.length >= 2) {
      const prevScore = history[history.length - 1].evaluation.totalScore;
      if (evaluation.totalScore >= prevScore + 5) return "refine"; // 在改善，继续精炼
      if (evaluation.totalScore < prevScore - 10) return "pivot"; // 明显恶化，考虑转向
    }

    return "refine"; // 默认继续精炼
  }


  /**
   * ★ ADR-004 目标驱动：统一停止条件判断
   *
   * 现在委托给 StopPolicy 模块处理，LoopModule 只负责读取最后一次迭代记录
   * 并调用 stopPolicy.evaluate()。
   */
  private shouldStop(
    iterations: LoopIteration<TOutput>[],
    _bestScore: number,
    _lastScore: number,
    currentIteration: number
  ): boolean {
    // 规则 0: 至少执行一轮（round==0 表示还未开始第一轮）
    if (currentIteration === 0) return false;

    const lastIter = iterations[iterations.length - 1];
    if (!lastIter) return false;

    // StopPolicy 已经在循环体内评估过，我们复用最后记录的 stopReason 即可
    const stopped = lastIter.stopReason !== "continue";
    if (stopped) {
      console.log(
        `[LoopModule] shouldStop() → StopPolicy 触发停止: ${lastIter.stopReason}`
      );
    }
    return stopped;
  }

  /** 推断当前战略方向 */
  private inferCurrentStrategy(scoreTrend: number[]): StrategicDecision {
    if (scoreTrend.length < 2) return "refine";

    const recent = scoreTrend.slice(-3);
    const improving = recent.every((v, i) => i === 0 || v >= recent[i - 1]);
    const declining = recent.every((v, i) => i === 0 || v <= recent[i - 1]);

    if (improving) return "refine";
    if (declining && recent.length >= 2) return "pivot";
    return "refine";
  }

  /** 创建空的评估结果（当 Evaluator 失败时） */
  private emptyEvaluation(round: number): GradingResult {
    return {
      totalScore: 0,
      weightedScore: 0,
      passed: false,
      excellent: false,
      dimensionScores: this.criteria.dimensions.map((d) => ({
        dimensionId: d.id,
        dimensionName: d.name,
        rawScore: 0,
        maxScore: d.maxScore,
        weightedScore: 0,
        comment: "Evaluator failed",
      })),
      reasoning: "Evaluator execution failed",
      suggestions: [],
      round,
    };
  }
}
