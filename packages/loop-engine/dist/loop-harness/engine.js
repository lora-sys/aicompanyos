import { ExecutionOrchestrator } from "../orchestrator/engine.js";
import { LoopModule, DEFAULT_WRITING_CRITERIA, } from "../loop-module/index.js";
import { GoalTemplateRegistry } from "../completion-guard/goal-templates.js";
import { getThresholdsForProfile } from "../config/thresholds.js";
// ★ pi-agent-core 集成
import { PiAgentLoopEngine, } from "../pi-agent-adapter.js";
const DEFAULT_CONFIG = {
    maxRewrites: 3,
    qualityThreshold: 85,
    maxReplans: 2,
    enableDegradationGuard: true,
};
// ============================================================
// LoopHarness 核心
// ============================================================
/**
 * Loop Engineering Harness
 *
 * 包装 LoopModule，在 Step 级别实现 Writer-Critic 反馈环。
 * 每个 Writer step 执行后自动触发 Critic 审核，
 * 如果评分不达标则用 Critic 的完整反馈注入 Writer 重写。
 *
 * 所有 Writer-Critic 配对 step 均通过 LoopModule.run() 执行，
 * 非 Writer step（如 ui-ux）仍通过 ExecutionOrchestrator 顺序执行。
 */
export class LoopHarness {
    loopModule = null;
    orchestrator; // 用于非 Writer step 的顺序执行
    config;
    llmProvider;
    toolRegistry;
    // 存储注册的 Agent 工厂（延迟创建 LoopModule）
    writerFactory;
    criticFactory;
    criteria;
    // 当前任务的阈值档位（从 ExecutionPlan.taskProfile 读取）
    currentProfile;
    // 动态 Few-shot 样例（从 Memory 历史数据提取，由 CLI 层注入）
    dynamicExamples;
    // ★ pi-agent-core 引擎实例
    piAgentEngine = null;
    // ★ pi-agent-core 事件转发回调（由 CLI/TUI 层设置）
    piEventForwarder = null;
    constructor(toolRegistry, llmProvider, config) {
        this.toolRegistry = toolRegistry;
        this.llmProvider = llmProvider;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.orchestrator = new ExecutionOrchestrator(toolRegistry);
        // ★ ADR-005: 记录部门配置注入日志
        if (this.config.departmentConfig) {
            console.log(`[LoopHarness] 部门配置已注入: ${this.config.departmentConfig.departmentName} ` +
                `(${this.config.departmentConfig.contentType})`);
        }
        // ★ pi-agent-core 模式日志
        if (this.config.usePiAgentCore) {
            console.log(`[LoopHarness] ★ pi-agent-core 模式已启用 (v0.79.3) — 使用 PiAgentLoopEngine 替代 LoopModule`);
        }
    }
    /** 获取当前配置（只读） */
    getConfig() {
        return this.config;
    }
    /**
     * ★ 获取 pi-agent-core 引擎实例（用于 CLI/TUI 事件订阅）
     *
     * 仅在 usePiAgentCore=true 时有值。
     * 可用于订阅 AgentEvent（agent_start/turn_end/tool_execution_* 等）并转发到 TUI 渲染层。
     */
    getPiAgentEngine() {
        return this.piAgentEngine;
    }
    /**
     * ★ 设置 pi-agent-core 事件转发回调
     *
     * CLI/TUI 层调用此方法注册事件监听器。
     * 当 PiAgentLoopEngine 产生 AgentEvent 时，自动转发到此回调。
     *
     * @example
     * ```ts
     * loopHarness.setPiEventForwarder((event) => {
     *   if (event.type === "turn_end") {
     *     tui.renderIteration(event.message);
     *   }
     * });
     * ```
     */
    setPiEventForwarder(forwarder) {
        this.piEventForwarder = forwarder;
        // 如果引擎已存在，立即连接
        if (this.piAgentEngine) {
            this.piAgentEngine.onEvent(forwarder);
        }
    }
    /**
     * 注册 Agent 工厂
     *
     * writer / critic 类型注册为 IGeneratorAgent / IEvaluatorAgent 工厂 → LoopModule 主路径
     * 其他类型（如 ui-ux）注册为 AgentExecutor 工厂 → ExecutionOrchestrator 顺序执行
     */
    registerAgent(agentType, factory) {
        if (agentType === "writer") {
            this.writerFactory = factory;
        }
        else if (agentType === "critic") {
            this.criticFactory = factory;
        }
        else {
            // 其他 agent 类型（如 ui-ux）→ orchestrator
            this.orchestrator.registerAgent(agentType, factory);
        }
    }
    /**
     * 设置评估标准（GradingCriteria）
     *
     * 必须在使用前调用此方法设置标准。
     * 如果不设置，将使用 DEFAULT_WRITING_CRITERIA。
     */
    setCriteria(criteria) {
        this.criteria = criteria;
    }
    /**
     * 设置动态 Few-shot 样例 (v0.2.0)
     *
     * 由 CLI 层从 Memory 历史数据中提取同类型任务的高/低分评估记录，
     * 注入到 GradingCriteria 中作为额外的校准样例（追加在静态 examples 之后）。
     *
     * @param examples 动态样例数组，每个包含 description / score / reason
     */
    setDynamicExamples(examples) {
        this.dynamicExamples = examples;
    }
    /**
     * ★ ADR-005: 设置部门配置
     *
     * 由 CLI 层在用户选择内容格式后调用。
     * 注入 DepartmentConfig 到 LoopHarness，影响：
     * - extractGoalsForStep(): 部门 GoalTemplate 优先于通用模板
     * - getOrCreateModule(): 部门验收标准和质量门槛注入 LoopModule
     * - executeWithLoop(): OutputPipeline 后处理执行
     */
    setDepartmentConfig(config) {
        this.config.departmentConfig = config;
        console.log(`[LoopHarness] 部门配置已设置: ${config.departmentName} (${config.contentType})`);
    }
    /**
     * ★ ADR-005: 设置输出后处理器回调
     *
     * 由 CLI 层传入，避免 loop-engine 直接依赖 content-production 包。
     * 回调签名与 LoopHarnessConfig.outputProcessor 一致。
     */
    setOutputProcessor(processor) {
        this.config.outputProcessor = processor;
        console.log("[LoopHarness] outputProcessor 已设置");
    }
    /**
     * 检查是否可以使用 LoopModule 主路径
     */
    canUseLoopModule() {
        return !!this.writerFactory && !!this.criticFactory;
    }
    /**
     * 延迟创建/获取 LoopModule 实例
     */
    getOrCreateLoopModule(step) {
        if (this.loopModule) {
            return this.loopModule;
        }
        if (!this.writerFactory || !this.criticFactory) {
            throw new Error("LoopHarness: 无法创建 LoopModule — 未注册 writer 或 critic agent。请先调用 registerAgent('writer', ...) 和 registerAgent('critic', ...)");
        }
        const ctx = {
            taskId: step.stepId,
            taskInput: step.description,
            tools: this.toolRegistry,
            llmProvider: this.llmProvider,
        };
        const generator = this.writerFactory(ctx);
        const evaluator = this.criticFactory(ctx);
        this.loopModule = new LoopModule({
            planner: {
                plan: async (input) => input, // Identity planner: 直接返回 step 作为计划
            },
            generator,
            evaluator,
            criteria: this.buildProfileAwareCriteria(),
            config: {
                maxIterations: this.config.maxRewrites + 1, // +1 因为首次执行也算一轮
                enableDegradationGuard: this.config.enableDegradationGuard,
                enableEvolution: true, // v0.2.0: 启用 SimpleEvolutionAgent 参与Inner Loop决策
                stagnationThreshold: 1, // 连续 1 轮无改善就触发
                useContextReset: true,
                // ★ ADR-004: CompletionGuard 集成
                enableCompletionGuard: true,
                acceptanceCriteria: this.extractGoalsForStep(step),
                completionGuardConfig: {
                    maxEffort: this.config.maxRewrites * 4, // 与 maxRewrites 联动
                    verificationConcurrency: 3,
                    cacheVerifiedGoals: true,
                    // v0.3.1+: 质量门槛门控 — 使用 passThreshold 作为最低质量要求
                    // 解决「仅1轮迭代就停止」的问题：结构目标通过但质量不够时继续迭代
                    minQualityScore: this.currentProfile?.evaluatorPass ?? this.criteria?.passThreshold,
                },
                // ★ P0-2a: LLM Provider 对接 — 包装为 (prompt)=>Promise<string> 用于 LLMAssertionExecutor
                llmProviderFn: this.llmProvider
                    ? (prompt) => this.llmProvider.chat([{ role: "user", content: prompt }])
                    : undefined,
            },
        });
        return this.loopModule;
    }
    /**
     * 构建感知任务档位的 GradingCriteria
     *
     * v0.2.0:
     * - 根据 TaskProfile 覆盖阈值（passThreshold / excellenceThreshold）
     * - 将动态 Few-shot 样例（从 Memory 历史提取）追加到各维度的 examples 中
     * - 保留用户通过 setCriteria() 设置的自定义标准或 DEFAULT_WRITING_CRITERIA 的维度定义
     */
    buildProfileAwareCriteria() {
        const base = this.criteria ?? DEFAULT_WRITING_CRITERIA;
        // 1. 应用 TaskProfile 阈值覆盖
        let result = base;
        if (this.currentProfile) {
            result = {
                ...base,
                passThreshold: this.currentProfile.evaluatorPass,
                excellenceThreshold: this.currentProfile.excellenceStop,
            };
        }
        // 2. 追加动态 Memory 样例到各维度
        if (this.dynamicExamples && this.dynamicExamples.length > 0) {
            result = {
                ...result,
                dimensions: result.dimensions.map((dim) => ({
                    ...dim,
                    examples: [
                        ...(dim.examples ?? []),
                        ...this.dynamicExamples.map((ex) => ({
                            description: ex.description,
                            score: ex.score,
                            reason: ex.reason,
                        })),
                    ],
                })),
            };
        }
        return result;
    }
    // ============================================================
    // 主入口：带循环的 Plan 执行
    // ============================================================
    /**
     * 执行完整计划（带 Inner Loop）
     *
     * 对每个 Writer step（有后续 Critic step 配对）：
     *   → 使用 LoopModule.run() 执行 Generator → Evaluator 循环
     *
     * 非 Writer step（如 ui-ux）：
     *   → 通过 ExecutionOrchestrator 顺序执行
     */
    async executeWithLoop(plan, context, agentContext) {
        const startTime = Date.now();
        const stepResults = [];
        const finalOutputs = {};
        let totalIterations = 0;
        // v0.2.0: 读取任务类型档位，用于阈值自适应选择
        this.currentProfile = getThresholdsForProfile(plan.taskProfile);
        if (plan.taskProfile) {
            console.log(`[LoopHarness] 使用任务档位: ${plan.taskProfile} (${this.currentProfile.label})`);
            console.log(`[LoopHarness] 阈值配置: pass=${this.currentProfile.evaluatorPass}, excellence=${this.currentProfile.excellenceStop}`);
        }
        // 按 step 顺序执行，对 Writer step 启动 Inner Loop
        for (const step of plan.steps) {
            if (step.agentType === "writer") {
                const criticStep = this.findFollowingCriticStep(plan, step);
                if (criticStep) {
                    // Writer + Critic 配对 → LoopModule 主路径
                    if (!this.canUseLoopModule()) {
                        throw new Error(`[LoopHarness] Step "${step.stepId}" 需要 Writer-Critic 反馈环，` +
                            `但未注册 writer 或 critic agent。` +
                            `请调用 registerAgent('writer', ...) 和 registerAgent('critic', ...)。`);
                    }
                    const loopResult = await this.executeWithLoopModule(step, context, finalOutputs, agentContext);
                    stepResults.push(loopResult);
                    totalIterations += loopResult.iterations.length;
                    // 收集最终输出
                    if (loopResult.finalOutput.success) {
                        finalOutputs[loopResult.finalOutput.stepId] = loopResult.finalOutput.output;
                        // 同时写入 critic step 的位置（后续 step 可能引用）
                        finalOutputs[criticStep.stepId] = {
                            content: typeof loopResult.finalOutput.output === "object"
                                ? loopResult.finalOutput.output.content ?? ""
                                : String(loopResult.finalOutput.output),
                            criticScore: loopResult.finalScore,
                            iterations: loopResult.iterations.length,
                        };
                    }
                    console.log(`[LoopHarness] Step "${step.stepId}" 完成: ` +
                        `${loopResult.iterations.length} 轮迭代, ` +
                        `最终 score=${loopResult.finalScore}/100, ` +
                        `passed=${loopResult.passed}` +
                        (loopResult.iterations.length > 1 ? ` (经过 ${loopResult.iterations.length - 1} 次重写)` : ""));
                }
                else {
                    // Writer step 无 Critic 配对 → 顺序执行一次
                    const result = await this.orchestrator.executeStep(step, context, finalOutputs, agentContext);
                    stepResults.push({
                        stepId: step.stepId,
                        iterations: [{
                                round: 1,
                                writerOutput: result,
                                passed: result.success ? "quality_met" : "error",
                                reason: result.success ? "quality_met" : "error",
                                durationMs: result.durationMs,
                            }],
                        finalOutput: result,
                        finalScore: 0,
                        passed: result.success,
                        totalDurationMs: result.durationMs,
                    });
                    if (result.success) {
                        finalOutputs[result.stepId] = result.output;
                    }
                }
            }
            else {
                // 非 Writer step（如 ui-ux）→ 顺序执行
                const result = await this.orchestrator.executeStep(step, context, finalOutputs, agentContext);
                if (result.success) {
                    finalOutputs[result.stepId] = result.output;
                }
            }
        }
        const allPassed = stepResults.every((r) => r.passed);
        // ★ ADR-005: 执行 OutputPipeline（如果部门配置了输出管线）
        let processedOutput;
        if (this.config.departmentConfig?.outputPipeline) {
            try {
                // 优先使用 CLI 层注入的 outputProcessor 回调（避免循环依赖）
                if (this.config.outputProcessor) {
                    const rawContent = this.extractRawContent(finalOutputs);
                    if (rawContent) {
                        processedOutput = await this.config.outputProcessor(rawContent, {
                            rawContent,
                            metadata: {
                                title: this.config.departmentConfig.contentType,
                            },
                            taskId: context.taskId,
                        });
                        console.log(`[LoopHarness] OutputPipeline 完成 (via outputProcessor): ${processedOutput.format}` +
                            (processedOutput.platform ? ` → ${processedOutput.platform}` : "") +
                            ` (${processedOutput.processorLog.length} 个处理器)`);
                    }
                }
                else {
                    console.warn(`[LoopHarness] departmentConfig.outputPipeline 已配置但 outputProcessor 未注入，跳过后处理。` +
                        `请在 CLI 层通过 LoopHarnessConfig.outputProcessor 传入处理函数。`);
                }
            }
            catch (e) {
                // Pipeline 执行失败不阻断主流程
                console.warn(`[LoopHarness] OutputPipeline 执行失败（非阻断）:`, e instanceof Error ? e.message : e);
            }
        }
        return {
            stepResults,
            finalOutputs,
            allPassed,
            totalIterations,
            totalDurationMs: Date.now() - startTime,
            processedOutput,
        };
    }
    // ============================================================
    // LoopModule 主路径
    // ============================================================
    /**
     * 使用 LoopModule 或 PiAgentLoopEngine 执行 Writer → Critic 反馈循环
     *
     * 流程：
     * 1. 检查 usePiAgentCore 配置标志
     * 2. 若启用 → 使用 PiAgentLoopEngine（pi-agent-core 驱动）
     * 3. 否则 → 使用 LoopModule（原有手搓引擎，向后兼容）
     * 4. 将结果统一转换为 StepLoopResult 格式
     */
    async executeWithLoopModule(writerStep, context, previousOutputs, agentContext) {
        const stepStartTime = Date.now();
        // ★ 路由决策：pi-agent-core vs 原有 LoopModule
        if (this.config.usePiAgentCore) {
            console.log(`[LoopHarness] Step "${writerStep.stepId}" 使用 ★ PiAgentLoopEngine 执行 (pi-agent-core)`);
            const piEngine = this.getOrCreatePiAgentEngine(writerStep);
            const piResult = await piEngine.run(writerStep, writerStep.description);
            return this.convertPiResultToStepLoopResult(piResult, writerStep.stepId, stepStartTime);
        }
        // 默认：使用原有 LoopModule
        console.log(`[LoopHarness] Step "${writerStep.stepId}" 使用 LoopModule 执行 (legacy)`);
        const loopModule = this.getOrCreateLoopModule(writerStep);
        const moduleResult = await loopModule.run(writerStep);
        return this.convertToStepLoopResult(moduleResult, writerStep.stepId, stepStartTime);
    }
    /**
     * 将 LoopModuleResult 转换为 StepLoopResult
     */
    convertToStepLoopResult(moduleResult, stepId, stepStartTime) {
        // 转换迭代记录
        const iterations = moduleResult.iterations.map((iter) => {
            // 从 GradingResult 构建 CriticOutputData
            const criticOutput = {
                overallScore: iter.evaluation.totalScore,
                dimensions: Object.fromEntries(iter.evaluation.dimensionScores.map((ds) => [
                    ds.dimensionId,
                    { score: ds.rawScore, comment: ds.comment },
                ])),
                passed: iter.evaluation.passed,
                suggestions: iter.evaluation.suggestions.map((s) => ({
                    type: s.dimensionId,
                    severity: s.severity,
                    description: s.description,
                    suggestion: s.suggestion,
                })),
                reasoning: iter.evaluation.reasoning,
            };
            // 从 output 构建 StepExecutionResult
            const writerOutput = {
                stepId,
                agentType: "writer",
                success: iter.stopReason !== "error",
                output: iter.output ?? {},
                durationMs: iter.durationMs,
            };
            // 映射 stopReason → reason/passed
            const reasonMap = {
                excellent: "quality_met",
                passed: "quality_met",
                max_iterations: "max_rewrites",
                degradation: "degradation",
                stagnation_pivot: "stable_plateau",
                error: "error",
            };
            const reason = reasonMap[iter.stopReason] ?? "continue";
            return {
                round: iter.round,
                writerOutput,
                criticOutput,
                passed: reason,
                reason,
                durationMs: iter.durationMs,
            };
        });
        // 构建最终输出
        const bestOutputRaw = moduleResult.bestOutput;
        const hasContent = bestOutputRaw != null &&
            (typeof bestOutputRaw === "string"
                ? bestOutputRaw.length > 0
                : Object.keys(bestOutputRaw).length > 0);
        const finalOutput = {
            stepId,
            agentType: "writer",
            // ★ 修复：只要有产出内容就标记 success=true（质量是否达标由 scored/passed 字段表达）
            // 旧逻辑：success = moduleResult.passed（导致低分产出被丢弃，OutputPipeline 无法执行）
            success: hasContent || moduleResult.passed,
            output: bestOutputRaw ?? {},
            durationMs: moduleResult.totalDurationMs,
        };
        return {
            stepId,
            iterations,
            finalOutput,
            finalScore: moduleResult.finalScore,
            passed: moduleResult.passed,
            totalDurationMs: Date.now() - stepStartTime,
        };
    }
    // ============================================================
    // ★ PiAgentLoopEngine 路径 (pi-agent-core)
    // ============================================================
    /**
     * 延迟创建/获取 PiAgentLoopEngine 实例
     *
     * 复用已注册的 writer/critic 工厂，
     * 将 IGeneratorAgent/IEvaluatorAgent 适配为 IPiWriterAgent/IPiCriticAgent 接口。
     */
    getOrCreatePiAgentEngine(step) {
        if (this.piAgentEngine) {
            return this.piAgentEngine;
        }
        if (!this.writerFactory || !this.criticFactory) {
            throw new Error("PiAgentLoopEngine: 未注册 writer 或 critic agent。请先调用 registerAgent()");
        }
        const ctx = {
            taskId: step.stepId,
            taskInput: step.description,
            tools: this.toolRegistry,
            llmProvider: this.llmProvider,
        };
        const writer = this.writerFactory(ctx);
        const critic = this.criticFactory(ctx);
        // 适配器包装：IGeneratorAgent → IPiWriterAgent（接口兼容，直接赋值）
        const piWriter = {
            generate: (plan, feedback) => writer.generate(plan, feedback),
        };
        // 适配器包装：IEvaluatorAgent → IPiCriticAgent（接口兼容）
        const piCritic = {
            evaluate: (output, criteria, originalTask) => critic.evaluate(output, criteria, originalTask),
        };
        this.piAgentEngine = new PiAgentLoopEngine({
            writer: piWriter,
            critic: piCritic,
            criteria: this.buildProfileAwareCriteria(),
            config: {
                maxIterations: this.config.maxRewrites + 1,
                enableDegradationGuard: this.config.enableDegradationGuard,
                stagnationThreshold: 1,
                departmentConfig: this.config.departmentConfig,
                // CompletionGuard 集成（与 LoopModule 路径一致）
                enableCompletionGuard: true,
                acceptanceCriteria: this.extractGoalsForStep(step),
                completionGuardConfig: {
                    maxEffort: this.config.maxRewrites * 4,
                    verificationConcurrency: 3,
                    cacheVerifiedGoals: true,
                    minQualityScore: this.currentProfile?.evaluatorPass ?? this.criteria?.passThreshold,
                },
                llmProviderFn: this.llmProvider
                    ? (prompt) => this.llmProvider.chat([{ role: "user", content: prompt }])
                    : undefined,
                // ★ v0.4.0: 执行进度回调（透传 CLI 层的回调）
                onIterationStart: (iter) => this.config.onIterationStart?.(iter, step.stepId),
                onWriterOutput: (content, iter) => this.config.onWriterOutput?.(content, iter),
                onCriticResult: (score, passed, suggestions, iter) => this.config.onCriticResult?.(score, passed, suggestions, iter),
                onGoalProgress: (verified, total, reason) => this.config.onGoalProgress?.(verified, total, reason),
            },
        });
        // ★ 连接事件转发器（如果 CLI 层已设置）
        if (this.piEventForwarder) {
            this.piAgentEngine.onEvent(this.piEventForwarder);
            console.log(`[LoopHarness] PiAgentLoopEngine 事件转发器已连接`);
        }
        console.log(`[LoopHarness] PiAgentLoopEngine 已创建 (pi-agent-core v0.79.3)`);
        return this.piAgentEngine;
    }
    /**
     * 将 PiAgentLoopResult 转换为 StepLoopResult 格式
     *
     * 与 convertToStepLoopResult() 结构一致，确保下游代码无感知。
     */
    convertPiResultToStepLoopResult(piResult, stepId, stepStartTime) {
        // 转换迭代记录
        const iterations = piResult.iterations.map((iter) => {
            const criticOutput = {
                overallScore: iter.evaluation.totalScore,
                dimensions: Object.fromEntries(iter.evaluation.dimensionScores.map((ds) => [
                    ds.dimensionId,
                    { score: ds.rawScore, comment: ds.comment },
                ])),
                passed: iter.evaluation.passed,
                suggestions: iter.evaluation.suggestions.map((s) => ({
                    type: s.dimensionId,
                    severity: s.severity,
                    description: s.description,
                    suggestion: s.suggestion,
                })),
                reasoning: iter.evaluation.reasoning,
            };
            const writerOutput = {
                stepId,
                agentType: "writer",
                success: iter.stopReason !== "error",
                output: iter.output ?? {},
                durationMs: iter.durationMs,
            };
            // PiAgentLoopEngine stopReason → StepLoopIteration reason 映射
            const reasonMap = {
                excellent: "quality_met",
                passed: "quality_met",
                max_iterations: "max_rewrites",
                degradation: "degradation",
                stagnation_pivot: "stable_plateau",
                error: "error",
                goals_verified: "quality_met",
                goals_blocked: "error",
            };
            return {
                round: iter.iteration,
                writerOutput,
                criticOutput,
                passed: reasonMap[iter.stopReason] ?? "continue",
                reason: reasonMap[iter.stopReason] ?? "continue",
                durationMs: iter.durationMs,
            };
        });
        // 构建最终输出
        const bestOutputRaw = piResult.bestOutput;
        const hasContent = bestOutputRaw != null &&
            (typeof bestOutputRaw === "string"
                ? bestOutputRaw.length > 0
                : Object.keys(bestOutputRaw).length > 0);
        const finalOutput = {
            stepId,
            agentType: "writer",
            success: hasContent || piResult.passed,
            output: bestOutputRaw ?? {},
            durationMs: piResult.totalDurationMs,
        };
        console.log(`[LoopHarness] PiAgentLoopEngine 结果: ${piResult.iterations.length} iterations, ` +
            `score=${piResult.finalScore}/100, passed=${piResult.passed}` +
            (piResult._piPowered ? " [pi-powered]" : ""));
        return {
            stepId,
            iterations,
            finalOutput,
            finalScore: piResult.finalScore,
            passed: piResult.passed,
            totalDurationMs: Date.now() - stepStartTime,
        };
    }
    // ============================================================
    // 辅助方法
    // ============================================================
    /**
     * ★ ADR-005: 从 finalOutputs 中提取原始文本内容
     *
     * 用于 OutputPipeline 的输入。
     * 优先提取 content 字段，其次尝试序列化整个 output 对象。
     */
    extractRawContent(finalOutputs) {
        // 遍历所有输出，找到第一个有内容的
        for (const [key, value] of Object.entries(finalOutputs)) {
            if (typeof value === "string" && value.length > 0)
                return value;
            if (value && typeof value === "object") {
                const obj = value;
                if (typeof obj.content === "string" && obj.content.length > 0)
                    return obj.content;
            }
        }
        return undefined;
    }
    /**
     * 查找 Writer step 后紧跟的 Critic step
     */
    findFollowingCriticStep(plan, writerStep) {
        const writerIdx = plan.steps.findIndex((s) => s.stepId === writerStep.stepId);
        if (writerIdx === -1)
            return null;
        // 在 writer step 之后找第一个 critic step
        for (let i = writerIdx + 1; i < plan.steps.length; i++) {
            if (plan.steps[i].agentType === "critic") {
                return plan.steps[i];
            }
        }
        return null;
    }
    /**
     * ★ ADR-004/005: 从 PlanStep 中提取验收目标
     *
     * 数据来源优先级：
     * 1. step.metadata.acceptanceGoals — Planner 显式定义的目标（最高优先）
     * 2. DepartmentConfig.goalTemplates — 部门专属模板（新! 第二优先）
     * 3. GoalTemplateRegistry 自动匹配 — 根据步骤描述自动生成（兜底）
     */
    static goalTemplateRegistry = new GoalTemplateRegistry();
    extractGoalsForStep(step) {
        // 1. 优先从 metadata 读取（最高优先）
        const metadata = step.metadata;
        const metaGoals = metadata?.acceptanceGoals;
        if (metaGoals && Array.isArray(metaGoals) && metaGoals.length > 0) {
            console.log(`[LoopHarness] Step "${step.stepId}": 从 metadata 提取 ${metaGoals.length} 个验收目标`);
            return metaGoals;
        }
        // ★ ADR-005: 2. 检查部门专属 GoalTemplate（第二优先）
        if (this.config.departmentConfig?.goalTemplates && this.config.departmentConfig.goalTemplates.length > 0) {
            for (const template of this.config.departmentConfig.goalTemplates) {
                // 检查 contentType 匹配和关键词匹配
                const lowerDesc = step.description.toLowerCase();
                const contentTypeMatch = template.contentType === "*" ||
                    template.contentType === this.config.departmentConfig.contentType;
                if (contentTypeMatch) {
                    const keywords = template.match?.keywords;
                    const keywordMatch = !keywords || keywords.length === 0 ||
                        keywords.some((kw) => lowerDesc.includes(kw.toLowerCase()));
                    if (keywordMatch) {
                        const deptGoals = template.generate(step.stepId, step.description);
                        if (deptGoals.length > 0) {
                            console.log(`[LoopHarness] Step "${step.stepId}": 部门模板生成 ${deptGoals.length} 个验收目标 ` +
                                `(${deptGoals.map((g) => g.id).join(", ")})`);
                            return deptGoals;
                        }
                    }
                }
            }
        }
        // 3. 兜底 — 使用 GoalTemplateRegistry 内置通用模板
        const templateGoals = LoopHarness.goalTemplateRegistry.generateGoals(step.stepId, step.agentType, step.description);
        if (templateGoals.length > 0) {
            console.log(`[LoopHarness] Step "${step.stepId}": 通用模板自动生成 ${templateGoals.length} 个验收目标 ` +
                `(${templateGoals.map((g) => g.id).join(", ")})`);
        }
        return templateGoals;
    }
}
//# sourceMappingURL=engine.js.map