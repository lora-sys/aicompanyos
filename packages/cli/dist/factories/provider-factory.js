// Provider 工厂：从 app.ts 抽取的 LLM Provider 和 pi-ai Model 创建逻辑
import { PiAILLMProvider } from "@aicos/loop-engine";
import { getModel } from "@earendil-works/pi-ai";
/**
 * 创建 LLM Provider 和 pi-ai Model
 *
 * 从 app.ts 构造函数中提取的 Provider 创建逻辑：
 * 1. 根据 apiKey 创建 PiAILLMProvider（强制使用真实 API，禁止 Mock）
 * 2. 根据 OPENAI_MODEL/OPENAI_API_BASE 创建 pi-ai Model（含 OpenAI fallback）
 *
 * @param config - 可选的 Provider 配置覆盖（用于测试注入）
 */
export function createProviders(config) {
    // 优先使用传入的 provider，否则创建真实 Provider
    const llmProvider = config?.llmProvider ?? createDefaultLLMProvider();
    // ★ v0.4.0: 默认启用 pi-agent-core 引擎，除非显式设置 AICOS_USE_LEGACY_ENGINE=1
    const usePiCore = process.env.AICOS_USE_LEGACY_ENGINE !== "1";
    const piAiModel = usePiCore ? createPiAiModel() : undefined;
    return { llmProvider, piAiModel };
}
/**
 * 创建默认 LLM Provider
 * 从环境变量读取配置，强制使用真实 API（禁止 Mock）
 */
function createDefaultLLMProvider() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
        throw new Error("❌ 未检测到 OPENAI_API_KEY 环境变量。请在 .env 文件中配置或设置环境变量后重试。\n" +
            "   所需变量: OPENAI_API_KEY, OPENAI_API_BASE, OPENAI_MODEL");
    }
    try {
        const provider = PiAILLMProvider.fromEnvSync();
        console.log("✅ 检测到 API 配置，使用真实 LLM Provider (LongCat)");
        // 异步初始化（不阻塞构造）
        provider.init().catch((err) => {
            console.error(`⚠️ LLM Provider 初始化失败: ${err.message}`);
        });
        return provider;
    }
    catch (error) {
        throw new Error(`❌ 创建 LLM Provider 失败: ${error instanceof Error ? error.message : error}`);
    }
}
/**
 * 为 pi-agent-core 的 agentLoop 构造 pi-ai Model
 *
 * 由于 LongCat 兼容 OpenAI API，这里使用 pi-ai 的 openai provider，
 * 并覆盖 baseUrl 指向 OPENAI_API_BASE。
 *
 * 策略：
 * 1. 优先使用 pi-ai 官方 getModel("openai", modelId) 获取标准元数据；
 * 2. 若 modelId 不被 pi-ai 识别（常见自定义模型名），则回退到手动构造一个
 *    OpenAI-compatible Model 对象，确保 agentLoop 仍可启用。
 */
function createPiAiModel() {
    const modelId = process.env.OPENAI_MODEL;
    const baseUrl = process.env.OPENAI_API_BASE;
    if (!modelId || !baseUrl) {
        console.warn("[CLI] 未配置 OPENAI_MODEL/OPENAI_API_BASE，agentLoop 将回退到兼容手搓循环");
        return undefined;
    }
    const fallbackModel = () => ({
        id: modelId,
        name: modelId,
        api: "openai-completions",
        provider: "openai",
        baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 16_384,
    });
    try {
        const model = getModel("openai", modelId);
        return { ...model, baseUrl };
    }
    catch {
        console.warn(`[CLI] pi-ai 不识别模型 "${modelId}"，使用 OpenAI-compatible fallback 构造 agentLoop Model`);
        return fallbackModel();
    }
}
//# sourceMappingURL=provider-factory.js.map