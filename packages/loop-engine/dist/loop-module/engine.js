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
import { DEFAULT_WRITING_CRITERIA } from "./grading-criteria.js";
import { retryWithBackoff } from "../utils/retry.js";
import { CompletionGuard } from "../completion-guard/guard.js";
const DEFAULT_CONFIG = {
    maxIterations: 5,
    enableDegradationGuard: true,
    enableEvolution: true,
    stagnationThreshold: 2,
    useContextReset: true,
};
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
export class LoopModule {
    planner;
    generator;
    evaluator;
    evolution;
    criteria;
    config;
    /** ADR-004: 目标驱动完成度守护者 */
    completionGuard;
    /** 最新一轮 CompletionGuard 检查结果（供 shouldStop() 读取） */
    latestGuardResult = null;
    constructor(params) {
        this.planner = params.planner;
        this.generator = params.generator;
        this.evaluator = params.evaluator;
        this.evolution = params.evolution;
        this.criteria = params.criteria ?? DEFAULT_WRITING_CRITERIA;
        this.config = { ...DEFAULT_CONFIG, ...params.config };
        // 初始化 CompletionGuard（如果启用且有验收目标）
        if (this.config.enableCompletionGuard && this.config.acceptanceCriteria && this.config.acceptanceCriteria.length > 0) {
            this.completionGuard = new CompletionGuard(this.config.acceptanceCriteria, {
                ...this.config.completionGuardConfig,
                llmProvider: this.config.llmProviderFn, // ★ P0-2a: LLM Provider 对接
            });
            console.log(`[LoopModule] CompletionGuard 启用: ${this.config.acceptanceCriteria.length} 个验收目标`);
        }
    }
    /** 获取当前配置（只读） */
    getConfig() { return this.config; }
    getCriteria() { return this.criteria; }
    // ============================================================
    // 主入口：执行完整循环
    // ============================================================
    async run(input) {
        const startTime = Date.now();
        const iterations = [];
        let bestOutput = null;
        let bestScore = -1;
        let lastScore = -1;
        let stagnationCount = 0;
        // Step 1: Planner 生成计划（带重试）
        console.log(`[LoopModule] Step 1: Planner 生成计划...`);
        const plan = await retryWithBackoff(() => this.planner.plan(input), { maxAttempts: 2, baseDelayMs: 1000, onRetry: (a, e) => console.warn(`[LoopModule] Planner 第 ${a} 次失败 (${e.reason}), 重试中...`) });
        // Step 2-4: Generator → Evaluator → [目标驱动循环]
        // ★ ADR-004 改造：从回合制 for 循环改为目标驱动 while 循环
        // 停止条件由 CompletionGuard（结构化目标完成度）主导，maxIterations 仅作为安全阀
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
            let output;
            try {
                output = await retryWithBackoff(() => this.generator.generate(plan, feedback, handoff), {
                    maxAttempts: 3,
                    baseDelayMs: 1500,
                    onRetry: (a, e) => console.warn(`[LoopModule] Iteration ${round} Generator 第 ${a} 次失败 (${e.reason}), 重试中...`),
                });
            }
            catch (e) {
                console.error(`[LoopModule] Iteration ${round} Generator 失败:`, e instanceof Error ? e.message : e);
                iterations.push({
                    round,
                    output: {},
                    evaluation: this.emptyEvaluation(round),
                    strategicDecision: "accept",
                    stopReason: "error",
                    durationMs: Date.now() - iterStart,
                });
                break;
            }
            // --- Evaluate（带重试）---
            let evaluation;
            try {
                evaluation = await retryWithBackoff(() => this.evaluator.evaluate(output, this.criteria, typeof input === "string" ? input : JSON.stringify(input)), {
                    maxAttempts: 2,
                    baseDelayMs: 1000,
                    onRetry: (a, e) => console.warn(`[LoopModule] Iteration ${round} Evaluator 第 ${a} 次失败 (${e.reason}), 重试中...`),
                });
            }
            catch (e) {
                console.warn(`[LoopModule] Iteration ${round} Evaluator 失败:`, e instanceof Error ? e.message : e);
                evaluation = this.emptyEvaluation(round);
            }
            // --- Strategic Decision ---
            const strategicDecision = await this.makeStrategicDecision(evaluation, iterations, round);
            // --- Degradation Guard（记录但不在此处终止，由 shouldStop() 统一判断）---
            let isDegraded = false;
            if (this.config.enableDegradationGuard && round > 1 && evaluation.totalScore < lastScore) {
                console.warn(`[LoopModule] Iteration ${round}: 退化! ${evaluation.totalScore} < ${lastScore}, 保留最佳版本`);
                isDegraded = true;
            }
            // 更新最佳版本跟踪（退化的轮次不更新最佳分数）
            if (evaluation.totalScore > bestScore) {
                bestScore = evaluation.totalScore;
                bestOutput = output;
                stagnationCount = 0;
            }
            else {
                stagnationCount++;
            }
            // 记录本轮迭代
            const stopReason = this.determineStopReason(evaluation, round, stagnationCount, strategicDecision);
            iterations.push({
                round,
                output,
                evaluation,
                strategicDecision,
                stopReason: isDegraded ? "degradation" : stopReason,
                durationMs: Date.now() - iterStart,
            });
            // Log
            console.log(`[LoopModule] Iteration ${round}: score=${evaluation.totalScore}/100, ` +
                `passed=${evaluation.passed}, decision=${strategicDecision}`);
            // --- ★ 目标驱动：CompletionGuard 检查（结果供 shouldStop() 在循环条件中使用）---
            if (this.completionGuard) {
                try {
                    this.completionGuard.setQualityScore(evaluation.totalScore);
                    const guardResult = await this.completionGuard.check(output);
                    // 缓存最新 guard 结果，shouldStop() 会在下次循环条件判断时读取
                    this.latestGuardResult = guardResult;
                    if (guardResult.stopCondition) {
                        console.log(`[LoopModule] Iteration ${round}: CompletionGuard → ${guardResult.stopCondition.reason} ` +
                            `(${guardResult.progress.verified}/${guardResult.progress.total} verified)`);
                    }
                }
                catch (e) {
                    console.warn(`[LoopModule] CompletionGuard 检查异常:`, e instanceof Error ? e.message : e);
                }
            }
            // Pivot 通知（不终止循环，仅日志）
            if (stopReason === "stagnation_pivot") {
                console.log(`[LoopModule] Pivot 触发! 连续 ${stagnationCount} 轮无改善`);
            }
            lastScore = evaluation.totalScore;
        }
        // Step 5: Evolution Analysis（如果启用，带重试）
        let evolutionSummary;
        if (this.config.enableEvolution && this.evolution && iterations.length > 1) {
            try {
                const evalHistory = iterations.map((it) => it.evaluation);
                const analysis = await retryWithBackoff(() => this.evolution.analyze(evalHistory), { maxAttempts: 2, baseDelayMs: 1000, onRetry: (a, e) => console.warn(`[LoopModule] Evolution 第 ${a} 次失败 (${e.reason}), 重试中...`) });
                evolutionSummary = {
                    patternFound: analysis.reason,
                    suggestions: analysis.patternInsights ?? [],
                };
                console.log(`[LoopModule] Evolution: ${analysis.decision} — ${analysis.reason}`);
            }
            catch (e) {
                console.warn("[LoopModule] Evolution 分析失败:", e instanceof Error ? e.message : e);
            }
        }
        // 构建最终结果
        const finalEval = iterations[iterations.length - 1]?.evaluation ?? this.emptyEvaluation(0);
        // ★ ADR-004: 从 CompletionGuard 提取目标完成度信息
        let goalSnapshot;
        let stopCondition;
        let completionProgress;
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
                        .map((g) => ({ goalId: g.goalId, evidence: {} })),
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
    buildHandoff(round, history, bestScore, lastScore) {
        const scoreTrend = history.map((it) => it.evaluation.totalScore);
        const lastEval = history.length > 0 ? history[history.length - 1].evaluation : undefined;
        // 收集所有建议（去重）
        const allSuggestions = new Set();
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
    formatFeedback(evaluation) {
        const lines = [
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
    async makeStrategicDecision(evaluation, history, round) {
        // 已达到优秀线 → accept
        if (evaluation.excellent)
            return "accept";
        // 有 Evolution Agent → 使用其分析
        if (this.config.enableEvolution && this.evolution && history.length > 0) {
            try {
                const evalHistory = [...history.map((it) => it.evaluation), evaluation];
                const analysis = await this.evolution.analyze(evalHistory);
                return analysis.decision;
            }
            catch {
                // Evolution 失败，使用默认逻辑
            }
        }
        // 默认逻辑：基于分数趋势
        if (history.length >= 2) {
            const prevScore = history[history.length - 1].evaluation.totalScore;
            if (evaluation.totalScore >= prevScore + 5)
                return "refine"; // 在改善，继续精炼
            if (evaluation.totalScore < prevScore - 10)
                return "pivot"; // 明显恶化，考虑转向
        }
        return "refine"; // 默认继续精炼
    }
    /** 判断是否应该停止 */
    determineStopReason(evaluation, round, stagnationCount, decision) {
        if (evaluation.excellent)
            return "excellent";
        if (evaluation.passed)
            return "passed";
        if (round >= this.config.maxIterations)
            return "max_iterations";
        if (stagnationCount >= this.config.stagnationThreshold && decision === "pivot") {
            return "stagnation_pivot";
        }
        return "passed"; // continue (will be checked by caller)
    }
    /**
     * ★ ADR-004 目标驱动：统一停止条件判断
     *
     * 替代原来分散在 for 循环内的多个 break 条件，
     * 将所有停止逻辑集中到 while 循环的条件判断中。
     *
     * 停止优先级（从高到低）：
     *  1. CompletionGuard 结构化目标完成度（主导）
     *  2. 质量达标（excellent / passed）
     *  3. 退化保护（分数下降）
     *  4. 安全阀（maxIterations 上限）
     *
     * @returns true = 应该停止，false = 继续迭代
     */
    shouldStop(iterations, bestScore, lastScore, currentIteration) {
        // 规则 0: 至少执行一轮（round==0 表示还未开始第一轮）
        if (currentIteration === 0)
            return false;
        // 规则 1: CompletionGuard 主导（如果启用且有结果）
        if (this.completionGuard && this.latestGuardResult) {
            const guardResult = this.latestGuardResult;
            if (guardResult.stopCondition) {
                console.log(`[LoopModule] shouldStop() → CompletionGuard 触发停止: ${guardResult.stopCondition.reason}`);
                return true;
            }
        }
        // 规则 2: 质量达标检查（基于最新一次迭代）
        const lastIter = iterations[iterations.length - 1];
        if (lastIter) {
            const eval_ = lastIter.evaluation;
            if (eval_.excellent) {
                console.log(`[LoopModule] shouldStop() → excellent (${eval_.totalScore}/100)`);
                return true;
            }
            if (eval_.passed) {
                console.log(`[LoopModule] shouldStop() → passed (${eval_.totalScore}/100)`);
                return true;
            }
            // 规则 3: 退化保护（第二轮起生效）
            if (this.config.enableDegradationGuard && iterations.length > 1) {
                if (eval_.totalScore < lastScore) {
                    console.log(`[LoopModule] shouldStop() → degradation (${eval_.totalScore} < ${lastScore})`);
                    return true;
                }
            }
        }
        // 规则 4: maxIterations 安全阀（仅作为最后兜底，不作为主控制）
        if (currentIteration >= this.config.maxIterations) {
            console.log(`[LoopModule] shouldStop() → safety valve: maxIterations (${currentIteration}/${this.config.maxIterations})`);
            return true;
        }
        // 默认：继续迭代
        return false;
    }
    /** 推断当前战略方向 */
    inferCurrentStrategy(scoreTrend) {
        if (scoreTrend.length < 2)
            return "refine";
        const recent = scoreTrend.slice(-3);
        const improving = recent.every((v, i) => i === 0 || v >= recent[i - 1]);
        const declining = recent.every((v, i) => i === 0 || v <= recent[i - 1]);
        if (improving)
            return "refine";
        if (declining && recent.length >= 2)
            return "pivot";
        return "refine";
    }
    /** 创建空的评估结果（当 Evaluator 失败时） */
    emptyEvaluation(round) {
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
//# sourceMappingURL=engine.js.map