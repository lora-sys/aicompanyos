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
// web_search 工具定义已移至 MCP 层（@aicos/mcp → Exa Server）
// 本地不再注册占位定义，避免与 MCP 别名冲突
// 当 MCP 未连接时，web_search 工具将不可用（WriterAgent 会优雅降级跳过搜索）
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
                // web_search 已移至 MCP 层（通过 Exa Server 提供）
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
}
// 导出工具定义和处理器工厂函数
export function createLocalToolsHandler(llmProvider) {
    return new LocalToolsHandler(llmProvider);
}
export function getLocalToolDefinitions() {
    return [FILE_READ_DEFINITION, FILE_WRITE_DEFINITION, LLM_CALL_DEFINITION];
}
//# sourceMappingURL=local-tools.js.map