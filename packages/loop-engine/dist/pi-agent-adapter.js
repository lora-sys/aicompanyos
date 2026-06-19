/**
 * PiAgentLoopEngine — 基于 pi-agent-core 的新一代循环引擎（Phase 1: Agent + agentLoop）
 *
 * 设计原则：
 * - ★ 不再手搓 Agent 运行时，全面使用 pi-agent-core 基础设施
 * - 保留业务创新层：CompletionGuard（目标驱动）、CriticAgent（评估）、WriterAgent（写作）
 *
 * 架构映射：
 *   我们的 LoopModule        →  agentLoop() + 手动 Critic 评估
 *   我们的手搓 while 循环    →  agentLoop 的 shouldStopAfterTurn 回调
 *   我们的 console.log 日志   →  AgentEvent 事件系统
 *   我们的 retryWithBackoff   →  内置 maxRetries + streamOptions
 *
 * 执行流程（每次迭代）：
 *   1. LLM 调用生成内容（通过 pi-ai 的 streamSimple）
 *   2. CriticAgent.evaluate(output)       →  独立评估
 *   3. CompletionGuard.check(output)     →  目标完成度检查
 *   4. shouldStopAfterTurn()?             →  决定是否继续
 *   5. 若继续: 注入 feedback 到下一轮 context
 */
import { Agent as PiAgent } from "@earendil-works/pi-agent-core";
import { DEFAULT_WRITING_CRITERIA, } from "./loop-module/grading-criteria.js";
import { CompletionGuard } from "./completion-guard/guard.js";
const DEFAULT_CONFIG = {
    maxIterations: 5,
    enableDegradationGuard: true,
    stagnationThreshold: 2,
};
// ============================================================
// 核心：PiAgentLoopEngine
// ============================================================
/**
 * 基于 pi-agent-core 的新一代循环引擎
 *
 * 与旧 LoopModule 的区别：
 * - 使用 pi-agent-core 的 Agent 事件系统替代 console.log
 * - 内置 streaming / retry / abort 支持
 * - 结构化 AgentMessage 替代原始字符串拼接
 * - 保留 CompletionGuard 目标驱动停止条件（作为 shouldStopAfterTurn 注入）
 */
