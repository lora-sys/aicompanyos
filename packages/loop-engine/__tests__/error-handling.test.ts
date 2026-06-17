import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ErrorClassifier,
  defaultClassifier,
  TransientError,
  PermanentError,
} from "../src/utils/error-classifier.js";
import { retryWithBackoff, CircuitBreaker } from "../src/utils/retry.js";

// ============================================================
// 1. ErrorClassifier — 瞬时错误分类
// ============================================================
describe("ErrorClassifier — 瞬时错误分类", () => {
  const classifier = new ErrorClassifier();

  it('"timeout" 应被归类为瞬时错误', () => {
    const result = classifier.classify("timeout");
    expect(result.type).toBe("transient");
    expect(result.error).toBeInstanceOf(TransientError);
  });

  it('"ETIMEDOUT" 应被归类为瞬时错误', () => {
    const result = classifier.classify("ETIMEDOUT");
    expect(result.type).toBe("transient");
  });

  it('"503 Service Unavailable" 应被归类为瞬时错误（5xx 服务端错误）', () => {
    const result = classifier.classify("503 Service Unavailable");
    expect(result.type).toBe("transient");
  });

  it('"rate limit exceeded" 应被归类为瞬时错误（限流）', () => {
    const result = classifier.classify("rate limit exceeded");
    expect(result.type).toBe("transient");
  });

  it('"network error: ECONNRESET" 应被归类为瞬时错误（连接重置）', () => {
    const result = classifier.classify("network error: ECONNRESET");
    expect(result.type).toBe("transient");
  });

  it('"fetch failed" 应被归类为瞬时错误', () => {
    const result = classifier.classify("fetch failed");
    expect(result.type).toBe("transient");
  });

  it('"429 Too Many Requests" 应被归类为瞬时错误（HTTP 429）', () => {
    const result = classifier.classify("429 Too Many Requests");
    expect(result.type).toBe("transient");
  });
});

// ============================================================
// 2. ErrorClassifier — 永久错误分类
// ============================================================
describe("ErrorClassifier — 永久错误分类", () => {
  const classifier = new ErrorClassifier();

  it('"401 Unauthorized" 应被归类为永久错误', () => {
    const result = classifier.classify("401 Unauthorized");
    expect(result.type).toBe("permanent");
    expect(result.error).toBeInstanceOf(PermanentError);
  });

  it('"403 Forbidden" 应被归类为永久错误', () => {
    const result = classifier.classify("403 Forbidden");
    expect(result.type).toBe("permanent");
  });

  it('"404 Not Found" 应被归类为永久错误', () => {
    const result = classifier.classify("404 Not Found");
    expect(result.type).toBe("permanent");
  });

  it('"invalid parameter" 应被归类为永久错误（参数校验失败）', () => {
    const result = classifier.classify("invalid parameter");
    expect(result.type).toBe("permanent");
  });

  it('"authentication failed" 应被归类为永久错误', () => {
    const result = classifier.classify("authentication failed");
    expect(result.type).toBe("permanent");
  });

  it('"422 Unprocessable Entity" 应被归类为永久错误', () => {
    const result = classifier.classify("422 Unprocessable Entity");
    expect(result.type).toBe("permanent");
  });
});

// ============================================================
// 3. ErrorClassifier — 已知类型直接返回
// ============================================================
describe("ErrorClassifier — 已知类型直接返回", () => {
  const classifier = new ErrorClassifier();

  it("TransientError 实例应直接返回 type=transient，不重新包装", () => {
    const original = new TransientError("test");
    const result = classifier.classify(original);
    expect(result.type).toBe("transient");
    // 应返回同一个实例，不创建新的
    expect(result.error).toBe(original);
    expect(result.reason).toContain("已标记为瞬时错误");
  });

  it("PermanentError 实例应直接返回 type=permanent，不重新包装", () => {
    const original = new PermanentError("test");
    const result = classifier.classify(original);
    expect(result.type).toBe("permanent");
    expect(result.error).toBe(original);
    expect(result.reason).toContain("已标记为永久错误");
  });
});

