import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { ToolCategory, } from "./types.js";
// file_read 工具定义
const FILE_READ_DEFINITION = {
    name: "file_read",
    category: ToolCategory.LOCAL,
    description: "读取本地文件内容",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "文件路径",
                required: true,
            },
        },
        required: ["path"],
    },
};
// file_write 工具定义
const FILE_WRITE_DEFINITION = {
    name: "file_write",
    category: ToolCategory.LOCAL,
    description: "写入内容到本地文件（自动创建目录）",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "文件路径",
                required: true,
            },
            content: {
                type: "string",
                description: "要写入的内容",
                required: true,
            },
        },
        required: ["path", "content"],
    },
};
// llm_call 工具定义
const LLM_CALL_DEFINITION = {
    name: "llm_call",
    category: ToolCategory.LOCAL,
    description: "通用 LLM 调用",
    inputSchema: {
        type: "object",
        properties: {
            prompt: {
                type: "string",
                description: "用户提示词",
                required: true,
            },
            systemPrompt: {
                type: "string",
                description: "系统提示词（可选）",
            },
        },
        required: ["prompt"],
    },
};
// web_search 工具定义（Internet Capability Layer - Exa 搜索）
const WEB_SEARCH_DEFINITION = {
    name: "web_search",
    category: ToolCategory.LOCAL,
    description: "互联网搜索工具，通过 Exa 搜索引擎检索实时网页信息",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "搜索查询关键词",
                required: true,
            },
            numResults: {
                type: "number",
                description: "返回结果数量（默认 5，最大 10）",
            },
            category: {
                type: "string",
                description: "搜索类别：research/news/wiki/company 等",
            },
        },
        required: ["query"],
    },
};
// Local Tools 处理器
class LocalToolsHandler {
    llmProvider;
    category = ToolCategory.LOCAL;
    constructor(llmProvider) {
        this.llmProvider = llmProvider;
    }
    async execute(request) {
        const startTime = Date.now();
        try {
            let data;
            switch (request.toolName) {
                case "file_read":
                    data = await this.handleFileRead(request.params);
                    break;
                case "file_write":
                    data = await this.handleFileWrite(request.params);
                    break;
                case "llm_call":
                    data = await this.handleLLMCall(request.params);
                    break;
                case "web_search":
                    data = await this.handleWebSearch(request.params);
                    break;
                default:
                    return {
                        success: false,
                        data: null,
                        error: `未知的本地工具: ${request.toolName}`,
                        durationMs: Date.now() - startTime,
                    };
            }
            return {
                success: true,
                data,
                durationMs: Date.now() - startTime,
            };
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            return {
                success: false,
                data: null,
                error: error.message,
                durationMs: Date.now() - startTime,
            };
        }
    }
    // 读取文件
    async handleFileRead(params) {
        const { path: filePath } = params;
        if (!filePath)
            throw new Error("缺少必要参数: path");
        const content = await readFile(filePath, "utf-8");
        return content;
    }
    // 写入文件
    async handleFileWrite(params) {
        const { path: filePath, content } = params;
        if (!filePath)
            throw new Error("缺少必要参数: path");
        if (content === undefined || content === null)
            throw new Error("缺少必要参数: content");
        // 自动创建不存在的目录
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf-8");
        return `成功写入文件: ${filePath}`;
    }
    // LLM 调用
    async handleLLMCall(params) {
        const { prompt, systemPrompt } = params;
        if (!prompt)
            throw new Error("缺少必要参数: prompt");
        if (!this.llmProvider)
            throw new Error("LLM Provider 未配置，无法调用 llm_call 工具");
        // 构造消息数组
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: prompt });
        return this.llmProvider.chat(messages);
    }
    // Web 搜索（Internet Capability Layer - 通过 MCP Exa 转发）
    // 注意：实际执行时会优先路由到已注册的 MCP 工具（如 exa_exa_web_search），
    // 此处作为本地 fallback 定义，当 MCP 未连接时返回提示信息
    async handleWebSearch(params) {
        const { query, numResults, category } = params;
        if (!query)
            throw new Error("缺少必要参数: query");
        // 如果没有配置 MCP 搜索能力，返回提示
        throw new Error("web_search 需要 Exa MCP Server 连接。请先通过 registry.registerMCPTools(mcpAdapter) 注册 MCP 工具，" +
            "然后使用 exa_exa_web_search 工具进行搜索。" +
            (category ? `\n原始查询: ${query} (类别: ${category})` : `\n原始查询: ${query}`));
    }
}
// 导出工具定义和处理器工厂函数
export function createLocalToolsHandler(llmProvider) {
    return new LocalToolsHandler(llmProvider);
}
export function getLocalToolDefinitions() {
    return [FILE_READ_DEFINITION, FILE_WRITE_DEFINITION, LLM_CALL_DEFINITION, WEB_SEARCH_DEFINITION];
}
//# sourceMappingURL=local-tools.js.map