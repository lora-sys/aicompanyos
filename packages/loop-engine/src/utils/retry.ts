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

import { defaultClassifier, type ErrorClassification } from "./error-classifier.js";

// ============================================================
// 配置接口
// ============================================================

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

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry" | "onFinalFailure" | "onSuccess">> = {
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
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions<T>> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await fn();
      opts.onSuccess?.(result, attempt);
      return result;
    } catch (error) {
      lastError = error;

      // 最后一次尝试，不再重试
      if (attempt >= opts.maxAttempts) break;

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

// ============================================================
// Circuit Breaker（熔断器）
// ============================================================

export interface CircuitBreakerOptions {
  /** 触发熔断的连续失败次数阈值 */
  failureThreshold: number;
  /** 熔断后自动恢复的时间窗口（ms）*/
  recoveryTimeoutMs: number;
  /** 半开状态下的测试请求数量 */
  halfOpenTestRequests: number;
}

const DEFAULT_CB_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30000,
  halfOpenTestRequests: 1,
};

type CircuitState = "closed" | "open" | "half-open";

/**
 * 简单的熔断器实现
 *
 * 当连续失败超过阈值时进入 open 状态（快速失败），
 * 经过 recoveryTimeoutMs 后进入 half-open 状态（放行少量测试请求），
 * 测试成功则回到 closed，否则重新 open。
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenSuccesses = 0;
  private options: Required<CircuitBreakerOptions>;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_CB_OPTIONS, ...options };
  }

  /**
   * 通过熔断器执行操作
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Open 状态：检查是否可以进入 Half-Open
    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.options.recoveryTimeoutMs) {
        this.state = "half-open";
        this.halfOpenSuccesses = 0;
      } else {
        throw new Error(`CircuitBreaker OPEN — 连续 ${this.consecutiveFailures} 次失败，${Math.round((this.options.recoveryTimeoutMs - (Date.now() - this.openedAt)) / 1000)}s 后重试`);
      }
    }

    try {
      const result = await fn();

      // 成功：重置计数器
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /** 获取当前状态 */
  getState(): CircuitState & { failures: number; openedAtAgo?: number } {
    const base: any = { state: this.state, failures: this.consecutiveFailures };
    if (this.state === "open") {
      base.openedAtAgo = Date.now() - this.openedAt;
    }
    return base;
  }

  /** 手动重置 */
  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = 0;
    this.halfOpenSuccesses = 0;
  }

  // ---- 内部方法 ----

  private onSuccess(): void {
    this.consecutiveFailures = 0;

    if (this.state === "half-open") {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.options.halfOpenTestRequests) {
        this.state = "closed"; // 恢复正常
      }
    }
  }

  private onFailure(_error: unknown): void {
    this.consecutiveFailures++;

    if (this.state === "half-open") {
      this.state = "open"; // 半开放测试失败，重新熔断
      this.openedAt = Date.now();
    } else if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }
}

// ============================================================
// 辅助函数
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