// ============================================================
// 4. ErrorClassifier — 默认行为（保守策略）
// ============================================================
describe("ErrorClassifier — 默认保守策略", () => {
  const classifier = new ErrorClassifier();

  it('未知错误字符串 "something weird happened" 默认归为 transient（保守策略）', () => {
    const result = classifier.classify("something weird happened");
    expect(result.type).toBe("transient");
    expect(result.reason).toContain("未知错误类型");
  });
});

// ============================================================
// 5. ErrorClassifier — Error 对象处理
// ============================================================
describe("ErrorClassifier — Error 对象处理", () => {
  const classifier = new ErrorClassifier();

  it('应从 Error.message 中提取信息进行分类：Error("timeout occurred") → transient', () => {
    const result = classifier.classify(new Error("timeout occurred"));
    expect(result.type).toBe("transient");
  });

  it("应提取 cause chain 完整信息用于匹配", () => {
    // 外层 message 不包含可识别模式，但 cause 包含 "404"
    const inner = new Error("resource not found: /api/users/123");
    const outer = new Error("request failed", { cause: inner });
    const result = classifier.classify(outer);
    // cause chain 中的 "not found" 应触发 permanent 分类
    expect(result.type).toBe("permanent");
  });
});

// ============================================================
// 6. ErrorClassifier — isRetryable() 快捷方法
// ============================================================
describe("ErrorClassifier — isRetryable()", () => {
  const classifier = new ErrorClassifier();

  it("瞬时错误 isRetryable 返回 true", () => {
    expect(classifier.isRetryable("timeout")).toBe(true);
    expect(classifier.isRetryable(new TransientError("test"))).toBe(true);
  });

  it("永久错误 isRetryable 返回 false", () => {
    expect(classifier.isRetryable("401 Unauthorized")).toBe(false);
    expect(classifier.isRetryable(new PermanentError("test"))).toBe(false);
  });
});

// ============================================================
// 7. ErrorClassifier — 自定义模式扩展
// ============================================================
describe("ErrorClassifier — 自定义模式扩展", () => {
  it("extraTransientPatterns 可以扩展瞬时错误识别范围", () => {
    const classifier = new ErrorClassifier({
      extraTransientPatterns: [/custom-transient-error/i],
    });
    // 原本不会被识别的模式
    const result = classifier.classify("custom-transient-error occurred");
    expect(result.type).toBe("transient");
  });

  it("extraPermanentPatterns 可以扩展永久错误识别范围", () => {
    const classifier = new ErrorClassifier({
      extraPermanentPatterns: [/custom-fatal-error/i],
    });
    const result = classifier.classify("custom-fatal-error detected");
    expect(result.type).toBe("permanent");
  });

  it("自定义永久模式的优先级高于自定义瞬时模式", () => {
    // 同时匹配两种自定义模式时，permanent 优先级更高
    const classifier = new ErrorClassifier({
      extraTransientPatterns: [/ambiguous/i],
      extraPermanentPatterns: [/ambiguous/i],
    });
    const result = classifier.classify("ambiguous error");
    expect(result.type).toBe("permanent");
  });
});

// ============================================================
// 8. defaultClassifier 全局实例可用性
// ============================================================
describe("defaultClassifier 全局实例", () => {
  it("全局共享的 defaultClassifier 可以正常使用", () => {
    const result = defaultClassifier.classify("timeout");
    expect(result.type).toBe("transient");
  });
});

// ============================================================
// 9. retryWithBackoff — 首次成功
// ============================================================
describe("retryWithBackoff — 首次成功", () => {
  it("fn 第一次就成功时，直接返回结果且不触发重试", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const onRetry = vi.fn();
    const onSuccess = vi.fn();

    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitterFactor: 0,
      onRetry,
      onSuccess,
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    // 首次成功不应调用 onRetry
    expect(onRetry).not.toHaveBeenCalled();
    // 成功后应调用 onSuccess
    expect(onSuccess).toHaveBeenCalledWith("ok", 1);
  });
});

