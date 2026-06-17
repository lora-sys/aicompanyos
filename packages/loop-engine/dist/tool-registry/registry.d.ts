import type { MCPClientAdapter } from "@aicos/mcp";
import { ToolCategory, type ToolDefinition, type ToolExecuteRequest, type ToolExecuteResult, type ToolHandler } from "./types.js";
export { ToolCategory, type ToolDefinition, type ToolExecuteRequest, type ToolExecuteResult, type ToolHandler, } from "./types.js";
import type { LLMProvider } from "../interrogate/types.js";
import { SkillToolsAdapter } from "./skill-tools-adapter.js";
/**
 * Tool Registry - 统一工具管理中枢
 * 支持三类工具：Local Tools、MCP Tools、Built-in Skills
 * Agent 通过 Registry 调用工具，自动路由到对应执行器
 */
export declare class ToolRegistry {
    private tools;
    private handlers;
    private mcpAdapter?;
    private skillsAdapter?;
    /**
     * 注册一个工具
     */
    register(definition: ToolDefinition, handler: ToolHandler): void;
    /**
     * 批量注册 Local Tools
     */
    registerLocalTools(llmProvider?: LLMProvider): void;
    /**
     * 连接 MCP Adapter 并同步 MCP 工具
     */
    connectMCP(mcpAdapter: MCPClientAdapter): void;
    /**
     * 注册 MCP 工具到 ToolRegistry
     * 从 MCPClientAdapter 获取已连接服务器的工具列表，
     * 转换为 ToolDefinition 格式并注册，同时设置 MCP 执行 handler。
     */
    registerMCPTools(mcpAdapter: MCPClientAdapter): void;
    /**
     * 连接 Skills Adapter
     */
    connectSkills(skillsAdapter: SkillToolsAdapter): void;
    /**
     * 查找工具
     */
    find(toolName: string): ToolDefinition | undefined;
    /**
     * 列出所有可用工具
     */
    listAll(): ToolDefinition[];
    /**
     * 按类别列出工具
     */
    listByCategory(category: ToolCategory): ToolDefinition[];
    /**
     * 执行工具调用（统一入口）
     */
    execute(request: ToolExecuteRequest): Promise<ToolExecuteResult>;
    /**
     * 参数校验
     */
    validateParams(toolName: string, params: Record<string, unknown>): {
        valid: boolean;
        errors?: string[];
    };
    /**
     * 检查工具是否存在
     */
    has(toolName: string): boolean;
}
//# sourceMappingURL=registry.d.ts.map