/**
 * 错误分类器 — 区分可重试的瞬时错误和不可恢复的永久错误
 *
 * 设计原则：
 * - 网络超时、API 限流、临时服务不可用 → TransientError（可重试）
 * - 参数错误、认证失败、数据格式错误 → PermanentError（不重试）
 * - 未知错误默认为 TransientError（保守策略：宁可多试一次）
 */
/** 可重试的瞬时错误 */
export declare class TransientError extends Error {
    readonly cause?: Error | undefined;
    readonly name = "TransientError";
    readonly retryable: true;
    constructor(message: string, cause?: Error | undefined);
}
/** 不可恢复的永久错误 */
export declare class PermanentError extends Error {
    readonly cause?: Error | undefined;
    readonly name = "PermanentError";
    readonly retryable: false;
    constructor(message: string, cause?: Error | undefined);
}
/** 分类结果 */
export type ErrorClassification = {
    type: "transient";
    error: TransientError;
    reason: string;
} | {
    type: "permanent";
    error: PermanentError;
    reason: string;
};
/**
 * 将任意 Error 分类为 Transient 或 Permanent
 */
export declare class ErrorClassifier {
    /** 自定义额外模式（可选） */
    private extraTransient;
    private extraPermanent;
    constructor(options?: {
        extraTransientPatterns?: RegExp[];
        extraPermanentPatterns?: RegExp[];
    });
    /**
     * 分类一个错误
     */
    classify(error: unknown): ErrorClassification;
    /**
     * 快速判断是否可重试
     */
    isRetryable(error: unknown): boolean;
    private extractMessage;
    private matchesAny;
    private findMatchedPattern;
}
/** 全局共享实例（大多数场景直接用这个） */
export declare const defaultClassifier: ErrorClassifier;
//# sourceMappingURL=error-classifier.d.ts.map