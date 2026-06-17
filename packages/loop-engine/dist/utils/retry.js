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
import { defaultClassifier } from "./error-classifier.js";
const DEFAULT_OPTIONS = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterFactor: 0.15,
    retryOnTransientOnly: true,
};
// ============================================================
// 核心函数
// ============================================================
/**
 * 带指数退避和抖动的异步重试
 *
 * @param fn 要执行的异步操作
 * @param options 重试配置
 * @returns 操作结果
 * @throws 最后一次失败的错误（如果是 PermanentError 或达到最大重试次数）
 */
export async function retryWithBackoff(fn, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError;
    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            const result = await fn();
            opts.onSuccess?.(result, attempt);
            return result;
        }
        catch (error) {
            lastError = error;
            // 最后一次尝试，不再重试
            if (attempt >= opts.maxAttempts)
                break;
            // 错误分类
            const classification = defaultClassifier.classify(error);
            // 如果只重试瞬时错误且当前是永久错误，立即抛出
            if (opts.retryOnTransientOnly && classification.type === "permanent") {
                opts.onFinalFailure?.(classification.error);
                throw classification.error;
            }
            // 计算延迟时间
            const rawDelay = opts.baseDelayMs * Math.pow(2, attempt - 1);
            const cappedDelay = Math.min(rawDelay, opts.maxDelayMs);
            const jitter = cappedDelay * opts.jitterFactor * (Math.random() * 2 - 1);
            const finalDelay = Math.max(0, Math.round(cappedDelay + jitter));
            opts.onRetry?.(attempt, classification, finalDelay);
            await sleep(finalDelay);
        }
    }
    // 所有尝试都失败了
    opts.onFinalFailure?.(lastError);
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
const DEFAULT_CB_OPTIONS = {
    failureThreshold: 5,
    recoveryTimeoutMs: 30000,
    halfOpenTestRequests: 1,
};
/**
 * 简单的熔断器实现
 *
 * 当连续失败超过阈值时进入 open 状态（快速失败），
 * 经过 recoveryTimeoutMs 后进入 half-open 状态（放行少量测试请求），
 * 测试成功则回到 closed，否则重新 open。
 */
export class CircuitBreaker {
    state = "closed";
    consecutiveFailures = 0;
    openedAt = 0;
    halfOpenSuccesses = 0;
    options;
    constructor(options = {}) {
        this.options = { ...DEFAULT_CB_OPTIONS, ...options };
    }
    /**
     * 通过熔断器执行操作
     */
    async execute(fn) {
        // Open 状态：检查是否可以进入 Half-Open
        if (this.state === "open") {
            if (Date.now() - this.openedAt >= this.options.recoveryTimeoutMs) {
                this.state = "half-open";
                this.halfOpenSuccesses = 0;
            }
            else {
                throw new Error(`CircuitBreaker OPEN — 连续 ${this.consecutiveFailures} 次失败，${Math.round((this.options.recoveryTimeoutMs - (Date.now() - this.openedAt)) / 1000)}s 后重试`);
            }
        }
        try {
            const result = await fn();
            // 成功：重置计数器
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure(error);
            throw error;
        }
    }
    /** 获取当前状态 */
    getState() {
        const base = { state: this.state, failures: this.consecutiveFailures };
        if (this.state === "open") {
            base.openedAtAgo = Date.now() - this.openedAt;
        }
        return base;
    }
    /** 手动重置 */
    reset() {
        this.state = "closed";
        this.consecutiveFailures = 0;
        this.openedAt = 0;
        this.halfOpenSuccesses = 0;
    }
    // ---- 内部方法 ----
    onSuccess() {
        this.consecutiveFailures = 0;
        if (this.state === "half-open") {
            this.halfOpenSuccesses++;
            if (this.halfOpenSuccesses >= this.options.halfOpenTestRequests) {
                this.state = "closed"; // 恢复正常
            }
        }
    }
    onFailure(_error) {
        this.consecutiveFailures++;
        if (this.state === "half-open") {
            this.state = "open"; // 半开放测试失败，重新熔断
            this.openedAt = Date.now();
        }
        else if (this.consecutiveFailures >= this.options.failureThreshold) {
            this.state = "open";
            this.openedAt = Date.now();
        }
    }
}
// ============================================================
// 辅助函数
// ============================================================
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=retry.js.map