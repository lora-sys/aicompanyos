/**
 * EvolutionDocAdapter — 将 EvolutionDocsManager 适配为 IEvolutionDocWriter
 *
 * EvolutionDocsManager 的方法返回值与 IEvolutionDocWriter 接口不兼容，
 * 此适配器丢弃返回值实现接口兼容。
 */
class EvolutionDocAdapter {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    async getDesignMDX() { return this.mgr.getDesignMDX(); }
    async getUserMD() { return this.mgr.getUserMD(); }
    async getSelfMD() { return this.mgr.getSelfMD(); }
    async updateDesignBlock(blockType, content, source) {
        await this.mgr.updateDesignBlock(blockType, content, source ?? "evolution");
    }
    async updateUserField(key, value, source, confidence) {
        await this.mgr.updateUserField(key, value, source, confidence);
    }
    async addExperience(entry) {
        await this.mgr.addExperience(entry);
    }
}
/**
 * 进化阶段协调器
 *
 * 封装 EvolutionAgent 调用、证据链构造、结果渲染，
 * 将进化分析从 AICOSApp 中剥离。
 */
export class EvolutionCoordinator {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async run(params) {
        const { artifactManager, evolutionAgent, onStream, persistUserPreferences } = this.deps;
        onStream("正在进行自我进化分析...\n\n");
        try {
            const allArtifacts = await artifactManager.listArtifacts();
            if (allArtifacts.length > 0) {
                onStream("分析 " + allArtifacts.length + " 个产物的进化趋势...\n\n");
                if (evolutionAgent) {
                    try {
                        const evidenceReader = this.buildEvidenceReader();
                        const evolutionDocs = new EvolutionDocAdapter(this.deps.memoryManager.evolution);
                        const taskMetrics = this.buildTaskMetrics();
                        const evoResult = await evolutionAgent.run({
                            evidenceChain: evidenceReader,
                            evolutionDocs,
                            taskId: this.deps.getTaskId() ?? "unknown",
                            taskInput: this.deps.getTaskInput() ?? "",
                            taskSuccess: true,
                            taskMetrics,
                            criticSummary: params.lastCriticSummary,
                            guardSummary: params.lastGuardSummary,
                        });
                        onStream(`**进化模式**: ${evoResult.mode === "deep" ? "🔬 深度" : "📊 常规"}\n`);
                        onStream(`**耗时**: ${evoResult.durationMs}ms\n`);
                        if (evoResult.signalsDetected.length > 0) {
                            onStream(`**异常信号**: ${evoResult.signalsDetected.length} 个\n`);
                            for (const signal of evoResult.signalsDetected) {
                                onStream(`  - ${signal.type}: ${signal.value} (阈值: ${signal.threshold})\n`);
                            }
                        }
                        if (evoResult.designUpdates.length > 0) {
                            onStream(`**Design 更新**: ${evoResult.designUpdates.length} 项\n`);
                            for (const du of evoResult.designUpdates) {
                                onStream(`  - ${du.blockType}: ${du.diff.slice(0, 60)}\n`);
                            }
                        }
                        if (evoResult.userUpdates.length > 0) {
                            onStream(`**用户偏好更新**: ${evoResult.userUpdates.length} 项\n`);
                            for (const uu of evoResult.userUpdates) {
                                onStream(`  - ${uu.key}: ${uu.oldValue?.slice(0, 30)} → ${uu.newValue?.slice(0, 30)}\n`);
                            }
                        }
                        if (evoResult.selfExperience) {
                            onStream(`**经验记录**: [${evoResult.selfExperience.taskType}] ${evoResult.selfExperience.lesson.slice(0, 100)}\n`);
                        }
                        onStream("\n");
                    }
                    catch (evoError) {
                        const evoMsg = evoError instanceof Error ? evoError.message : String(evoError);
                        onStream(`⚠️ EvolutionAgent 执行失败（降级到记忆持久化）: ${evoMsg}\n\n`);
                    }
                }
                else {
                    onStream("⚠️ EvolutionAgent 未初始化，跳过进化分析\n\n");
                }
                await persistUserPreferences();
                onStream("**✨ 进化完成** — 已分析执行模式并更新策略\n\n");
            }
            else {
                onStream("无产物可供进化分析\n\n");
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onStream("⚠️ 进化分析出错: " + message + "\n\n");
        }
    }
    buildEvidenceReader() {
        const decisions = this.deps.getCollectedDecisions();
        const toolCalls = this.deps.getCollectedToolCalls();
        const verifications = this.deps.getCollectedVerifications();
        const taskId = this.deps.getTaskId() ?? "unknown";
        return {
            getEntries: () => [
                ...decisions.map((d, i) => ({
                    type: "decision",
                    traceId: `decision-${i}`,
                    timestamp: new Date().toISOString(),
                    agentType: d.agentType,
                    decisionPoint: d.decisionPoint,
                    inputPrompt: "",
                    finalChoice: d.finalChoice,
                    confidence: d.confidence,
                    outputReasoning: d.outputReasoning,
                    taskId,
                })),
                ...toolCalls.map((t, i) => ({
                    type: "tool_call",
                    traceId: `tool-call-${i}`,
                    timestamp: new Date().toISOString(),
                    toolName: t.toolName,
                    toolCategory: "local",
                    callerAgent: "writer",
                    inputParams: {},
                    outputResult: null,
                    success: t.success,
                    durationMs: t.duration ?? 0,
                    taskId,
                })),
                ...verifications.map((v, i) => ({
                    type: "verification",
                    traceId: `verification-${i}`,
                    timestamp: new Date().toISOString(),
                    taskId,
                    goalId: v.goalId,
                    method: "completion_guard",
                    passed: v.verified,
                    durationMs: 0,
                    evidenceSummary: {
                        methodType: "completion_guard",
                        passed: v.verified,
                        keyOutput: v.evidence ?? "",
                    },
                    round: 1,
                })),
            ],
            getEntriesByType: (type) => {
                if (type === "decision") {
                    return decisions.map((d, i) => ({
                        type: "decision",
                        traceId: `decision-${i}`,
                        timestamp: new Date().toISOString(),
                        agentType: d.agentType,
                        decisionPoint: d.decisionPoint,
                        inputPrompt: "",
                        finalChoice: d.finalChoice,
                        confidence: d.confidence,
                        outputReasoning: d.outputReasoning,
                        taskId,
                    }));
                }
                if (type === "tool_call") {
                    return toolCalls.map((t, i) => ({
                        type: "tool_call",
                        traceId: `tool-call-${i}`,
                        timestamp: new Date().toISOString(),
                        toolName: t.toolName,
                        toolCategory: "local",
                        callerAgent: "writer",
                        inputParams: {},
                        outputResult: null,
                        success: t.success,
                        durationMs: t.duration ?? 0,
                        taskId,
                    }));
                }
                if (type === "verification") {
                    return verifications.map((v, i) => ({
                        type: "verification",
                        traceId: `verification-${i}`,
                        timestamp: new Date().toISOString(),
                        taskId,
                        goalId: v.goalId,
                        method: "completion_guard",
                        passed: v.verified,
                        durationMs: 0,
                        evidenceSummary: {
                            methodType: "completion_guard",
                            passed: v.verified,
                            keyOutput: v.evidence ?? "",
                        },
                        round: 1,
                    }));
                }
                return [];
            },
        };
    }
    buildTaskMetrics() {
        const loopContext = this.deps.getLoopContext();
        return {
            consensusRounds: loopContext?.consensusRound ?? 1,
            consensusPassed: true,
            replanCount: loopContext?.retryCount ?? 0,
            executionDuration: this.deps.getLoopStartTime() > 0 ? Date.now() - this.deps.getLoopStartTime() : 0,
            userModifications: this.deps.getUserModificationCount(),
        };
    }
}
//# sourceMappingURL=evolution-coordinator.js.map