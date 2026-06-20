import { ExecutionOrchestrator } from "../orchestrator/engine.js";
import { DEFAULT_WRITING_CRITERIA, } from "../loop-module/index.js";
import { GoalTemplateRegistry } from "../completion-guard/goal-templates.js";
import { getThresholdsForProfile } from "../config/thresholds.js";
import { LegacyInnerLoopDriver } from "./legacy-driver.js";
import { PiAgentInnerLoopDriver } from "./pi-agent-driver.js";
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
 * 通过 IInnerLoopEngine 接口委托 Inner Loop 执行。
 * 每个 Writer step 执行后自动触发 Critic 审核，
 * 如果评分不达标则用 Critic 的完整反馈注入 Writer 重写。
 *
 * Writer-Critic 配对 step 通过 IInnerLoopEngine 执行，
 * 非 Writer step（如 ui-ux）通过 ExecutionOrchestrator 顺序执行。
 */
export class LoopHarness {
    innerLoopEngine = null;
    orchestrator; // 用于非 Writer step 的顺序执行
    config;
    llmProvider;
    toolRegistry;
    // 存储注册的 Agent 工厂（延迟创建 InnerLoopEngine）
    writerFactory;
    criticFactory;
    criteria;
    // 当前任务的阈值档位（从 ExecutionPlan.taskProfile 读取）
    currentProfile;
    // 动态 Few-shot 样例（从 Memory 历史数据提取，由 CLI 层注入）
    dynamicExamples;
    // HistoryReader 注入的历史上下文前缀（由 CLI 层通过 setPromptPrefix 注入）
    promptPrefix;
    // ★ P0 防漂移：用户原始任务输入（由 executeWithLoop 存储，注入 Writer prompt）
    originalTaskInput;
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
        // ★ v0.5.0: 统一 Inner Loop 引擎日志
        if (this.config.usePiAgentCore) {
            console.log(`[LoopHarness] ★ pi-agent-core 驱动模式已启用 — 使用 PiAgentInnerLoopDriver`);
        }
    }
    /** 获取当前配置（只读） */
    getConfig() {
        return this.config;
    }
    /**
     * ★ 设置 pi-agent-core 事件转发回调
     */
    setPiEventForwarder(forwarder) {
        if (this.innerLoopEngine?.setEventForwarder) {
            this.innerLoopEngine.setEventForwarder(forwarder);
        }
        // 缓存，后续创建 engine 时连接
        this._pendingEventForwarder = forwarder;
    }
    _pendingEventForwarder = null;
    /**
     * 注册 Agent 工厂
     *
     * writer / critic 类型注册为 Inner Loop 的 Writer/Critic 工厂
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
     * 设置历史上下文前缀（由 HistoryReader 生成）
     *
     * 前缀会在每轮 Writer 调用前自动拼接到任务描述中，
     * 使 Writer 能够参考历史经验和能力画像进行创作。
     *
     * @param prefix HistoryReader.buildPromptPrefix() 生成的前缀文本
     */
    setPromptPrefix(prefix) {
        this.promptPrefix = prefix;
        if (prefix) {
            console.log(`[LoopHarness] 历史上下文前缀已注入 (${prefix.length} 字符)`);
        }
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
     * 检查是否可以使用 Inner Loop 引擎
     */
    canUseInnerLoopEngine() {
        return !!this.writerFactory && !!this.criticFactory;
    }
    /**
     * 延迟创建/获取 IInnerLoopEngine 实例
     *
     * 根据 usePiAgentCore 配置选择：
     * - true → PiAgentInnerLoopDriver（pi-agent-core 驱动）
     * - false → LegacyInnerLoopDriver（原有手搓循环）
     */
    getOrCreateInnerLoopEngine(step) {
        if (this.innerLoopEngine)
            return this.innerLoopEngine;
        if (!this.writerFactory || !this.criticFactory) {
            throw new Error("LoopHarness: 无法创建 Inner Loop 引擎 — 未注册 writer 或 critic agent。请先调用 registerAgent('writer', ...) 和 registerAgent('critic', ...)");
        }
        const innerLoopConfig = {
            maxIterations: this.config.maxRewrites + 1,
            enableDegradationGuard: this.config.enableDegradationGuard,
            stagnationThreshold: 1,
            criteria: this.buildProfileAwareCriteria(),
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
            departmentConfig: this.config.departmentConfig,
            onIterationStart: this.config.onIterationStart,
            onWriterOutput: this.config.onWriterOutput,
            onCriticResult: this.config.onCriticResult,
            onGoalProgress: this.config.onGoalProgress,
        };
        const sharedDeps = {
            writerFactory: this.writerFactory,
            criticFactory: this.criticFactory,
            toolRegistry: this.toolRegistry,
            llmProvider: this.llmProvider,
        };
        if (this.config.usePiAgentCore) {
            this.innerLoopEngine = new PiAgentInnerLoopDriver({ ...sharedDeps, model: this.config.model }, innerLoopConfig);
            console.log(`[LoopHarness] PiAgentInnerLoopDriver 已创建 (pi-agent-core)`);
        }
        else {
            this.innerLoopEngine = new LegacyInnerLoopDriver(sharedDeps, innerLoopConfig);
            console.log(`[LoopHarness] LegacyInnerLoopDriver 已创建 (legacy)`);
        }
        // 连接事件转发器
        if (this._pendingEventForwarder && this.innerLoopEngine.setEventForwarder) {
            this.innerLoopEngine.setEventForwarder(this._pendingEventForwarder);
        }
        return this.innerLoopEngine;
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
     *   → 使用 IInnerLoopEngine.run() 执行 Generator → Evaluator 循环
     *
     * 非 Writer step（如 ui-ux）：
     *   → 通过 ExecutionOrchestrator 顺序执行
     */
    async executeWithLoop(plan, context, agentContext) {
        // ★ P0 防漂移：存储原始任务输入，供 Writer 锚定主题
        this.originalTaskInput = context.taskInput;
        const startTime = Date.now();
        const stepResults = [];
        const finalOutputs = {};
        let totalIterations = 0;
        // v0.2.0: 读取任务类型档位，用于阈值自适应选择
        // 优先使用 plan.taskProfile，fallback 到部门配置的 thresholdProfile
        const profileKey = plan.taskProfile ?? this.config.departmentConfig?.thresholdProfile;
        this.currentProfile = getThresholdsForProfile(profileKey);
        if (profileKey) {
            console.log(`[LoopHarness] 使用任务档位: ${profileKey} (${this.currentProfile.label})`);
            console.log(`[LoopHarness] 阈值配置: pass=${this.currentProfile.evaluatorPass}, excellence=${this.currentProfile.excellenceStop}`);
        }
        // 按 step 顺序执行，对 Writer step 启动 Inner Loop
        for (const step of plan.steps) {
            if (step.agentType === "writer") {
                const criticStep = this.findFollowingCriticStep(plan, step);
                if (criticStep) {
                    // Writer + Critic 配对 → IInnerLoopEngine 主路径
                    if (!this.canUseInnerLoopEngine()) {
                        throw new Error(`[LoopHarness] Step "${step.stepId}" 需要 Writer-Critic 反馈环，` +
                            `但未注册 writer 或 critic agent。` +
                            `请调用 registerAgent('writer', ...) 和 registerAgent('critic', ...)。`);
                    }
                    const loopResult = await this.executeWithInnerLoopEngine(step, context, finalOutputs);
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
                    console.warn(`[LoopHarness] departmentConfig.outputPipeline 已配置但 outputProcessor 未注入，跳过后处理。`);
                }
            }
            catch (e) {
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
    // IInnerLoopEngine 主路径
    // ============================================================
    /**
     * 使用 IInnerLoopEngine 执行 Writer → Critic 反馈循环
     *
     * 统一入口：不再区分 LoopModule / PiAgentLoopEngine，
     * 由 getOrCreateInnerLoopEngine() 根据配置选择 driver。
     */
    async executeWithInnerLoopEngine(writerStep, context, previousOutputs) {
        const stepStartTime = Date.now();
        const engine = this.getOrCreateInnerLoopEngine(writerStep);
        // ★ P0 防漂移：将用户原始任务注入 step description，确保 Writer 能看到真实意图
        // 问题根因：PlanEngine LLM 可能在 step.description 中加入自己的解读（如 cursor → cursor AI）
        // 修复：将原始用户输入作为最高优先级锚点焊入 description 顶部
        let enhancedDescription = writerStep.description;
        if (this.originalTaskInput && this.originalTaskInput.trim().length > 0
            && !writerStep.description.includes('[ORIGINAL_USER_TASK]')) {
            enhancedDescription =
                `[ORIGINAL_USER_TASK] 用户的原始任务（最高优先级，不可偏离）：${this.originalTaskInput.trim()}\n` +
                    `[STEP_DESCRIPTION] 执行建议：${writerStep.description}`;
        }
        // 构建完整任务输入：历史前缀 + 增强后的描述
        const taskInput = this.promptPrefix
            ? `${this.promptPrefix}\n\n---\n\n${enhancedDescription}`
            : enhancedDescription;
        const innerResult = await engine.run(writerStep, taskInput);
        return this.convertInnerLoopResult(innerResult, writerStep.stepId, stepStartTime);
    }
    /**
     * 将统一的 InnerLoopResult 转换为 StepLoopResult
     */
    convertInnerLoopResult(innerResult, stepId, stepStartTime) {
        // 转换迭代记录
        const iterations = innerResult.iterations.map((iter) => {
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
            // 统一 stopReason → reason/passed 映射
            const reasonMap = {
                continue: "continue",
                excellent: "quality_met",
                passed: "quality_met",
                max_iterations: "max_rewrites",
                effort_exceeded: "max_rewrites",
                degradation: "degradation",
                stagnation_pivot: "stable_plateau",
                goals_verified: "quality_met",
                goals_blocked: "error",
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
        const bestOutputRaw = innerResult.bestOutput;
        const hasContent = bestOutputRaw != null &&
            (typeof bestOutputRaw === "string"
                ? bestOutputRaw.length > 0
                : Object.keys(bestOutputRaw).length > 0);
        const finalOutput = {
            stepId,
            agentType: "writer",
            success: hasContent || innerResult.passed,
            output: bestOutputRaw ?? {},
            durationMs: innerResult.totalDurationMs,
        };
        return {
            stepId,
            iterations,
            finalOutput,
            finalScore: innerResult.finalScore,
            passed: innerResult.passed,
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
                const contentTypeMatch = template.match.contentType === "*" ||
                    template.match.contentType === this.config.departmentConfig.contentType;
                if (contentTypeMatch) {
                    const keywords = template.match.keywords;
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