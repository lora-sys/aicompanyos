import { HistoryReader } from "@aicos/loop-engine";
/**
 * 执行阶段协调器
 *
 * 封装 LoopHarness 调用、产物持久化、后处理管线，
 * 并生成供进化阶段使用的 Critic/Guard 摘要。
 */
export class ExecutionCoordinator {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async run(plan) {
        const { artifactManager, memoryManager, loopHarness, onLog, onStream, getTaskId, getTaskInput, getLoopContext, injectMemoryExamples } = this.deps;
        onLog("info", "execute", "正在执行计划（LoopHarness → LoopModule）...");
        // ★ 清理旧产物，确保验证引擎只看到当前任务的产物
        try {
            await artifactManager.clearArtifacts();
            onLog("info", "execute", "已清理旧产物");
        }
        catch {
            // 非致命：清理失败不阻塞执行
        }
        if (!plan || plan.steps.length === 0) {
            onLog("warn", "execute", "无计划步骤，跳过执行");
            throw new Error("无计划步骤");
        }
        const loopContext = getLoopContext();
        if (!loopContext) {
            onLog("error", "execute", "LoopContext 未初始化");
            throw new Error("LoopContext 未初始化");
        }
        // 初始化任务记忆（创建任务记录 + 确保 memory/ 目录存在）
        const taskId = getTaskId() ?? `task-${Date.now()}`;
        try {
            await memoryManager.initializeForTask(taskId, getTaskInput() ?? "");
            onLog("info", "memory", `任务记忆已初始化: ${taskId}`);
        }
        catch (e) {
            onLog("warn", "memory", `记忆初始化失败（非致命）: ${e instanceof Error ? e.message : e}`);
        }
        // v0.2.0: 从 Memory 历史数据提取 Few-shot 样例 → 注入 LoopHarness
        await injectMemoryExamples(plan);
        // ★ HistoryReader: 构建历史上下文前缀 → 注入 LoopHarness
        try {
            const historyReader = new HistoryReader(() => memoryManager.evolution.getSelfMD(), () => memoryManager.evolution.getUserMD());
            const contentType = loopHarness.getConfig().departmentConfig?.contentType;
            const historyResult = await historyReader.buildPromptPrefix(getTaskInput(), { contentType });
            if (historyResult.promptPrefix) {
                loopHarness.setPromptPrefix(historyResult.promptPrefix);
                onLog("info", "memory", `历史上下文已注入: ${historyResult.stats.experienceCount} 条经验, ` +
                    `${historyResult.stats.capabilityCount} 项能力 (${historyResult.stats.totalChars} 字符)`);
            }
        }
        catch (e) {
            onLog("warn", "memory", `历史上下文注入失败（非致命）: ${e instanceof Error ? e.message : e}`);
        }
        try {
            // 使用 LoopHarness 执行（内部委托给 LoopModule）
            const result = await loopHarness.executeWithLoop(plan, loopContext);
            onLog("info", "execute", `执行完成: ${result.totalIterations} 轮迭代, ` +
                `allPassed=${result.allPassed}, ` +
                `耗时 ${Math.round(result.totalDurationMs / 1000)}s`);
            // ★ 提取最后一次 Critic 评估摘要用于进化阶段
            const { criticSummary, guardSummary } = this.extractSummaries(result);
            // ★ 将 finalOutputs 和 processedOutput 持久化到磁盘（artifacts/ 目录）
            const outputCount = Object.keys(result.finalOutputs).length;
            if (outputCount > 0) {
                onLog("info", "execute", `已生成 ${outputCount} 个产物，正在写入磁盘...`);
                await this.persistOutputsToDisk(result);
            }
            // 产物后处理管线：将 .md 产物转换为其他格式（可扩展）
            if (outputCount > 0) {
                await this.runArtifactPipeline(result);
            }
            return { harnessResult: result, criticSummary, guardSummary };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onLog("error", "execute", `执行失败: ${message}`);
            throw error;
        }
    }
    extractSummaries(result) {
        const writerSteps = result.stepResults.filter((s) => s.iterations.length > 0);
        if (writerSteps.length === 0)
            return {};
        const lastStep = writerSteps[writerSteps.length - 1];
        const lastIteration = lastStep.iterations[lastStep.iterations.length - 1];
        const critic = lastIteration?.criticOutput;
        const criticSummary = critic
            ? {
                totalScore: critic.overallScore,
                passed: critic.passed,
                excellent: critic.overallScore >= 90,
                dimensionScores: critic.dimensions
                    ? Object.entries(critic.dimensions).map(([id, d]) => ({
                        dimensionId: id,
                        dimensionName: id,
                        rawScore: d.score,
                        maxScore: 10,
                        comment: d.comment,
                    }))
                    : [],
                reasoning: "",
            }
            : undefined;
        const verifications = this.deps.getCollectedVerifications();
        const verifiedCount = verifications.filter((v) => v.verified).length;
        const totalCount = verifications.length;
        const guardSummary = {
            totalGoals: Math.max(totalCount, 1),
            verifiedGoals: verifiedCount,
        };
        return { criticSummary, guardSummary };
    }
    async persistOutputsToDisk(result) {
        const taskId = this.deps.getTaskId() ?? `task-${Date.now()}`;
        for (const [stepId, output] of Object.entries(result.finalOutputs)) {
            try {
                const content = this.extractContentFromOutput(output);
                if (!content || content.trim().length === 0) {
                    this.deps.onLog("warn", "execute", `Step "${stepId}" 产出为空，跳过写入`);
                    continue;
                }
                const fileName = `${stepId}.md`;
                const artifact = await this.deps.artifactManager.createArtifact({
                    name: fileName,
                    content,
                    type: "generic",
                });
                this.deps.onLog("info", "execute", `✅ 产物已写入磁盘: ${artifact.name} (${artifact.sizeBytes} bytes)`);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                this.deps.onLog("warn", "execute", `⚠️ Step "${stepId}" 产物写入失败（非致命）: ${msg}`);
            }
        }
        if (result.processedOutput) {
            try {
                const processed = result.processedOutput;
                const ext = processed.format === "html" ? "html"
                    : processed.format === "json" ? "json"
                        : processed.format === "plain" ? "txt"
                            : "md";
                const platformSuffix = processed.platform ? `-${processed.platform}` : "";
                const fileName = `${taskId}-processed${platformSuffix}.${ext}`;
                const artifact = await this.deps.artifactManager.createArtifact({
                    name: fileName,
                    content: processed.processedContent,
                    type: processed.format === "html" ? "html" : "generic",
                });
                this.deps.onLog("info", "execute", `✅ 后处理产物已写入磁盘: ${artifact.name} (${artifact.sizeBytes} bytes)`);
                if (processed.rawContent && processed.format !== "markdown") {
                    const rawFileName = `${taskId}-raw.md`;
                    const existingRaw = await this.deps.artifactManager.readArtifact(rawFileName);
                    if (!existingRaw) {
                        const rawArtifact = await this.deps.artifactManager.createArtifact({
                            name: rawFileName,
                            content: processed.rawContent,
                            type: "generic",
                        });
                        this.deps.onLog("info", "execute", `✅ 原始 Markdown 已写入磁盘: ${rawArtifact.name} (${rawArtifact.sizeBytes} bytes)`);
                    }
                }
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                this.deps.onLog("warn", "execute", `⚠️ 后处理产物写入失败（非致命）: ${msg}`);
            }
        }
    }
    extractContentFromOutput(output) {
        if (typeof output === "string") {
            return output;
        }
        if (output && typeof output === "object") {
            const obj = output;
            if (typeof obj.content === "string" && obj.content.length > 0) {
                return obj.content;
            }
            try {
                const serialized = JSON.stringify(output, null, 2);
                if (serialized && serialized !== "{}") {
                    return serialized;
                }
            }
            catch {
                // ignore
            }
        }
        return null;
    }
    async runArtifactPipeline(result) {
        const allArtifacts = await this.deps.artifactManager.listArtifacts();
        const mdArtifacts = allArtifacts.filter((a) => a.name.endsWith(".md"));
        if (mdArtifacts.length === 0) {
            this.deps.onLog("info", "pipeline", "无 Markdown 产物，跳过后处理");
            return;
        }
        this.deps.onLog("info", "pipeline", `启动后处理管线: ${mdArtifacts.length} 个 Markdown 产物待转换`);
        const pipelineSteps = [
            {
                name: "html",
                process: async (artifact) => {
                    const htmlName = artifact.name.replace(/\.md$/, ".html");
                    const existing = await this.deps.artifactManager.readArtifact(htmlName);
                    if (existing)
                        return;
                    const htmlArtifact = await this.deps.artifactManager.createHTMLArtifact({
                        name: htmlName,
                        markdownContent: artifact.content,
                        title: this.deps.getTaskInput()?.slice(0, 80) || "AI Company OS Output",
                        metadata: {
                            generator: "AI Company OS",
                            source: artifact.name,
                            date: new Date().toISOString().split("T")[0],
                        },
                    });
                    this.deps.onLog("info", "pipeline", `  ✅ ${artifact.name} → ${htmlArtifact.name} (${htmlArtifact.sizeBytes} bytes)`);
                },
            },
        ];
        for (const step of pipelineSteps) {
            this.deps.onLog("info", "pipeline", `[${step.name.toUpperCase()}] 转换中...`);
            let successCount = 0;
            for (const artifact of mdArtifacts) {
                try {
                    await step.process(artifact);
                    successCount++;
                }
                catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    this.deps.onLog("warn", "pipeline", `  ⚠️ ${artifact.name} → ${step.name} 转换失败: ${msg}`);
                }
            }
            this.deps.onLog("info", "pipeline", `[${step.name.toUpperCase()}] 完成: ${successCount}/${mdArtifacts.length}`);
        }
    }
}
//# sourceMappingURL=execution-coordinator.js.map