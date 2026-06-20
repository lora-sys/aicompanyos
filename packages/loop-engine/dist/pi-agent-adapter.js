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
import { runAgentLoop } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { DEFAULT_WRITING_CRITERIA, } from "./loop-module/grading-criteria.js";
import { CompletionGuard } from "./completion-guard/guard.js";
import { StopPolicy, isSignificantImprovement } from "./stop-policy/policy.js";
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
    // ★ 统一停止策略
    stopPolicy;
    constructor(params) {
        this.writer = params.writer;
        this.critic = params.critic;
        this.criteria = params.criteria ?? DEFAULT_WRITING_CRITERIA;
        this.config = { ...DEFAULT_CONFIG, ...params.config };
        this.stopPolicy = new StopPolicy({
            maxIterations: this.config.maxIterations,
            enableDegradationGuard: this.config.enableDegradationGuard,
            degradationThreshold: 10,
            enableStagnationDetection: true,
            stagnationThreshold: this.config.stagnationThreshold,
            improvementThreshold: 3,
            minQualityScore: this.config.minQualityScore,
        });
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
        // ★ Phase C: 若 caller 提供了 pi-ai Model，则真正使用 agentLoop 驱动
        if (this.config.model) {
            return this.runWithAgentLoop(plan, originalTask);
        }
        return this.runLegacy(plan, originalTask);
    }
    /**
     * 兼容性手搓循环（model 未提供时退回到此路径）
     */
    async runLegacy(plan, originalTask) {
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
            console.log(`[PiAgentLoopEngine] Iteration ${iteration} [legacy]`);
            // ★ 回调：迭代开始
            this.config.onIterationStart?.(iteration);
            try {
                // --- Step 1: Writer 生成 ---
                const feedback = iterations.length > 0
                    ? this.formatFeedback(iterations[iterations.length - 1].evaluation)
                    : undefined;
                const output = await this.writer.generate(plan, feedback);
                iterEvents.push("writer:generated");
                // ★ 回调：Writer 产出 — 优先提取 content 字段（纯 Markdown），而非 JSON.stringify 整个对象
                const outputStr = typeof output === "string"
                    ? output
                    : (output && typeof output === "object" && "content" in output)
                        ? String(output.content)
                        : JSON.stringify(output);
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
                // --- 统一停止决策 ---
                const stopDecision = this.stopPolicy.evaluate({
                    iteration,
                    evaluation,
                    bestScore,
                    lastScore,
                    stagnationCount,
                    guardResult,
                    hasError: false,
                });
                // --- 更新最佳跟踪与停滞计数 ---
                const improvement = isSignificantImprovement(evaluation.totalScore, bestScore, lastScore, this.stopPolicy.getConfig().improvementThreshold);
                let isDegraded = false;
                if (improvement === "new_best") {
                    bestScore = evaluation.totalScore;
                    bestOutput = output;
                    stagnationCount = 0;
                }
                else if (improvement === "improved") {
                    // 显著改善但不创新高，停滞计数不增加
                }
                else {
                    stagnationCount++;
                    // 退化保护：仅当下降超过阈值时标记
                    if (this.config.enableDegradationGuard && iteration > 1 && lastScore - evaluation.totalScore > this.stopPolicy.getConfig().degradationThreshold) {
                        isDegraded = true;
                        iterEvents.push("degradation");
                    }
                }
                // --- 记录迭代 ---
                const stopReason = isDegraded ? "degradation" : stopDecision.reason;
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
    // Phase C: 真正调用 pi-agent-core 的 agentLoop 驱动迭代
    // ============================================================
    /** agentLoop 驱动模式下的跨 turn 状态 */
    agentLoopState;
    /**
     * 使用 pi-agent-core 的 runAgentLoop 驱动 Writer → Critic 循环。
     *
     * 设计：把 Writer 和 Critic 实现为 AgentTool，由 agentLoop 负责 turn 调度、
     * 事件流和重试；我们在 shouldStopAfterTurn / prepareNextTurn 钩子中
     * 注入 StopPolicy 决策和 Critic feedback。
     */
    async runWithAgentLoop(plan, originalTask) {
        const startTime = Date.now();
        this.agentLoopState = {
            plan,
            originalTask,
            iteration: 0,
            bestScore: -1,
            bestOutput: null,
            lastScore: -1,
            stagnationCount: 0,
            feedback: undefined,
        };
        this.agentLoopIterations = [];
        const writeTool = this.buildWriteTool();
        const evaluateTool = this.buildEvaluateTool();
        const context = {
            systemPrompt: this.buildSystemPrompt() +
                "\n\n## 可用工具\n" +
                "- `write`: 根据当前任务和反馈生成内容。\n" +
                "- `evaluate`: 对最新生成的内容进行 Critic 评估（由系统触发，你不需要主动调用）。\n\n" +
                "## 执行流程\n" +
                "1. 首先调用 `write` 工具生成内容。\n" +
                "2. 系统将自动评估并决定是否继续。\n" +
                "3. 如果需要改进，系统会再次要求你调用 `write`。\n" +
                "请始终使用 `write` 工具生成内容，不要把内容放在回复文本中。",
            messages: [{ role: "user", content: originalTask, timestamp: Date.now() }],
            tools: [writeTool, evaluateTool],
        };
        const config = {
            model: this.config.model,
            convertToLlm: (messages) => messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult"),
            shouldStopAfterTurn: (ctx) => this.agentLoopShouldStop(ctx),
            prepareNextTurn: (ctx) => this.agentLoopPrepareNextTurn(ctx),
            toolExecution: "sequential",
        };
        const emit = (event) => {
            for (const listener of this.eventListeners) {
                listener(event);
            }
            // 从事件中捕获 writer 输出用于展示
            if (event.type === "tool_execution_end" && event.toolName === "write" && !event.isError) {
                const output = this.agentLoopState?.bestOutput;
                if (output) {
                    const content = typeof output === "string" ? output : output.content ?? "";
                    this.config.onWriterOutput?.(String(content).slice(0, 500), this.agentLoopState?.iteration ?? 0);
                }
            }
        };
        try {
            await runAgentLoop([], context, config, emit);
        }
        catch (e) {
            console.error(`[PiAgentLoopEngine] agentLoop 失败:`, e instanceof Error ? e.message : e);
            // 记录一次 error 迭代
            this.agentLoopIterations.push({
                iteration: this.agentLoopState?.iteration ?? 0,
                output: {},
                evaluation: this.emptyEvaluation(this.agentLoopState?.iteration ?? 0),
                strategicDecision: "accept",
                stopReason: "error",
                durationMs: 0,
                events: ["agentLoop_error"],
            });
        }
        // 将 agentLoopState 中的迭代记录转换为 PiAgentIteration（由 tool 回调填充）
        const finalIterations = this.agentLoopIterations;
        const finalEval = finalIterations[finalIterations.length - 1]?.evaluation ?? this.emptyEvaluation(0);
        const bestScore = this.agentLoopState?.bestScore ?? -1;
        const bestOutput = this.agentLoopState?.bestOutput ?? null;
        return {
            iterations: finalIterations,
            bestOutput: bestOutput ?? (finalIterations[0]?.output ?? null),
            finalScore: bestScore > 0 ? bestScore : finalEval.totalScore,
            passed: finalEval.passed || bestScore >= this.criteria.passThreshold,
            excellent: finalEval.excellent || bestScore >= this.criteria.excellenceThreshold,
            totalIterations: finalIterations.length,
            totalDurationMs: Date.now() - startTime,
            _piPowered: true,
        };
    }
    agentLoopIterations = [];
    buildWriteTool() {
        return {
            name: "write",
            label: "生成内容",
            description: "根据任务和反馈生成下一版内容",
            parameters: Type.Object({}),
            execute: async () => {
                const state = this.agentLoopState;
                state.iteration++;
                state.lastEvaluation = undefined; // ★ 每轮生成后重置评估缓存
                state.turnStartMs = Date.now();
                this.config.onIterationStart?.(state.iteration);
                const output = await this.writer.generate(state.plan, state.feedback);
                const content = typeof output === "string" ? output : output.content ?? "";
                state.bestOutput = output;
                this.config.onWriterOutput?.(String(content).slice(0, 500), state.iteration);
                return {
                    content: [{ type: "text", text: String(content) }],
                    details: output,
                };
            },
        };
    }
    buildEvaluateTool() {
        return {
            name: "evaluate",
            label: "评估内容",
            description: "对最新生成的内容进行 Critic 评估",
            parameters: Type.Object({}),
            execute: async () => {
                const state = this.agentLoopState;
                const output = state.bestOutput;
                const evaluation = await this.critic.evaluate(output, this.criteria, state.originalTask);
                state.lastEvaluation = evaluation;
                this.config.onCriticResult?.(evaluation.totalScore, evaluation.passed, evaluation.suggestions.map((s) => s.description), state.iteration);
                return {
                    content: [{ type: "text", text: `Score: ${evaluation.totalScore}/100, passed: ${evaluation.passed}` }],
                    details: evaluation,
                };
            },
        };
    }
    async agentLoopShouldStop(ctx) {
        const state = this.agentLoopState;
        // 只有 write tool 执行完才进行评估
        const wrote = ctx.toolResults.some((r) => r.toolName === "write");
        if (!wrote)
            return false;
        const output = state.bestOutput;
        if (!output)
            return false;
        // 若还没有评估过，先执行一次 Critic 评估
        let evaluation = state.lastEvaluation;
        if (!evaluation) {
            evaluation = await this.critic.evaluate(output, this.criteria, state.originalTask);
            state.lastEvaluation = evaluation;
            this.config.onCriticResult?.(evaluation.totalScore, evaluation.passed, evaluation.suggestions.map((s) => s.description), state.iteration);
        }
        // CompletionGuard 检查
        let guardResult = null;
        if (this.completionGuard) {
            try {
                this.completionGuard.setQualityScore(evaluation.totalScore);
                guardResult = await this.completionGuard.check(output);
                state.lastGuardResult = guardResult;
                if (guardResult.progress) {
                    this.config.onGoalProgress?.(guardResult.progress.verified, guardResult.progress.total, guardResult.stopCondition?.reason ?? "continue");
                }
            }
            catch (e) {
                console.warn(`[PiAgentLoopEngine] CompletionGuard 异常:`, e instanceof Error ? e.message : e);
            }
        }
        // StopPolicy 决策
        const stopDecision = this.stopPolicy.evaluate({
            iteration: state.iteration,
            evaluation,
            bestScore: state.bestScore,
            lastScore: state.lastScore,
            stagnationCount: state.stagnationCount,
            guardResult,
            hasError: false,
        });
        // 更新最佳跟踪
        const improvement = isSignificantImprovement(evaluation.totalScore, state.bestScore, state.lastScore, this.stopPolicy.getConfig().improvementThreshold);
        let isDegraded = false;
        if (improvement === "new_best") {
            state.bestScore = evaluation.totalScore;
            state.bestOutput = output;
            state.stagnationCount = 0;
        }
        else if (improvement === "improved") {
            // 不增加停滞
        }
        else {
            state.stagnationCount++;
            if (this.config.enableDegradationGuard && state.iteration > 1 && state.lastScore - evaluation.totalScore > this.stopPolicy.getConfig().degradationThreshold) {
                isDegraded = true;
            }
        }
        state.lastScore = evaluation.totalScore;
        const stopReason = isDegraded ? "degradation" : stopDecision.reason;
        this.agentLoopIterations.push({
            iteration: state.iteration,
            output,
            evaluation,
            strategicDecision: this.makeStrategicDecision(evaluation, this.agentLoopIterations, state.iteration),
            stopReason,
            durationMs: state.turnStartMs ? Date.now() - state.turnStartMs : 0,
            events: [`agentLoop_turn_${state.iteration}`],
        });
        if (stopReason !== "continue") {
            // 清理反馈，避免下一循环继续使用
            state.feedback = undefined;
            state.lastEvaluation = undefined;
            state.lastGuardResult = null;
        }
        return stopReason !== "continue";
    }
    agentLoopPrepareNextTurn(ctx) {
        const state = this.agentLoopState;
        if (state.lastEvaluation) {
            state.feedback = this.formatFeedback(state.lastEvaluation);
            // 注入 feedback 作为用户消息，要求 LLM 继续调用 write tool
            return {
                context: {
                    ...ctx.context,
                    messages: [
                        ...ctx.context.messages,
                        { role: "user", content: `请根据以下反馈改进内容，然后再次调用 write 工具生成新版本。\n\n${state.feedback}`, timestamp: Date.now() },
                    ],
                },
            };
        }
        return undefined;
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
    /** 统一停止条件判断（由 StopPolicy 决定） */
    shouldStop(iterations, _bestScore, _lastScore, currentIteration) {
        if (currentIteration === 0)
            return false;
        const lastIter = iterations[iterations.length - 1];
        if (!lastIter)
            return false;
        const stopped = lastIter.stopReason !== "continue";
        if (stopped) {
            console.log(`[PiAgentLoopEngine] shouldStop() → StopPolicy 触发停止: ${lastIter.stopReason}`);
        }
        return stopped;
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