/**
 * VerificationPipeline — 确定性验证执行流水线
 *
 * 职责：
 * 1. 管理 7 种验证执行器的注册与分发
 * 2. 支持并发执行多个验证任务
 * 3. 统一超时控制和错误处理
 */
import type { VerificationMethod, VerificationContext, EvidenceRecord, VerificationExecutor } from "./types.js";
export declare class VerificationPipeline {
    private executors;
    private defaultTimeoutMs;
    constructor(config?: {
        timeoutMs?: number;
        llmProvider?: (prompt: string) => Promise<string>;
    });
    /** 注册自定义验证执行器（覆盖内置） */
    registerExecutor(type: VerificationMethod["type"], executor: VerificationExecutor): void;
    /**
     * 执行单个验证方法
     *
     * @param method 验证方法配置
     * @param context 验证上下文
     * @returns 证据记录
     */
    execute(method: VerificationMethod, context: VerificationContext): Promise<EvidenceRecord>;
    /**
     * 并发执行多个验证方法
     *
     * @param methods 验证方法数组
     * @param concurrency 并发度
     * @param context 验证上下文
     * @returns 所有证据记录
     */
    executeParallel(methods: VerificationMethod[], concurrency: number, context: VerificationContext): Promise<EvidenceRecord[]>;
    /** 从验证方法中提取超时配置 */
    private extractTimeout;
}
//# sourceMappingURL=pipeline.d.ts.map