// ============================================================
// 10. retryWithBackoff — 重试后成功
// ============================================================
describe("retryWithBackoff — 重试后成功", () => {
  it("fn 第 1 次失败、第 2 次成功 → 返回结果", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("success-on-2nd");

    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 1000,
      jitterFactor: 0,
    });

    expect(result).toBe("success-on-2nd");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// 11. retryWithBackoff — 达到最大重试次数
// ============================================================
describe("retryWithBackoff — 达到最大重试次数", () => {
  it("全部尝试都失败时，抛出最后一次错误", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("persistent failure"));

    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 1000,
        jitterFactor: 0,
      })
    ).rejects.toThrow("persistent failure");

    // 应尝试了 maxAttempts 次
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ============================================================
// 12. retryWithBackoff — PermanentError 不重试
// ============================================================
describe("retryWithBackoff — PermanentError 不重试", () => {
  it("retryOnTransientOnly=true 时遇到 PermanentError 应立即抛出，不再重试", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));

    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterFactor: 0,
        retryOnTransientOnly: true,
      })
    ).rejects.toThrow();

    // 只尝试了一次就因 PermanentError 直接抛出
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retryOnTransientOnly=false 时 PermanentError 也会继续重试", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("401 Unauthorized"))
      .mockResolvedValueOnce("recovered");

    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 1000,
      jitterFactor: 0,
      retryOnTransientOnly: false,
    });

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// 13. retryWithBackoff — 回调触发验证
// ============================================================
describe("retryWithBackoff — 回调触发", () => {
  it("onRetry 应在每次重试前被正确调用，携带 attempt 和 classification 信息", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce("finally-ok");

    const onRetry = vi.fn();
    const onSuccess = vi.fn();
    const onFinalFailure = vi.fn();

    await retryWithBackoff(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 1000,
      jitterFactor: 0,
      onRetry,
      onSuccess,
      onFinalFailure,
    });

    // 失败了 2 次，所以 onRetry 被调用了 2 次
    expect(onRetry).toHaveBeenCalledTimes(2);

    // 第一次重试：attempt=1（第一次失败的 attempt 编号）
    expect(onRetry).toHaveBeenNthCalledWith(
      1,
      1,
      expect.objectContaining({ type: "transient" }),
      expect.any(Number)
    );

    // 第二次重试：attempt=2
    expect(onRetry).toHaveBeenNthCalledWith(
      2,
      2,
      expect.objectContaining({ type: "transient" }),
      expect.any(Number)
    );

    // 最终成功了，onSuccess 被调用
    expect(onSuccess).toHaveBeenCalledWith("finally-ok", 3);
    // 最终没有失败，onFinalFailure 不应被调用
    expect(onFinalFailure).not.toHaveBeenCalled();
  });

  it("最终全部失败时应触发 onFinalFailure 回调", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    const onFinalFailure = vi.fn();

    try {
      await retryWithBackoff(fn, {
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 1000,
        jitterFactor: 0,
        onFinalFailure,
      });
    } catch {
      // 预期抛出异常
    }

    expect(onFinalFailure).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 14. retryWithBackoff — 抖动 (Jitter)
// ============================================================
describe("retryWithBackoff — 抖动", () => {
  it("jitterFactor > 0 时延迟时间应有随机波动（多次运行结果不完全相同）", async () => {
    vi.useFakeTimers();
    const delays: number[] = [];

    for (let i = 0; i < 5; i++) {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce("ok");

      const capturedDelays: number[] = [];
      const promise = retryWithBackoff(fn, {
        maxAttempts: 2,
        baseDelayMs: 100,
        maxDelayMs: 30000,
        jitterFactor: 0.5, // 较大的抖动因子以便观察差异
        onRetry(_attempt, _err, delayMs) {
          capturedDelays.push(delayMs);
        },
      });

      // 推进定时器让 sleep 完成
      await vi.runAllTimersAsync();
      await promise;

      if (capturedDelays.length > 0) {
        delays.push(capturedDelays[0]!);
      }
    }

    vi.useRealTimers();

    // 有抖动时，不同运行的延迟时间不应该完全一致
    // 至少存在两种不同的延迟值（因为随机性，5 次运行中大概率会有差异）
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// 15. retryWithBackoff — maxDelayMs 上限
// ============================================================
describe("retryWithBackoff — maxDelayMs 上限", () => {
  it("基础延迟很大时，实际延迟不应超过 maxDelayMs", async () => {
    vi.useFakeTimers();

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("ok");

    const capturedDelays: number[] = [];
    const promise = retryWithBackoff(fn, {
      maxAttempts: 2,
      baseDelayMs: 100000, // 很大的基础延迟
      maxDelayMs: 200,     // 很小的上限
      jitterFactor: 0,     // 关闭抖动以精确比较
      onRetry(_attempt, _err, delayMs) {
        capturedDelays.push(delayMs);
      },
    });

    // 推进定时器让异步操作完成
    await vi.runAllTimersAsync();
    await promise;

    // 延迟时间应该被限制在 maxDelayMs 以内
    expect(capturedDelays[0]).toBeLessThanOrEqual(200);
    expect(capturedDelays[0]).toBeGreaterThan(0);

    vi.useRealTimers();
  });
});

// ============================================================
// 16. CircuitBreaker — Closed 状态正常执行
// ============================================================
describe("CircuitBreaker — Closed 状态正常执行", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 1000 });
  });

  it("连续成功执行应保持 closed 状态，failures 计数归零", async () => {
    const fn = vi.fn().mockResolvedValue("result");

    await cb.execute(fn);
    await cb.execute(fn);
    await cb.execute(fn);

    const state = cb.getState();
    expect(state.state).toBe("closed");
    expect(state.failures).toBe(0);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ============================================================
// 17. CircuitBreaker — Open 状态快速失败
// ============================================================
describe("CircuitBreaker — Open 状态快速失败", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 2, recoveryTimeoutMs: 5000 });
  });

  it("达到 failureThreshold 后进入 open 状态，后续请求快速失败并抛出 OPEN 错误", async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error("service down"));

    // 连续失败达到阈值
    await expect(cb.execute(failingFn)).rejects.toThrow("service down");
    await expect(cb.execute(failingFn)).rejects.toThrow("service down");

    // 此时应该已经进入 open 状态
    expect(cb.getState().state).toBe("open");
    expect(cb.getState().failures).toBe(2);

    // 再请求一次应直接抛出 CircuitBreaker OPEN 错误，不再执行 fn
    await expect(cb.execute(failingFn)).rejects.toThrow(/CircuitBreaker OPEN/);

    // fn 不应再被调用（快速失败，未到达业务逻辑）
    expect(failingFn).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// 18. CircuitBreaker — Half-Open 恢复
// ============================================================
describe("CircuitBreaker — Half-Open 恢复", () => {
  it("recoveryTimeoutMs 过后应进入 half-open 状态并放行测试请求", async () => {
    vi.useFakeTimers();

    const cb = new CircuitBreaker({
      failureThreshold: 2,
      recoveryTimeoutMs: 1000,
    });

    const failingFn = vi.fn().mockRejectedValue(new Error("down"));

    // 触发熔断
    await expect(cb.execute(failingFn)).rejects.toThrow();
    await expect(cb.execute(failingFn)).rejects.toThrow();
    expect(cb.getState().state).toBe("open");

    // 快进时间超过 recoveryTimeoutMs
    vi.advanceTimersByTime(1100);

    // 此时应进入 half-open 并放行请求
    const successFn = vi.fn().mockResolvedValue("recovered");
    const result = await cb.execute(successFn);

    expect(result).toBe("recovered");
    expect(successFn).toHaveBeenCalledTimes(1);
    // 半开放测试成功后应恢复为 closed
    expect(cb.getState().state).toBe("closed");
    expect(cb.getState().failures).toBe(0);

    vi.useRealTimers();
  });
});

// ============================================================
// 19. CircuitBreaker — Half-Open 失败回退
// ============================================================
describe("CircuitBreaker — Half-Open 失败回退", () => {
  it("半开放状态下的测试请求如果失败，应重新回到 open 状态", async () => {
    vi.useFakeTimers();

    const cb = new CircuitBreaker({
      failureThreshold: 2,
      recoveryTimeoutMs: 1000,
    });

    const failingFn = vi.fn().mockRejectedValue(new Error("down"));

    // 触发熔断
    await expect(cb.execute(failingFn)).rejects.toThrow();
    await expect(cb.execute(failingFn)).rejects.toThrow();
    expect(cb.getState().state).toBe("open");

    // 快进时间进入 half-open
    vi.advanceTimersByTime(1100);

    // 半开放状态下再次失败
    const stillFailingFn = vi.fn().mockRejectedValue(new Error("still down"));
    await expect(cb.execute(stillFailingFn)).rejects.toThrow("still down");

    // 应重新回到 open 状态
    expect(cb.getState().state).toBe("open");

    vi.useRealTimers();
  });
});

// ============================================================
// 20. CircuitBreaker — getState()
// ============================================================
describe("CircuitBreaker — getState()", () => {
  it("正确返回当前状态和失败计数", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 5000 });

    // 初始状态
    expect(cb.getState().state).toBe("closed");
    expect(cb.getState().failures).toBe(0);

    // 失败 1 次
    const failFn = vi.fn().mockRejectedValue(new Error("err"));
    await expect(cb.execute(failFn)).rejects.toThrow();
    expect(cb.getState().state).toBe("closed");
    expect(cb.getState().failures).toBe(1);

    // Open 状态下应包含 openedAtAgo 信息
    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(failFn)).rejects.toThrow();
    }

    const openState = cb.getState();
    expect(openState.state).toBe("open");
    expect(openState.failures).toBe(3);
    expect(openState.openedAtAgo).toBeDefined();
    expect(typeof openState.openedAtAgo).toBe("number");
  });
});

