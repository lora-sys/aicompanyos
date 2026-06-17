/**
 * LLM 结构化输出统一解析工具
 *
 * 解决的问题：
 * - 代码库中 8+ 处各自实现 LLM JSON 输出提取+解析逻辑，代码重复且策略不一致
 * - 无 Schema 验证，LLM 返回拼写错误字段名时静默丢失数据
 * - 错误处理策略分歧（throw / default-value / silent / rule-engine fallback）
 *
 * 设计决策：
 * - 四级回退 JSON 提取（继承自 InterrogateEngine.parseQuestions 的成熟策略）
 * - Zod schema 运行时验证（编译期 TS 类型 + 运行时 Zod 守卫双重保障）
 * - 可配置的 fallback 模式：throw | return-fallback | return-null
 * - 统一的 warn 日志格式
 *
 * @module @aicos/loop-engine/utils/llm-structured-output
 */
/** Fallback 策略枚举 */
export var FallbackStrategy;
(function (FallbackStrategy) {
    /** 解析失败时抛出异常 */
    FallbackStrategy["THROW"] = "throw";
    /** 解析失败时返回配置的默认值 */
    FallbackStrategy["RETURN_FALLBACK"] = "return-fallback";
    /** 解析失败时返回 null（调用方自行处理） */
    FallbackStrategy["RETURN_NULL"] = "return-null";
})(FallbackStrategy || (FallbackStrategy = {}));
// ============================================================
// 核心：静态 JSON 提取方法
// ============================================================
/**
 * 四级回退 JSON 提取策略
 *
 * 从 LLM 原始文本中提取 JSON 字符串，按鲁棒性排序：
 * 1. Markdown ```json ... ``` 代码块
 * 2. JSON 数组 [...]
 * 3. JSON 对象 {...}（取最后一个匹配，更可能是完整输出）
 * 4. 直接将整个文本作为 JSON 尝试解析
 *
 * **关键：每层候选都会通过 JSON.parse 验证，只有合法 JSON 才返回。**
 * 这避免了正则匹配到非 JSON 文本（如代码示例、markdown 列表）导致的误匹配。
 *
 * 此方法是纯函数，无副作用，可独立使用。
 */
export function extractJSON(raw) {
    const text = raw.trim();
    if (!text)
        return null;
    // Level 1: Markdown 代码块
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
        const inner = codeBlockMatch[1].trim();
        if (inner && isValidJSON(inner))
            return { json: inner, source: "codeblock" };
    }
    // Level 2: JSON 数组
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch && isValidJSON(arrayMatch[0])) {
        return { json: arrayMatch[0], source: "array" };
    }
    // Level 3: JSON 对象 — 从后向前找第一个能通过 JSON.parse 的
    const objectMatches = [...text.matchAll(/\{[\s\S]*\}/g)];
    for (let i = objectMatches.length - 1; i >= 0; i--) {
        const candidate = objectMatches[i][0];
        if (isValidJSON(candidate)) {
            return { json: candidate, source: "object" };
        }
    }
    // Level 4: 裸文本直接尝试（某些 LLM 不包裹任何标记）
    if (isValidJSON(text)) {
        return { json: text, source: "raw" };
    }
    return null;
}
/** 快速检查字符串是否为合法 JSON */
function isValidJSON(str) {
    try {
        JSON.parse(str);
        return true;
    }
    catch {
        return false;
    }
}
// ============================================================
// 核心：LLMStructuredOutput 类
// ============================================================
/**
 * LLM 结构化输出解析器
 *
 * @example
 * ```ts
 * const parser = new LLMStructuredOutput({
 *   schema: z.object({
 *     score: z.number().min(0).max(100),
 *     reasons: z.array(z.string()),
 *   }),
 *   fallback: { score: 50, reasons: ["默认分"] },
 *   strategy: FallbackStrategy.RETURN_FALLBACK,
 * });
 *
 * const result = parser.parse(llmResponseText);
 * if (result.success) {
 *   console.log(result.data.score); // 类型安全，number
 * } else {
 *   console.log(result.fallback);   // 兜底值
 * }
 * ```
 */
