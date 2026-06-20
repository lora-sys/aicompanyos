import { type LLMProvider } from "@aicos/loop-engine";
/** Provider 工厂创建结果 */
export interface ProviderFactoryResult {
    /** LLM Provider 实例 */
    llmProvider: LLMProvider;
    /** pi-ai Model（仅在启用 pi-agent-core 时创建） */
    piAiModel?: import("@earendil-works/pi-ai").Model<"openai-completions">;
}
/**
 * 创建 LLM Provider 和 pi-ai Model
 *
 * 从 app.ts 构造函数中提取的 Provider 创建逻辑：
 * 1. 根据 apiKey 创建 PiAILLMProvider（强制使用真实 API，禁止 Mock）
 * 2. 根据 OPENAI_MODEL/OPENAI_API_BASE 创建 pi-ai Model（含 OpenAI fallback）
 *
 * @param config - 可选的 Provider 配置覆盖（用于测试注入）
 */
export declare function createProviders(config?: {
    llmProvider?: LLMProvider;
}): ProviderFactoryResult;
//# sourceMappingURL=provider-factory.d.ts.map