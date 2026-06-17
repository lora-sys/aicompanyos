// 基于 @earendil-works/pi-ai 的真实 LLM Provider
// 从 .env 读取配置，调用 pi-ai 内置的 chat completion 能力
// 如果 pi-ai 不可用，fallback 到直接 fetch 调用 OpenAI 兼容 API
// ⚠️ 禁止 Mock 模式 — 所有失败直接抛出错误
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
/**
 * PiAILLMProvider - 基于 pi-ai 或 OpenAI 兼容 API 的真实 LLM Provider
 *
 * 实现策略：
 * 1. 优先尝试使用 @earendil-works/pi-ai 的 complete() 函数
 * 2. 如果 pi-ai 模块不可用，自动降级为直接 fetch 调用 OpenAI 兼容接口
 *
 * ⚠️ 禁止 Mock — 所有 API 失败均直接抛错，不降级到模拟数据
 */
export class PiAILLMProvider {
    apiKey;
    apiBase;
    model;
    timeoutMs;
    useDirectFetch = false;
    piAiComplete = null;
    constructor(config) {
        this.apiKey = config?.apiKey ?? "";
        this.apiBase = config?.apiBase ?? "";
        this.model = config?.model ?? "";
        this.timeoutMs = config?.timeoutMs ?? 120_000;
    }
    /**
     * 初始化 Provider（延迟加载 pi-ai 模块）
     * 必须在首次 chat() 调用前或构造后立即调用
     */
    async init() {
        // 尝试动态加载 pi-ai
        try {
            const piAiModule = await import("@earendil-works/pi-ai");
            this.piAiComplete = piAiModule.complete;
            console.log("[PiAILLMProvider] 使用 pi-ai 驱动");
        }
        catch {
            // pi-ai 不可用，使用直接 fetch 方式
            this.useDirectFetch = true;
            console.log("[PiAILLMProvider] pi-ai 不可用，降级为直接 fetch 模式");
        }
    }
    /**
     * 调用 LLM 进行对话
     * 实现 LLMProvider 接口
     * ⚠️ 禁止 Mock — 所有错误直接向上抛出
     */
    async chat(messages) {
        // 确保已初始化
        if (this.piAiComplete === null && !this.useDirectFetch) {
            await this.init();
        }
        // 优先使用 pi-ai
        if (!this.useDirectFetch && this.piAiComplete) {
            return await this.chatWithPiAi(messages);
        }
        // 降级为直接 fetch（OpenAI 兼容 API）
        return await this.chatWithFetch(messages);
    }
    /**
     * 使用 pi-ai complete() 进行调用
     */
    async chatWithPiAi(messages) {
        // 分离 system 消息和对话消息
        const systemMsg = messages.find((m) => m.role === "system");
        const chatMessages = messages.filter((m) => m.role !== "system");
        const model = {
            id: this.model,
            name: this.model,
            api: "openai-completions",
            provider: "longcat",
            baseUrl: this.apiBase,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128_000,
            maxTokens: 16_384,
        };
        const context = {
            systemPrompt: systemMsg?.content,
            messages: chatMessages.map((m) => ({
                role: m.role,
                content: m.content,
                timestamp: Date.now(),
            })),
        };
        const response = await this.piAiComplete(model, context, {
            apiKey: this.apiKey,
            timeoutMs: this.timeoutMs,
            maxTokens: 16_384,
        });
        // 检查错误
        if (response.stopReason === "error") {
            throw new Error(response.errorMessage || "pi-ai 返回错误");
        }
        // 提取文本内容
        const textParts = response.content
            .filter((block) => block.type === "text" && block.text)
            .map((block) => block.text)
            .join("");
        if (!textParts) {
            // 尝试从 thinking 内容中提取
            const thinkingParts = response.content
                .filter((block) => block.type === "thinking" && block.thinking)
                .map((block) => block.thinking)
                .join("");
            if (thinkingParts)
                return thinkingParts;
            throw new Error("LLM 返回空内容");
        }
        return textParts;
    }
    /**
     * 直接使用 fetch 调用 OpenAI 兼容 API（降级方案）
     * LongCat API 是标准 OpenAI 兼容接口
     */
    async chatWithFetch(messages) {
        const url = `${this.apiBase.replace(/\/$/, "")}/chat/completions`;
        const body = {
            model: this.model,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            temperature: 0.7,
            max_tokens: 16_384,
        };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`);
            }
            const data = (await response.json());
            if (data.error) {
                throw new Error(data.error.message || "未知 API 错误");
            }
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error("API 返回空内容");
            }
            return content;
        }
        catch (error) {
            clearTimeout(timer);
            if (error instanceof DOMException && error.name === "AbortError") {
                throw new Error(`请求超时 (${this.timeoutMs}ms)`);
            }
            throw error;
        }
    }
    /**
     * 工厂方法：从环境变量自动创建 Provider
     * 读取 .env 文件中的 OPENAI_API_KEY, OPENAI_API_BASE, OPENAI_MODEL
     */
    static async fromEnv() {
        const config = await loadEnvConfig();
        const provider = new PiAILLMProvider({
            apiKey: config.apiKey,
            apiBase: config.apiBase,
            model: config.model,
        });
        await provider.init();
        return provider;
    }
    /**
     * 同步工厂方法：从环境变量创建（不自动初始化）
     * 用于需要延迟初始化的场景
     */
    static fromEnvSync() {
        // 同步读取环境变量（仅 process.env）
        const config = {
            apiKey: process.env.OPENAI_API_KEY ?? "",
            apiBase: process.env.OPENAI_API_BASE ?? "",
            model: process.env.OPENAI_MODEL ?? "",
        };
        return new PiAILLMProvider(config);
    }
}
/**
 * 从 .env 文件加载配置
 * 支持多种 .env 位置
 */
async function loadEnvConfig() {
    // 优先从 process.env 读取（已被 dotenv 等工具加载）
    if (process.env.OPENAI_API_KEY) {
        return {
            apiKey: process.env.OPENAI_API_KEY,
            apiBase: process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1",
            model: process.env.OPENAI_MODEL ?? "gpt-4o",
        };
    }
    // 尝试从项目根目录的 .env 文件读取
    const envPaths = [
        resolve(process.cwd(), ".env"),
        resolve(import.meta.dirname ?? ".", "..", "..", "..", ".env"),
    ];
    for (const envPath of envPaths) {
        try {
            const content = await readFile(envPath, "utf-8");
            const config = parseEnvContent(content);
            if (config.apiKey) {
                return config;
            }
        }
        catch {
            // 文件不存在或无法读取，继续尝试下一个路径
        }
    }
    return { apiKey: "", apiBase: "", model: "" };
}
/**
 * 解析 .env 文件内容
 */
function parseEnvContent(content) {
    let apiKey = "";
    let apiBase = "";
    let model = "";
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1)
            continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
        switch (key) {
            case "OPENAI_API_KEY":
                apiKey = value;
                break;
            case "OPENAI_API_BASE":
                apiBase = value;
                break;
            case "OPENAI_MODEL":
                model = value;
                break;
        }
    }
    return { apiKey, apiBase, model };
}
//# sourceMappingURL=pi-ai-provider.js.map