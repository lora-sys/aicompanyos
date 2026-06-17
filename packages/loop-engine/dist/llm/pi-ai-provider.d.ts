import type { LLMProvider } from "../interrogate/types.js";
/**
 * PiAILLMProvider - 基于 pi-ai 或 OpenAI 兼容 API 的真实 LLM Provider
 *
 * 实现策略：
 * 1. 优先尝试使用 @earendil-works/pi-ai 的 complete() 函数
 * 2. 如果 pi-ai 模块不可用，自动降级为直接 fetch 调用 OpenAI 兼容接口
 *
 * ⚠️ 禁止 Mock — 所有 API 失败均直接抛错，不降级到模拟数据
 */
export declare class PiAILLMProvider implements LLMProvider {
    private apiKey;
    private apiBase;
    private model;
    private timeoutMs;
    private useDirectFetch;
    private piAiComplete;
    constructor(config?: {
        apiKey?: string;
        apiBase?: string;
        model?: string;
        timeoutMs?: number;
    });
    /**
     * 初始化 Provider（延迟加载 pi-ai 模块）
     * 必须在首次 chat() 调用前或构造后立即调用
     */
    init(): Promise<void>;
    /**
     * 调用 LLM 进行对话
     * 实现 LLMProvider 接口
     * ⚠️ 禁止 Mock — 所有错误直接向上抛出
     */
    chat(messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
    }>): Promise<string>;
    /**
     * 使用 pi-ai complete() 进行调用
     */
    private chatWithPiAi;
    /**
     * 直接使用 fetch 调用 OpenAI 兼容 API（降级方案）
     * LongCat API 是标准 OpenAI 兼容接口
     */
    private chatWithFetch;
    /**
     * 工厂方法：从环境变量自动创建 Provider
     * 读取 .env 文件中的 OPENAI_API_KEY, OPENAI_API_BASE, OPENAI_MODEL
     */
    static fromEnv(): Promise<PiAILLMProvider>;
    /**
     * 同步工厂方法：从环境变量创建（不自动初始化）
     * 用于需要延迟初始化的场景
     */
    static fromEnvSync(): PiAILLMProvider;
}
//# sourceMappingURL=pi-ai-provider.d.ts.map