// ============================================================
// 21. CircuitBreaker — reset()
// ============================================================
describe("CircuitBreaker — reset()", () => {
  it("手动 reset 后应恢复到 closed 状态，所有计数清零", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, recoveryTimeoutMs: 5000 });

    // 进入 open 状态
    const failFn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(cb.execute(failFn)).rejects.toThrow();
    await expect(cb.execute(failFn)).rejects.toThrow();
    expect(cb.getState().state).toBe("open");

    // 手动重置
    cb.reset();

    // 应完全恢复初始状态
    expect(cb.getState().state).toBe("closed");
    expect(cb.getState().failures).toBe(0);

    // 重置后可以正常使用
    const okFn = vi.fn().mockResolvedValue("fine");
    const result = await cb.execute(okFn);
    expect(result).toBe("fine");
    expect(cb.getState().state).toBe("closed");
  });
});

// ============================================================
// 22. CircuitBreaker — 连续成功重置计数
// ============================================================
describe("CircuitBreaker — 连续成功重置计数", () => {
  it("成功一次后 consecutiveFailures 应归零", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 5000 });

    const failFn = vi.fn().mockRejectedValue(new Error("fail"));

    // 连续失败 2 次
    await expect(cb.execute(failFn)).rejects.toThrow();
    await expect(cb.execute(failFn)).rejects.toThrow();
    expect(cb.getState().failures).toBe(2);

    // 成功一次
    const okFn = vi.fn().mockResolvedValue("ok");
    await cb.execute(okFn);

    // failures 应归零
    expect(cb.getState().failures).toBe(0);
    expect(cb.getState().state).toBe("closed");
  });

  it("间歇性失败不会累积（中间的成功会重置计数）", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 5000 });

    const failFn = vi.fn().mockRejectedValue(new Error("fail"));
    const okFn = vi.fn().mockResolvedValue("ok");

    // 失败 → 成功 → 失败 → 失败（不会触发熔断，因为中间成功重置了计数）
    await expect(cb.execute(failFn)).rejects.toThrow();   // failures=1
    await cb.execute(okFn);                                // failures=0 (reset)
    await expect(cb.execute(failFn)).rejects.toThrow();   // failures=1
    await expect(cb.execute(failFn)).rejects.toThrow();   // failures=2

    // 未达到 threshold=3，仍处于 closed
    expect(cb.getState().state).toBe("closed");
    expect(cb.getState().failures).toBe(2);

    // 再失败一次才触发熔断
    await expect(cb.execute(failFn)).rejects.toThrow();   // failures=3
    expect(cb.getState().state).toBe("open");
  });
});
