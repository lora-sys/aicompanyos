/**
 * VerificationPipeline — 确定性验证执行流水线
 *
 * 职责：
 * 1. 管理 7 种验证执行器的注册与分发
 * 2. 支持并发执行多个验证任务
 * 3. 统一超时控制和错误处理
 */
import { CommandExecutor, TestExecutor, LintExecutor, BrowserExecutor, FileExistenceExecutor, ContentMatchExecutor, LLMAssertionExecutor, } from "./executors.js";
export class VerificationPipeline {
    executors;
    defaultTimeoutMs;
    constructor(config) {
        this.defaultTimeoutMs = config?.timeoutMs ?? 30000;
        this.executors = new Map();
        // 注册内置执行器
        this.registerExecutor("command", new CommandExecutor());
        this.registerExecutor("test", new TestExecutor());
        this.registerExecutor("lint", new LintExecutor());
        this.registerExecutor("browser_check", new BrowserExecutor());
        this.registerExecutor("file_exists", new FileExistenceExecutor());
        this.registerExecutor("content_match", new ContentMatchExecutor());
        this.registerExecutor("llm_assertion", new LLMAssertionExecutor(config?.llmProvider));
    }
    /** 注册自定义验证执行器（覆盖内置） */
    registerExecutor(type, executor) {
        this.executors.set(type, executor);
    }
    /**
     * 执行单个验证方法
     *
     * @param method 验证方法配置
     * @param context 验证上下文
     * @returns 证据记录
     */
    async execute(method, context) {
        const executor = this.executors.get(method.type);
        if (!executor) {
            return {
                goalId: "",
                method: method.type,
                timestamp: new Date().toISOString(),
                passed: false,
                evidence: {
                    type: "command",
                    command: `[unknown:${method.type}]`,
                    exitCode: 1,
                    stdout: "",
                    stderr: `No executor registered for verification type: ${method.type}`,
                },
                durationMs: 0,
            };
        }
        // 包装超时
        const timeoutMs = this.extractTimeout(method) ?? this.defaultTimeoutMs;
        const result = await Promise.race([
            executor.execute(method, context),
            new Promise((resolve) => setTimeout(() => {
                resolve({
                    goalId: "",
                    method: method.type,
                    timestamp: new Date().toISOString(),
                    passed: false,
                    evidence: {
                        type: "command",
                        command: `[timeout:${method.type}]`,
                        exitCode: -1,
                        stdout: "",
                        stderr: `Verification timed out after ${timeoutMs}ms`,
                    },
                    durationMs: timeoutMs,
                });
            }, timeoutMs)),
        ]);
        return result;
    }
    /**
     * 并发执行多个验证方法
     *
     * @param methods 验证方法数组
     * @param concurrency 并发度
     * @param context 验证上下文
     * @returns 所有证据记录
     */
    async executeParallel(methods, concurrency, context) {
        if (methods.length === 0)
            return [];
        const results = [];
        const effectiveConcurrency = Math.min(concurrency, methods.length);
        for (let i = 0; i < methods.length; i += effectiveConcurrency) {
            const batch = methods.slice(i, i + effectiveConcurrency);
            const batchResults = await Promise.allSettled(batch.map((method) => this.execute(method, context)));
            for (const settled of batchResults) {
                if (settled.status === "fulfilled") {
                    results.push(settled.value);
                }
                else {
                    // 执行器本身抛异常，记录为失败证据
                    results.push({
                        goalId: "",
                        method: "command",
                        timestamp: new Date().toISOString(),
                        passed: false,
                        evidence: {
                            type: "command",
                            command: "[executor-error]",
                            exitCode: -1,
                            stdout: "",
                            stderr: `Executor error: ${settled.reason instanceof Error ? settled.reason.message : String(settled.reason)}`,
                        },
                        durationMs: 0,
                    });
                }
            }
        }
        return results;
    }
    /** 从验证方法中提取超时配置 */
    extractTimeout(method) {
        if ("timeoutMs" in method && typeof method.timeoutMs === "number") {
            return method.timeoutMs;
        }
        return undefined;
    }
}
//# sourceMappingURL=pipeline.js.map