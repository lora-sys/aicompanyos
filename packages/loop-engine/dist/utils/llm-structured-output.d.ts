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
import { type ZodSchema } from "zod";
/** JSON 提取来源 */
export type JSONExtractSource = "codeblock" | "array" | "object" | "raw" | "relaxed" | "brace-pair";
/** JSON 提取结果 */
export interface JSONExtractResult {
    /** 提取到的 JSON 字符串 */
    json: string;
    /** 提取来源 */
    source: JSONExtractSource;
}
/** 解析结果 — 成功 */
export interface ParseSuccess<T> {
    success: true;
    data: T;
}
/** 解析结果 — 失败 */
export interface ParseFailure<T> {
    success: false;
    /** 失败原因（人类可读） */
    error: string;
    /** 配置的兜底值 */
    fallback: T;
    /** Zod 验证错误详情（仅当 JSON 解析成功但 schema 验证失败时有值） */
    validationErrors?: string[];
}
/** parse() 的联合返回类型 */
export type ParseResult<T> = ParseSuccess<T> | ParseFailure<T>;
/** Fallback 策略枚举 */
export declare enum FallbackStrategy {
    /** 解析失败时抛出异常 */
    THROW = "throw",
    /** 解析失败时返回配置的默认值 */
    RETURN_FALLBACK = "return-fallback",
    /** 解析失败时返回 null（调用方自行处理） */
    RETURN_NULL = "return-null"
}
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
export declare function extractJSON(raw: string): JSONExtractResult | null;
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
export declare class LLMStructuredOutput<T> {
    private readonly schema;
    private readonly fallback;
    private readonly strategy;
    private readonly logPrefix;
    constructor(options: {
        /** Zod schema 用于运行时验证 */
        schema: ZodSchema<T>;
        /** 解析失败时的兜底值 */
        fallback: T;
        /** 失败时的行为策略 */
        strategy?: FallbackStrategy;
        /** 日志前缀，用于定位问题来源 */
        logPrefix?: string;
    });
    /**
     * 从 LLM 原始文本中解析结构化数据
     *
     * 流程：extractJSON → JSON.parse → Zod.parse → 返回结果或执行 fallback
     */
    parse(raw: string): ParseResult<T>;
    /**
     * 仅提取 JSON 字符串（不解析、不验证）
     * 用于需要自定义后处理的场景
     */
    extract(raw: string): JSONExtractResult | null;
    /**
     * 获取配置的兜底值
     */
    getFallback(): T;
    /**
     * 获取 Zod schema 引用（用于组合 schema 场景）
     */
    getSchema(): ZodSchema<T>;
    private handleFailure;
}
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
export declare function createLLMParser<T>(options: {
    schema: ZodSchema<T>;
    fallback: T;
    strategy?: FallbackStrategy;
    logPrefix?: string;
}): LLMStructuredOutput<T>;
//# sourceMappingURL=llm-structured-output.d.ts.map