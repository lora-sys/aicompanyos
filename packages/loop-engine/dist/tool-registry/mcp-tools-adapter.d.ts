import type { MCPClientAdapter } from "@aicos/mcp";
import { ToolCategory, type ToolDefinition, type ToolExecuteRequest, type ToolExecuteResult, type ToolHandler } from "./types.js";
/**
 * MCP Tools 适配器
 * 将 MCP Server 的工具转换为统一的 ToolDefinition 格式，并负责执行调用
 */
export declare class MCPToolsAdapter implements ToolHandler {
    private mcpAdapter;
    category: ToolCategory;
    private toolMappings;
    constructor(mcpAdapter: MCPClientAdapter);
    /**
     * 从 MCP Server 同步工具定义
     */
    syncToolsFromMCP(): ToolDefinition[];
    /**
     * 执行 MCP 工具调用
     */
    execute(request: ToolExecuteRequest): Promise<ToolExecuteResult>;
    /**
     * 转换 MCP inputSchema 为标准格式
     */
    private convertInputSchema;
}
//# sourceMappingURL=mcp-tools-adapter.d.ts.map