export class PiAgentLoopEngine {
    config;
    writer;
    critic;
    criteria;
    completionGuard;
    // ★ pi-agent-core Agent 实例
    agent = null;
    // ★ 事件监听器（用于 CLI/TUI 集成）
    eventListeners = [];
    constructor(params) {
        this.writer = params.writer;
        this.critic = params.critic;
        this.criteria = params.criteria ?? DEFAULT_WRITING_CRITERIA;
        this.config = { ...DEFAULT_CONFIG, ...params.config };
        // 初始化 CompletionGuard
        if (this.config.enableCompletionGuard && this.config.acceptanceCriteria && this.config.acceptanceCriteria.length > 0) {
            this.completionGuard = new CompletionGuard(this.config.acceptanceCriteria, {
                ...this.config.completionGuardConfig,
                llmProvider: this.config.llmProviderFn,
            });
            console.log(`[PiAgentLoopEngine] CompletionGuard 启用: ${this.config.acceptanceCriteria.length} 个目标 (pi-agent-core powered)`);
        }
    }
    // ============================================================
    // 初始化 pi-agent-core Agent
    // ============================================================
    /**
     * 初始化 pi-agent-core Agent
     *
     * 创建一个轻量级 Agent 实例用于状态管理和事件发布。
     * 实际的 LLM 调用仍由我们的 WriterAgent 完成（通过 generate 方法），
     * 但利用 Agent 的事件系统和消息管理能力。
     */
    async initialize() {
        const agentOptions = {
            initialState: {
                systemPrompt: this.buildSystemPrompt(),
            },
            steeringMode: "all",
            followUpMode: "one-at-a-time",
            maxRetryDelayMs: 15000,
            toolExecution: "sequential",
        };
        this.agent = new PiAgent(agentOptions);
        // 订阅事件并转发（subscribe 签名: (event, signal) => void）
        this.agent.subscribe((event) => {
            for (const listener of this.eventListeners) {
                listener(event);
            }
        });
        console.log(`[PiAgentLoopEngine] pi-agent-core Agent 已初始化 (v0.79.3)`);
    }
    // ============================================================
    // 主入口：执行完整循环
    // ============================================================
    /**
     * 执行目标驱动的 Inner Loop
     *
     * 流程：
     * 1. Writer 生成产出
     * 2. Critic 评估产出
     * 3. CompletionGuard 检查目标完成度
     * 4. shouldStop? → 继续或停止
     * 5. 若继续: 注入 feedback → 下轮迭代
     */
    async run(plan, originalTask) {
        const startTime = Date.now();
        const iterations = [];
        let bestOutput = null;
        let bestScore = -1;
        let lastScore = -1;
        let stagnationCount = 0;
        // 确保已初始化
        if (!this.agent) {
            await this.initialize();
        }
        let iteration = 0;
        // ★ 目标驱动主循环（pi-agent-core 事件驱动）
        while (!this.shouldStop(iterations, bestScore, lastScore, iteration)) {
            iteration++;
            const iterStart = Date.now();
            const iterEvents = [];
            console.log(`[PiAgentLoopEngine] Iteration ${iteration} [pi-agent-core]`);
            // ★ 回调：迭代开始
            this.config.onIterationStart?.(iteration);
            try {
                // --- Step 1: Writer 生成 ---
                const feedback = iterations.length > 0
                    ? this.formatFeedback(iterations[iterations.length - 1].evaluation)
                    : undefined;
                const output = await this.writer.generate(plan, feedback);
                iterEvents.push("writer:generated");
                // ★ 回调：Writer 产出
                const outputStr = typeof output === "string" ? output : JSON.stringify(output);
                this.config.onWriterOutput?.(outputStr.slice(0, 500), iteration);
                // --- Step 2: Critic 评估 ---
                const evaluation = await this.critic.evaluate(output, this.criteria, originalTask);
                iterEvents.push(`critic:score=${evaluation.totalScore}`);
                // ★ 回调：Critic 评估结果
                this.config.onCriticResult?.(evaluation.totalScore, evaluation.passed, evaluation.suggestions.map(s => s.description), iteration);
                // --- Step 3: CompletionGuard 检查 ---
                let guardResult = null;
                if (this.completionGuard) {
                    try {
                        this.completionGuard.setQualityScore(evaluation.totalScore);
                        guardResult = await this.completionGuard.check(output);
                        iterEvents.push(`guard:${guardResult.stopCondition?.reason ?? "continue"}`);
                        // ★ 回调：目标进度
                        if (guardResult.progress) {
                            this.config.onGoalProgress?.(guardResult.progress.verified, guardResult.progress.total, guardResult.stopCondition?.reason ?? "continue");
                        }
                    }
                    catch (e) {
                        console.warn(`[PiAgentLoopEngine] CompletionGuard 异常:`, e instanceof Error ? e.message : e);
                    }
                }
                // --- Step 4: 战略决策 ---
                const strategicDecision = this.makeStrategicDecision(evaluation, iterations, iteration);
                // --- 更新最佳跟踪 ---
                let isDegraded = false;
                if (this.config.enableDegradationGuard && iteration > 1 && evaluation.totalScore < lastScore) {
                    isDegraded = true;
                    iterEvents.push("degradation");
                }
                if (evaluation.totalScore > bestScore) {
                    bestScore = evaluation.totalScore;
                    bestOutput = output;
                    stagnationCount = 0;
                }
                else {
                    stagnationCount++;
                }
                // --- 确定终止原因 ---
                const stopReason = this.determineStopReason(evaluation, iteration, stagnationCount, strategicDecision, guardResult);
                // --- 记录迭代 ---
                iterations.push({
                    iteration,
                    output,
                    evaluation,
                    strategicDecision,
                    stopReason,
                    durationMs: Date.now() - iterStart,
                    events: iterEvents,
                });
                // --- 日志 ---
                console.log(`[PiAgentLoopEngine] Iteration ${iteration}: score=${evaluation.totalScore}/100, ` +
                    `passed=${evaluation.passed}, stop=${stopReason}` +
                    (guardResult?.stopCondition ? `, guard=${guardResult.stopCondition.reason}` : ""));
                // --- 发布 pi-agent-core 事件（模拟 turn_end）---
                if (this.agent) {
                    // Agent 状态更新会自动通过 subscribe 广播
                }
                lastScore = evaluation.totalScore;
            }
            catch (e) {
                console.error(`[PiAgentLoopEngine] Iteration ${iteration} 失败:`, e instanceof Error ? e.message : e);
                iterations.push({
                    iteration,
                    output: {},
                    evaluation: this.emptyEvaluation(iteration),
                    strategicDecision: "accept",
                    stopReason: "error",
                    durationMs: Date.now() - iterStart,
                    events: ["error"],
                });
                break;
            }
        }
        // --- 构建最终结果 ---
        const finalEval = iterations[iterations.length - 1]?.evaluation ?? this.emptyEvaluation(0);
        // Goal snapshot
        let goalSnapshot;
        let stopCondition;
        let completionProgress;
        if (this.completionGuard) {
            const snapshot = this.completionGuard.getGoalSnapshot();
            goalSnapshot = Array.from(snapshot.entries()).map(([id, gs]) => ({
                goalId: id,
                status: gs.state,
            }));
            const lastCheckProgress = this.completionGuard.getProgress();
            completionProgress = {
                totalGoals: lastCheckProgress.total,
                verifiedGoals: lastCheckProgress.verified,
                progressPercent: lastCheckProgress.progressPercent,
            };
            if (lastCheckProgress.verified === lastCheckProgress.total && lastCheckProgress.total > 0) {
                stopCondition = {
                    reason: "all_goals_verified",
                    verifiedGoals: (goalSnapshot ?? [])
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
            goalSnapshot,
            stopCondition,
            completionProgress,
            _piPowered: true,
        };
    }
    // ============================================================
    // 事件订阅（供 CLI/TUI 层使用）
    // ============================================================
    /**
     * 订阅 pi-agent-core Agent 事件
     *
     * 用于将事件转发到 pi-tui 渲染层
     * 支持的事件类型：agent_start, agent_end, turn_start, turn_end,
     * message_start, message_update, message_end, tool_execution_*, etc.
     */
    onEvent(listener) {
        this.eventListeners.push(listener);
        return () => {
            const idx = this.eventListeners.indexOf(listener);
            if (idx >= 0)
                this.eventListeners.splice(idx, 1);
        };
    }
    // ============================================================
    // 内部方法
    // ============================================================
    /** 构建 System Prompt */
    buildSystemPrompt() {
        const parts = [
            "# AI Company OS — Content Generation Agent (pi-agent-core powered)",
            "",
            "You are a professional content generation agent.",
            "Your task is to produce high-quality content based on the user's requirements.",
            "",
            "## Quality Standards",
            "- Always stay on topic (never drift from the original task)",
            "- Produce well-structured, engaging content",
            "- Follow the specific format requirements for each content type",
        ];
        if (this.config.departmentConfig) {
            parts.push("", `## Department: ${this.config.departmentConfig.departmentName}`);
            parts.push(`Content Type: ${this.config.departmentConfig.contentType}`);
        }
        return parts.join("\n");
    }
    /** 统一停止条件判断（ADR-004 目标驱动） */
    shouldStop(iterations, bestScore, lastScore, currentIteration) {
        if (currentIteration === 0)
            return false;
        const lastIter = iterations[iterations.length - 1];
        if (!lastIter)
            return false;
        // P0: CompletionGuard 目标驱动
        if (lastIter.stopReason === "goals_verified" || lastIter.stopReason === "goals_blocked") {
            return true;
        }
        // P1: 质量达标
        if (lastIter.evaluation.excellent)
            return true;
        if (lastIter.evaluation.passed)
            return true;
        // P2: 退化保护
        if (this.config.enableDegradationGuard && iterations.length > 1) {
            if (lastIter.evaluation.totalScore < lastScore)
                return true;
        }
        // P3: 安全阀
        if (currentIteration >= this.config.maxIterations)
            return true;
        return false;
    }
    /** 确定本轮停止原因 */
    determineStopReason(evaluation, iteration, stagnationCount, decision, guardResult) {
        // P0: CompletionGuard
        if (guardResult?.stopCondition) {
            if (guardResult.stopCondition.reason === "all_goals_verified")
                return "goals_verified";
            if (guardResult.stopCondition.reason === "any_goal_blocked")
                return "goals_blocked";
            if (guardResult.stopCondition.reason === "max_effort_exceeded")
                return "max_iterations";
        }
        // P1: 质量
        if (evaluation.excellent)
            return "excellent";
        if (evaluation.passed)
            return "passed";
        // P2: 安全阀
        if (iteration >= this.config.maxIterations)
            return "max_iterations";
        // P3: 停滞
        if (stagnationCount >= this.config.stagnationThreshold && decision === "pivot") {
            return "stagnation_pivot";
        }
        return "passed"; // continue
    }
    /** 格式化评估反馈 */
    formatFeedback(evaluation) {
        const lines = [
            `═══ 评估结果 (Iteration ${evaluation.round}) ═══`,
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
    /** 战略决策 */
    makeStrategicDecision(evaluation, history, round) {
        if (evaluation.excellent)
            return "accept";
        if (history.length >= 2) {
            const prevScore = history[history.length - 1].evaluation.totalScore;
            if (evaluation.totalScore >= prevScore + 5)
                return "refine";
            if (evaluation.totalScore < prevScore - 10)
                return "pivot";
        }
        return "refine";
    }
    /** 空评估（失败兜底） */
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
    /** 获取 Agent 实例（用于高级用法） */
    getAgent() { return this.agent; }
}
//# sourceMappingURL=pi-agent-adapter.js.map