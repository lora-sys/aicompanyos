/**
 * PiAgentInnerLoopDriver — 基于 pi-agent-core 的 Inner Loop 实现
 *
 * 将 PiAgentLoopEngine 适配为 IInnerLoopEngine 接口。
 * 使用 pi-agent-core 的 agentLoop 驱动 Writer→Critic 迭代。
 */
import { PiAgentLoopEngine, } from "../pi-agent-adapter.js";
export class PiAgentInnerLoopDriver {
    deps;
    config;
    engine = null;
    constructor(deps, config) {
        this.deps = deps;
        this.config = config;
    }
    async run(step, taskInput) {
        const engine = this.getOrCreateEngine(step);
        const piResult = await engine.run(step, taskInput);
        return this.convertResult(piResult);
    }
    setEventForwarder(forwarder) {
        if (this.engine) {
            this.engine.onEvent(forwarder);
        }
        // 缓存 forwarder，后续创建 engine 时连接
        this._pendingForwarder = forwarder;
    }
    _pendingForwarder = null;
    getOrCreateEngine(step) {
        if (this.engine)
            return this.engine;
        const ctx = {
            taskId: step.stepId,
            taskInput: step.description,
            tools: this.deps.toolRegistry,
            llmProvider: this.deps.llmProvider,
        };
        const writer = this.deps.writerFactory(ctx);
        const critic = this.deps.criticFactory(ctx);
        // 适配器包装
        const piWriter = {
            generate: (plan, feedback) => writer.generate(plan, feedback),
        };
        const piCritic = {
            evaluate: (output, criteria, originalTask) => critic.evaluate(output, criteria, originalTask),
        };
        this.engine = new PiAgentLoopEngine({
            writer: piWriter,
            critic: piCritic,
            criteria: this.config.criteria,
            config: {
                maxIterations: this.config.maxIterations,
                enableDegradationGuard: this.config.enableDegradationGuard,
                stagnationThreshold: this.config.stagnationThreshold,
                departmentConfig: this.config.departmentConfig,
                enableCompletionGuard: this.config.enableCompletionGuard,
                acceptanceCriteria: this.config.acceptanceCriteria,
                completionGuardConfig: this.config.completionGuardConfig,
                minQualityScore: this.config.minQualityScore,
                llmProviderFn: this.config.llmProviderFn,
                model: this.deps.model,
                onIterationStart: (iter) => this.config.onIterationStart?.(iter, step.stepId),
                onWriterOutput: (content, iter) => this.config.onWriterOutput?.(content, iter),
                onCriticResult: (score, passed, suggestions, iter) => this.config.onCriticResult?.(score, passed, suggestions, iter),
                onGoalProgress: (verified, total, reason) => this.config.onGoalProgress?.(verified, total, reason),
            },
        });
        // 连接事件转发器
        if (this._pendingForwarder) {
            this.engine.onEvent(this._pendingForwarder);
        }
        return this.engine;
    }
    convertResult(piResult) {
        const iterations = piResult.iterations.map((iter) => ({
            round: iter.iteration,
            output: iter.output,
            evaluation: iter.evaluation,
            stopReason: iter.stopReason,
            durationMs: iter.durationMs,
        }));
        return {
            iterations,
            bestOutput: piResult.bestOutput,
            finalScore: piResult.finalScore,
            passed: piResult.passed,
            excellent: piResult.excellent,
            totalIterations: piResult.totalIterations,
            totalDurationMs: piResult.totalDurationMs,
            goalSnapshot: piResult.goalSnapshot,
            stopCondition: piResult.stopCondition,
            completionProgress: piResult.completionProgress,
        };
    }
}
//# sourceMappingURL=pi-agent-driver.js.map