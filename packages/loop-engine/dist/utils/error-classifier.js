/**
 * 错误分类器 — 区分可重试的瞬时错误和不可恢复的永久错误
 *
 * 设计原则：
 * - 网络超时、API 限流、临时服务不可用 → TransientError（可重试）
 * - 参数错误、认证失败、数据格式错误 → PermanentError（不重试）
 * - 未知错误默认为 TransientError（保守策略：宁可多试一次）
 */
// ============================================================
// 错误类型定义
// ============================================================
/** 可重试的瞬时错误 */
export class TransientError extends Error {
    cause;
    name = "TransientError";
    retryable = true;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        // 维护正确的 prototype 链
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
/** 不可恢复的永久错误 */
export class PermanentError extends Error {
    cause;
    name = "PermanentError";
    retryable = false;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
// ============================================================
// 常见错误模式匹配规则
// ============================================================
/** 瞬时错误关键词（大小写不敏感） */
const TRANSIENT_PATTERNS = [
    /timeout/i,
    /timed out/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /EPIPE/i,
    /network/i,
    /socket hang up/i,
    /abort/i,
    /rate.?limit/i,
    /429/i, // Too Many Requests
    /502/i, // Bad Gateway
    /503/i, // Service Unavailable
    /504/i, // Gateway Timeout
    /5\d{2}/i, // 5xx 服务端错误（保守策略）
    /fetch failed/i,
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /EAI_AGAIN/i,
    /dns/i,
    /connection refused/i,
    /reset by peer/i,
    /temporary/i,
    /retry/i,
    /overloaded/i,
    /throttl/i,
];
/** 永久错误关键词 */
const PERMANENT_PATTERNS = [
    /400/i, // Bad Request
    /401/i, // Unauthorized
    /403/i, // Forbidden
    /404/i, // Not Found
    /422/i, // Unprocessable Entity
    /authentication/i,
    /unauthorized/i,
    /forbidden/i,
    /not found/i,
    /invalid.*param/i,
    /invalid.*arg/i,
    /schema/i,
    /validation/i,
    /parse.*error/i,
    /json.*error/i,
    /syntax/i,
    /token.*expir/i,
    /quota.*exceed/i,
    /billing/i,
    /permission/i,
    /denied/i,
];
// ============================================================
// ErrorClassifier
// ============================================================
/**
 * 将任意 Error 分类为 Transient 或 Permanent
 */
export class ErrorClassifier {
    /** 自定义额外模式（可选） */
    extraTransient;
    extraPermanent;
    constructor(options) {
        this.extraTransient = options?.extraTransientPatterns ?? [];
        this.extraPermanent = options?.extraPermanentPatterns ?? [];
    }
    /**
     * 分类一个错误
     */
    classify(error) {
        const message = this.extractMessage(error);
        // 如果已经是已知类型，直接返回
        if (error instanceof TransientError) {
            return { type: "transient", error, reason: "已标记为瞬时错误" };
        }
        if (error instanceof PermanentError) {
            return { type: "permanent", error, reason: "已标记为永久错误" };
        }
        // 检查永久错误模式（优先级更高，因为更确定）
        if (this.matchesAny(PERMANENT_PATTERNS.concat(this.extraPermanent), message)) {
            const matchedPattern = this.findMatchedPattern(PERMANENT_PATTERNS.concat(this.extraPermanent), message);
            return {
                type: "permanent",
                error: new PermanentError(message, error instanceof Error ? error : undefined),
                reason: `匹配永久错误模式: ${matchedPattern}`,
            };
        }
        // 检查瞬时错误模式
        if (this.matchesAny(TRANSIENT_PATTERNS.concat(this.extraTransient), message)) {
            const matchedPattern = this.findMatchedPattern(TRANSIENT_PATTERNS.concat(this.extraTransient), message);
            return {
                type: "transient",
                error: new TransientError(message, error instanceof Error ? error : undefined),
                reason: `匹配瞬时错误模式: ${matchedPattern}`,
            };
        }
        // 默认：未知错误归类为瞬时（保守策略，允许重试一次）
        return {
            type: "transient",
            error: new TransientError(message, error instanceof Error ? error : undefined),
            reason: "未知错误类型，保守归类为瞬时（允许重试）",
        };
    }
    /**
     * 快速判断是否可重试
     */
    isRetryable(error) {
        return this.classify(error).type === "transient";
    }
    // ---- 内部方法 ----
    extractMessage(error) {
        if (!error)
            return "";
        if (typeof error === "string")
            return error;
        if (error instanceof Error) {
            // 包含 cause chain 的完整信息
            let msg = error.message;
            let current = error.cause;
            while (current && msg.length < 500) {
                msg += ` | caused by: ${current.message}`;
                current = current.cause;
            }
            return msg;
        }
        return String(error);
    }
    matchesAny(patterns, text) {
        for (const p of patterns) {
            if (p.test(text))
                return true;
        }
        return false;
    }
    findMatchedPattern(patterns, text) {
        for (const p of patterns) {
            if (p.test(text))
                return p.source;
        }
        return "unknown";
    }
}
/** 全局共享实例（大多数场景直接用这个） */
export const defaultClassifier = new ErrorClassifier();
//# sourceMappingURL=error-classifier.js.map