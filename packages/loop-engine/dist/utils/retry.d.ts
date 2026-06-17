/**
 * 带指数退避的重试工具
 *
 * 使用方式：
 * ```typescript
 * const result = await retryWithBackoff(() => llm.chat(messages), {
 *   maxAttempts: 3,
 *   baseDelayMs: 1000,
 * });
 * ```
 */
import { type ErrorClassification } from "./error-classifier.js";
export interface RetryOptions<T = unknown> {
    /** 最大尝试次数（含首次）*/
    maxAttempts: number;
    /** 基础延迟 ms（第 N 次重试延迟 = baseDelayMs * 2^(N-1)）*/
    baseDelayMs: number;
    /** 最大延迟上限 ms */
    maxDelayMs: number;
    /** 抖动因子 (0-1)，0=无抖动，1=100%抖动。推荐 0.1-0.3 */
    jitterFactor: number;
    /** 是否仅对 TransientError 重试（默认 true）*/
    retryOnTransientOnly: boolean;
    /** 重试前的回调（用于日志）*/
    onRetry?: (attempt: number, error: ErrorClassification, delayMs: number) => void;
    /** 最终失败时的回调 */
    onFinalFailure?: (lastError: unknown) => void;
    /** 成功后的回调 */
    onSuccess?: (result: T, attempt: number) => void;
}
/**
 * 带指数退避和抖动的异步重试
 *
 * @param fn 要执行的异步操作
 * @param options 重试配置
 * @returns 操作结果
 * @throws 最后一次失败的错误（如果是 PermanentError 或达到最大重试次数）
 */
export declare function retryWithBackoff<T>(fn: () => Promise<T>, options?: Partial<RetryOptions<T>>): Promise<T>;
export interface CircuitBreakerOptions {
    /** 触发熔断的连续失败次数阈值 */
    failureThreshold: number;
    /** 熔断后自动恢复的时间窗口（ms）*/
    recoveryTimeoutMs: number;
    /** 半开状态下的测试请求数量 */
    halfOpenTestRequests: number;
}
type CircuitState = "closed" | "open" | "half-open";
/**
 * 简单的熔断器实现
 *
 * 当连续失败超过阈值时进入 open 状态（快速失败），
 * 经过 recoveryTimeoutMs 后进入 half-open 状态（放行少量测试请求），
 * 测试成功则回到 closed，否则重新 open。
 */
export declare class CircuitBreaker {
    private state;
    private consecutiveFailures;
    private openedAt;
    private halfOpenSuccesses;
    private options;
    constructor(options?: Partial<CircuitBreakerOptions>);
    /**
     * 通过熔断器执行操作
     */
    execute<T>(fn: () => Promise<T>): Promise<T>;
    /** 获取当前状态 */
    getState(): CircuitState & {
        failures: number;
        openedAtAgo?: number;
    };
    /** 手动重置 */
    reset(): void;
    private onSuccess;
    private onFailure;
}
export {};
//# sourceMappingURL=retry.d.ts.map