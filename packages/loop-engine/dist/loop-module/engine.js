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
 * console.log(result.passed, result.finalScore, result.totalRounds);
 * ```
 */
export class LoopModule {
    planner;
    generator;
    evaluator;
    evolution;
    criteria;
    config;
    constructor(params) {
        this.planner = params.planner;
        this.generator = params.generator;
        this.evaluator = params.evaluator;
        this.evolution = params.evolution;
        this.criteria = params.criteria ?? DEFAULT_WRITING_CRITERIA;
        this.config = { ...DEFAULT_CONFIG, ...params.config };
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
        // Step 2-4: Generator → Evaluator → [循环]
        for (let round = 1; round <= this.config.maxIterations; round++) {
            const iterStart = Date.now();
            console.log(`[LoopModule] Round ${round}/${this.config.maxIterations}`);
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
                    onRetry: (a, e) => console.warn(`[LoopModule] Round ${round} Generator 第 ${a} 次失败 (${e.reason}), 重试中...`),
                });
            }
            catch (e) {
                console.error(`[LoopModule] Round ${round} Generator 失败:`, e instanceof Error ? e.message : e);
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
                    onRetry: (a, e) => console.warn(`[LoopModule] Round ${round} Evaluator 第 ${a} 次失败 (${e.reason}), 重试中...`),
                });
            }
            catch (e) {
                console.warn(`[LoopModule] Round ${round} Evaluator 失败:`, e instanceof Error ? e.message : e);
                evaluation = this.emptyEvaluation(round);
            }
            // --- Strategic Decision ---
            const strategicDecision = await this.makeStrategicDecision(evaluation, iterations, round);
            // --- Degradation Guard ---
            if (this.config.enableDegradationGuard && round > 1 && evaluation.totalScore < lastScore) {
                console.warn(`[LoopModule] Round ${round}: 退化! ${evaluation.totalScore} < ${lastScore}, 保留最佳版本`);
                iterations.push({
                    round,
                    output,
                    evaluation,
                    strategicDecision,
                    stopReason: "degradation",
                    durationMs: Date.now() - iterStart,
                });
                break;
            }
            // 更新最佳版本跟踪
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
                stopReason,
                durationMs: Date.now() - iterStart,
            });
            // Log
            console.log(`[LoopModule] Round ${round}: score=${evaluation.totalScore}/100, ` +
                `passed=${evaluation.passed}, decision=${strategicDecision}` +
                (stopReason !== "excellent" && stopReason !== "passed" ? `, will continue...` : `, STOP (${stopReason})`));
            // --- Check termination conditions ---
            if (stopReason === "excellent" || stopReason === "passed")
                break;
            if (stopReason === "stagnation_pivot") {
                // Pivot: 不终止循环，但通知 Generator 下次换个方向
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
        return {
            iterations,
            bestOutput: bestOutput ?? (iterations[0]?.output ?? null),
            finalScore: bestScore > 0 ? bestScore : finalEval.totalScore,
            passed: finalEval.passed || bestScore >= this.criteria.passThreshold,
            excellent: finalEval.excellent || bestScore >= this.criteria.excellenceThreshold,
            totalRounds: iterations.length,
            totalDurationMs: Date.now() - startTime,
            evolutionSummary,
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
            `═══ 上一次评估结果 (Round ${evaluation.round}) ═══`,
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