export class LLMStructuredOutput {
    schema;
    fallback;
    strategy;
    logPrefix;
    constructor(options) {
        this.schema = options.schema;
        this.fallback = options.fallback;
        this.strategy = options.strategy ?? FallbackStrategy.RETURN_FALLBACK;
        this.logPrefix = options.logPrefix ?? "LLMStructuredOutput";
    }
    /**
     * 从 LLM 原始文本中解析结构化数据
     *
     * 流程：extractJSON → JSON.parse → Zod.parse → 返回结果或执行 fallback
     */
    parse(raw) {
        // Step 1: 提取 JSON
        const extracted = extractJSON(raw);
        if (!extracted) {
            return this.handleFailure("无法从响应中提取 JSON 内容");
        }
        // Step 2: JSON.parse
        let unknownData;
        try {
            unknownData = JSON.parse(extracted.json);
        }
        catch (parseError) {
            return this.handleFailure(`JSON 语法错误 (${extracted.source}): ${parseError.message}`);
        }
        // Step 3: Zod schema 验证
        const result = this.schema.safeParse(unknownData);
        if (result.success) {
            return { success: true, data: result.data };
        }
        // Step 4: 验证失败 → 格式化错误信息
        const validationErrors = formatZodErrors(result.error);
        return this.handleFailure(`Schema 验证失败 (${extracted.source}): ${validationErrors.slice(0, 3).join("; ")}`, validationErrors);
    }
    /**
     * 仅提取 JSON 字符串（不解析、不验证）
     * 用于需要自定义后处理的场景
     */
    extract(raw) {
        return extractJSON(raw);
    }
    /**
     * 获取配置的兜底值
     */
    getFallback() {
        return this.fallback;
    }
    /**
     * 获取 Zod schema 引用（用于组合 schema 场景）
     */
    getSchema() {
        return this.schema;
    }
    // --- 内部方法 ---
    handleFailure(error, validationErrors) {
        const message = `[${this.logPrefix}] ${error}`;
        switch (this.strategy) {
            case FallbackStrategy.THROW:
                throw new Error(message);
            case FallbackStrategy.RETURN_NULL:
                console.warn(message);
                return { success: false, error, fallback: this.fallback, validationErrors };
            case FallbackStrategy.RETURN_FALLBACK:
            default:
                console.warn(message);
                return { success: false, error, fallback: this.fallback, validationErrors };
        }
    }
}
// ============================================================
// 辅助：格式化 Zod 错误
// ============================================================
/**
 * 将 ZodError 转换为人类可读的错误信息数组
 */
function formatZodErrors(zodError) {
    const issues = zodError.issues;
    if (issues.length === 0)
        return [zodError.message];
    return issues.map((issue) => {
        // Zod v4 的 issue 类型结构较复杂，使用安全访问
        const pathStr = Array.isArray(issue.path)
            ? (issue.path.length > 0 ? `.${issue.path.join(".")}` : "")
            : "";
        const detail = issue.code === "invalid_type"
            ? `期望 ${String(issue.expected ?? "未知")}`
            : String(issue.message ?? "验证失败");
        return `字段${pathStr}: ${detail}`;
    });
}
// ============================================================
// 便捷工厂函数
// ============================================================
/**
 * 快速创建 LLM 结构化输出解析器
 *
 * @example
 * ```ts
 * const parsePlan = createLLMParser({
 *   schema: executionPlanSchema,
 *   fallback: defaultPlan,
 *   logPrefix: "PlanEngine",
 * });
 * ```
 */
export function createLLMParser(options) {
    return new LLMStructuredOutput(options);
}
//# sourceMappingURL=llm-structured-output.js.map