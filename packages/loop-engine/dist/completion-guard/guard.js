/**
 * CompletionGuard — 目标驱动的完成度守护者
 *
 * 核心职责：
 * 1. 管理 AcceptanceGoal[] 的生命周期（pending → verifying → verified/failed/blocked）
 * 2. 每轮迭代后执行验证流水线
 * 3. 根据目标状态产生 StopCondition
 * 4. 将验证证据记录到 EvidenceChain
 *
 * 设计原则：
 * - "目标没完成，就继续；证据不足，就验证；真正阻塞，才停下；完整完成，才交付"
 */
import { DEFAULT_COMPLETION_GUARD_CONFIG } from "./types.js";
import { VerificationPipeline } from "./pipeline.js";
export class CompletionGuard {
    goals;
    config;
    pipeline;
    evidenceChain;
    effortSpent = 0;
    roundCount = 0;
    taskId;
    /** v0.3.1+: 最新质量分数（由 LoopModule 每轮迭代后注入） */
    currentQualityScore;
    constructor(goals, config, evidenceChain, pipeline) {
        this.config = { ...DEFAULT_COMPLETION_GUARD_CONFIG, ...config };
        this.evidenceChain = evidenceChain;
        // 传入 llmProvider 给 Pipeline（用于 LLMAssertionExecutor）
        this.pipeline = pipeline ?? new VerificationPipeline({
            llmProvider: this.config.llmProvider,
        });
        this.taskId = `guard-${Date.now()}`;
        // 初始化所有目标为 pending
        this.goals = new Map(goals.map((g) => [g.id, { state: "pending", goal: g }]));
    }
    // ============================================================
    // 公共 API
    // ============================================================
    /**
     * 执行一轮完整的验证检查
     *
     * 流程：
     * 1. 收集 pending + failed(可重试) 的 goals
     * 2. 按 priority 排序 (critical > major > minor)
     * 3. 并发执行验证
     * 4. 更新目标状态
     * 5. 记录证据到 EvidenceChain
     * 6. 计算 stopCondition
     */
    async check(currentOutput, context) {
        this.roundCount++;
        const startTime = Date.now();
        // 1. 收集需要验证的 goals
        const goalsToVerify = this.getVerifiableGoals();
        if (goalsToVerify.length === 0) {
            // 没有可验证的目标 → 直接判断停止条件
            return {
                checkedGoals: [],
                stopCondition: this.determineStopCondition(),
                evidences: [],
                progress: this.getProgress(),
            };
        }
        // 2. 构建验证上下文
        const ctx = {
            projectRoot: context?.projectRoot ?? process.cwd(),
            outputFiles: context?.outputFiles,
            devServerUrl: context?.devServerUrl,
            env: context?.env,
        };
        // 3. 执行验证
        const previousStates = new Map();
        for (const [id, status] of this.goals) {
            previousStates.set(id, status.state);
        }
        const evidences = [];
        const checkedGoals = [];
        for (const goalStatus of goalsToVerify) {
            const goal = goalStatus.goal;
            const newStatus = await this.verifyGoal(goal, ctx);
            // 更新状态
            this.goals.set(goal.id, newStatus);
            // 收集结果
            checkedGoals.push({
                goalId: goal.id,
                previousStatus: previousStates.get(goal.id) ?? "pending",
                newStatus: newStatus.state,
            });
            if (newStatus.state === "verified" || newStatus.state === "failed") {
                const evidence = newStatus.state === "verified"
                    ? newStatus.evidence
                    : newStatus.evidence;
                if (evidence) {
                    evidences.push({ ...evidence, goalId: goal.id });
                    this.recordEvidence(evidence, goal.id);
                }
            }
        }
        // 4. 计算本轮努力消耗
        this.effortSpent += this.calculateEffort(goalsToVerify);
        // 5. 判断停止条件
        const stopCondition = this.determineStopCondition();
        const progress = this.getProgress();
        console.log(`[CompletionGuard] Round ${this.roundCount}: ` +
            `${progress.verified}/${progress.total} verified (${progress.progressPercent}%), ` +
            `effort=${this.effortSpent}/${this.config.maxEffort}` +
            (stopCondition ? `, STOP(${stopCondition.reason})` : ", continue"));
        return {
            checkedGoals,
            stopCondition: stopCondition ?? null,
            evidences,
            progress,
        };
    }
    /**
     * 仅验证指定的目标（增量验证）
     *
     * 当已知某些目标受本次产出变化影响时使用
     */
    async checkGoals(goalIds, currentOutput, context) {
        // 过滤出有效且需要验证的目标
        const targetGoals = goalIds
            .map((id) => this.goals.get(id))
            .filter((gs) => gs !== undefined &&
            (gs.state === "pending" ||
                (gs.state === "failed" && gs.retryCount < this.config.maxRetriesPerGoal)))
            .map((gs) => ({ ...gs }));
        if (targetGoals.length === 0) {
            return {
                checkedGoals: [],
                stopCondition: this.determineStopCondition(),
                evidences: [],
                progress: this.getProgress(),
            };
        }
        // 复用 check 的核心逻辑，但只针对指定 goals
        // 通过临时替换 goals map 来实现
        const originalGoals = new Map(this.goals);
        // 先将非目标 goals 设为已验证（跳过它们）
        for (const [id, gs] of originalGoals) {
            if (!goalIds.includes(id)) {
                if (gs.state === "pending") {
                    this.goals.set(id, { state: "skipped", goal: gs.goal, reason: "not in target set" });
                }
            }
        }
        const result = await this.check(currentOutput, context);
        // 恢复被跳过的 goals 状态
        for (const [id, gs] of originalGoals) {
            if (!goalIds.includes(id) && this.goals.get(id)?.state === "skipped") {
                this.goals.set(id, gs);
            }
        }
        return result;
    }
    /** 获取当前所有目标状态的只读快照 */
    getGoalSnapshot() {
        return new Map(this.goals);
    }
    /** 获取完成进度摘要 */
    getProgress() {
        let verified = 0, failed = 0, pending = 0, blocked = 0;
        let remainingEffort = 0;
        for (const [, gs] of this.goals) {
            switch (gs.state) {
                case "verified":
                    verified++;
                    break;
                case "failed":
                    failed++;
                    remainingEffort += this.goalWeight(gs.goal);
                    break;
                case "pending":
                    pending++;
                    remainingEffort += this.goalWeight(gs.goal);
                    break;
                case "blocked":
                    blocked++;
                    break;
                case "verifying":
                    pending++; // 正在验证中视为 pending
                    remainingEffort += this.goalWeight(gs.goal);
                    break;
                case "skipped": break; // 跳过的不计入
            }
        }
        const total = verified + failed + pending + blocked;
        return {
            total,
            verified,
            failed,
            pending,
            blocked,
            progressPercent: total > 0 ? Math.round((verified / total) * 100) : 0,
            effortRemaining: Math.max(0, this.config.maxEffort - this.effortSpent - remainingEffort),
        };
    }
    /** 重置指定目标的状态（用于 replan 后重新验证） */
    resetGoals(goalIds) {
        for (const id of goalIds) {
            const current = this.goals.get(id);
            if (current && (current.state === "verified" || current.state === "failed" || current.state === "blocked")) {
                this.goals.set(id, { state: "pending", goal: current.goal });
            }
        }
        console.log(`[CompletionGuard] Reset ${goalIds.length} goals to pending`);
    }
    /** 获取已花费的努力值 */
    getEffortSpent() {
        return this.effortSpent;
    }
    /**
     * v0.3.1+: 设置最新质量分数
     *
     * 由 LoopModule 在每轮 Critic 评估后调用。
     * 当 config.minQualityScore 已设置时，此值会影响 all_goals_verified 的判定。
     *
     * @param score Critic 评估的加权总分 (0-100)
     */
    setQualityScore(score) {
        this.currentQualityScore = score;
    }
    /** 获取当前质量分数（用于调试） */
    getQualityScore() {
        return this.currentQualityScore;
    }
    // ============================================================
    // 内部：验证调度
    // ============================================================
    /**
     * 执行单个目标的验证
     *
     * 按 verifyBy 数组顺序尝试，任一通过即视为通过
     */
    async verifyGoal(goal, ctx) {
        // 标记为验证中
        const verifyingStatus = {
            state: "verifying",
            goal,
            startedAt: new Date(),
        };
        this.goals.set(goal.id, verifyingStatus);
        // 按优先级尝试每种验证方法
        for (const method of goal.verifyBy) {
            try {
                const evidence = await this.pipeline.execute(method, ctx);
                const recordWithGoalId = { ...evidence, goalId: goal.id };
                if (evidence.passed) {
                    return { state: "verified", goal, evidence: recordWithGoalId };
                }
                // 验证失败但不是最后一个方法，继续尝试下一个
                // 记录最后一次失败的证据
                const currentFailed = this.goals.get(goal.id);
                const retryCount = currentFailed?.state === "failed" ? currentFailed.retryCount + 1 : 0;
                // 如果还有更多方法可以尝试，继续
                // 否则返回 failed 状态
                const methodIndex = goal.verifyBy.indexOf(method);
                if (methodIndex < goal.verifyBy.length - 1) {
                    continue; // 尝试下一种验证方法
                }
                // 所有方法都失败了
                if (retryCount >= this.config.maxRetriesPerGoal) {
                    // 超过最大重试次数 → 检查是否应该标记为 blocked
                    const blocker = this.analyzeBlocker(goal, recordWithGoalId);
                    if (blocker && goal.required) {
                        return { state: "blocked", goal, blocker };
                    }
                }
                return {
                    state: "failed",
                    goal,
                    evidence: recordWithGoalId,
                    retryCount,
                };
            }
            catch (error) {
                // 单个验证方法执行异常，尝试下一种
                console.warn(`[CompletionGuard] Goal "${goal.id}" method "${method.type}" threw error:`, error);
                continue;
            }
        }
        // 所有方法都异常或失败
        const currentFailed = this.goals.get(goal.id);
        const retryCount = currentFailed?.state === "failed" ? currentFailed.retryCount + 1 : 0;
        return {
            state: "failed",
            goal,
            evidence: {
                goalId: goal.id,
                method: goal.verifyBy[0]?.type ?? "unknown",
                timestamp: new Date().toISOString(),
                passed: false,
                evidence: {
                    type: "command",
                    command: "[all-methods-failed]",
                    exitCode: -1,
                    stdout: "",
                    stderr: "All verification methods failed or threw errors",
                },
                durationMs: 0,
            },
            retryCount,
        };
    }
    // ============================================================
    // 内部：停止条件判决
    // ============================================================
    /**
     * 计算当前停止条件
     *
     * 优先级：
     * 1. ALL verified     → all_goals_verified (交付)
     * 2. ANY blocked      → any_goal_blocked (阻塞)
     * 3. effort exhausted → max_effort_exceeded (最大努力)
     * 4. 否则             → null (继续)
     */
    determineStopCondition() {
        const verifiedGoals = [];
        const blockedGoals = [];
        const pendingGoals = [];
        const remainingGoals = [];
        for (const [id, gs] of this.goals) {
            switch (gs.state) {
                case "verified":
                    verifiedGoals.push({ goalId: id, evidence: gs.evidence });
                    break;
                case "blocked":
                    blockedGoals.push({ goalId: id, blocker: gs.blocker });
                    break;
                case "pending":
                case "verifying":
                case "failed":
                    pendingGoals.push(id);
                    remainingGoals.push({
                        goalId: id,
                        lastStatus: gs.state,
                        failureSummary: gs.state === "failed" ? gs.evidence?.evidence.type : undefined,
                    });
                    break;
                case "skipped":
                    break; // 跳过的目标不影响停止条件
            }
        }
        // 规则 1: 所有非 skipped 的目标都已 verified → 交付
        // v0.3.1+: 如果配置了 minQualityScore，还需要质量分数达标
        const activeGoals = Array.from(this.goals.values()).filter((gs) => gs.state !== "skipped");
        if (activeGoals.length > 0 && verifiedGoals.length === activeGoals.length) {
            // 质量门控检查
            if (this.config.minQualityScore !== undefined) {
                if (this.currentQualityScore === undefined || this.currentQualityScore < this.config.minQualityScore) {
                    console.log(`[CompletionGuard] 质量未达标: score=${this.currentQualityScore ?? "N/A"}, ` +
                        `threshold=${this.config.minQualityScore} → 继续迭代`);
                    // 结构目标已通过但质量不够 → 不停止，返回 null 继续迭代
                    return null;
                }
                console.log(`[CompletionGuard] ✅ 质量达标: score=${this.currentQualityScore} >= ${this.config.minQualityScore}`);
            }
            return {
                reason: "all_goals_verified",
                verifiedGoals,
                totalRounds: this.roundCount,
                totalDurationMs: 0, // 由外部填充
            };
        }
        // 规则 2: 存在阻塞目标 → 停止并报告
        if (blockedGoals.length > 0) {
            return {
                reason: "any_goal_blocked",
                verifiedGoals,
                blockedGoals,
                pendingGoals,
            };
        }
        // 规则 3: 努力值耗尽 → 在合理位置停下
        if (this.effortSpent >= this.config.maxEffort) {
            return {
                reason: "max_effort_exceeded",
                verifiedGoals,
                remainingGoals,
                effortSpent: this.effortSpent,
                maxEffort: this.config.maxEffort,
            };
        }
        // 规则 4: 还有目标和努力 → 继续迭代
        return null;
    }
    // ============================================================
    // 内部：辅助方法
    // ============================================================
    /** 获取当前可验证的目标列表（按 priority 排序） */
    getVerifiableGoals() {
        const result = [];
        for (const [, gs] of this.goals) {
            if (gs.state === "pending") {
                result.push({ goal: gs.goal, retryCount: 0 });
            }
            else if (gs.state === "failed" &&
                gs.retryCount < this.config.maxRetriesPerGoal) {
                result.push({ goal: gs.goal, retryCount: gs.retryCount });
            }
            // verified / blocked / skipped 不再验证
            // （除非 cacheVerifiedGoals=false 且产出变化了 — 未来支持）
        }
        // 按 priority 排序: critical > major > minor
        const priorityOrder = { critical: 0, major: 1, minor: 2 };
        result.sort((a, b) => (priorityOrder[a.goal.priority] ?? 3) - (priorityOrder[b.goal.priority] ?? 3));
        return result;
    }
    /** 计算目标的权重（用于 effort 计算） */
    goalWeight(goal) {
        switch (goal.priority) {
            case "critical": return 3;
            case "major": return 2;
            case "minor": return 1;
            default: return 1;
        }
    }
    /** 计算一轮验证消耗的努力值 */
    calculateEffort(verifiedGoals) {
        return verifiedGoals.reduce((sum, vg) => sum + this.goalWeight(vg.goal), 0);
    }
    /**
     * 分析失败是否构成阻塞
     *
     * 简单启发式：
     * - command 执行返回特定错误码（如依赖缺失 ENOENT）
     * - 连续多次失败且错误信息相同
     */
    analyzeBlocker(_goal, evidence) {
        const cmdEvidence = evidence.evidence;
        if (cmdEvidence.type === "command") {
            const stderr = cmdEvidence.stderr.toLowerCase();
            if (stderr.includes("command not found") || stderr.includes("enoent")) {
                return {
                    category: "missing_dependency",
                    description: `Required command/tool not found: ${cmdEvidence.command}`,
                    suggestedAction: `Install missing dependency and retry`,
                };
            }
            if (stderr.includes("eacces") || stderr.includes("permission")) {
                return {
                    category: "environment",
                    description: `Permission denied executing: ${cmdEvidence.command}`,
                    suggestedAction: `Check file permissions`,
                };
            }
        }
        // 默认不视为阻塞（让重试机制处理）
        return null;
    }
    /** 记录验证证据到 EvidenceChain */
    recordEvidence(evidence, _goalId) {
        if (!this.evidenceChain?.verifications)
            return;
        try {
            // 提取关键输出作为摘要
            let keyOutput = "";
            const ev = evidence.evidence;
            switch (ev.type) {
                case "command":
                    keyOutput = `exitCode=${ev.exitCode}, stdout=${ev.stdout.slice(0, 100)}`;
                    break;
                case "test":
                    keyOutput = `${ev.passedTests}/${ev.totalTests} passed`;
                    break;
                case "lint":
                    keyOutput = `${ev.errors} errors, ${ev.warnings} warnings`;
                    break;
                default:
                    keyOutput = ev.type;
            }
            this.evidenceChain.verifications.record({
                goalId: evidence.goalId,
                method: evidence.method,
                passed: evidence.passed,
                durationMs: evidence.durationMs,
                evidenceSummary: {
                    methodType: ev.type,
                    passed: evidence.passed,
                    keyOutput,
                },
                round: this.roundCount,
                taskId: this.taskId,
            });
        }
        catch (err) {
            // Evidence chain 记录失败不应阻断主流程
            console.warn("[CompletionGuard] Failed to record evidence:", err);
        }
    }
}
//# sourceMappingURL=guard.js.map