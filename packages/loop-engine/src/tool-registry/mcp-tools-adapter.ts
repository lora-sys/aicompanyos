import type { MCPClientAdapter } from "@aicos/mcp";
import {
  ToolCategory,
  type ToolDefinition,
  type ToolExecuteRequest,
  type ToolExecuteResult,
  type ToolHandler,
} from "./types.js";

// MCP 工具映射信息
interface MCPToolMapping {
  mcpServerName: string;
  mcpOriginalName: string;
}

/**
 * MCP Tools 适配器
 * 将 MCP Server 的工具转换为统一的 ToolDefinition 格式，并负责执行调用
 */
export class MCPToolsAdapter implements ToolHandler {
  category = ToolCategory.MCP;

  // 工具名 → MCP 映射关系缓存
  private toolMappings = new Map<string, MCPToolMapping>();

  constructor(private mcpAdapter: MCPClientAdapter) {}

  /**
   * 从 MCP Server 同步工具定义
   */
  syncToolsFromMCP(): ToolDefinition[] {
    // 获取所有 MCP 工具
    const mcpTools = this.mcpAdapter.getAllTools();

    const definitions: ToolDefinition[] = [];

    for (const mcpTool of mcpTools) {
      // 构造统一工具名：serverName_toolName（避免冲突）
      const toolName = `${mcpTool.serverName}_${mcpTool.name}`;

      // 缓存映射关系
      this.toolMappings.set(toolName, {
        mcpServerName: mcpTool.serverName,
        mcpOriginalName: mcpTool.name,
      });

      // 转换为 ToolDefinition
      const definition: ToolDefinition = {
        name: toolName,
        category: ToolCategory.MCP,
        description: mcpTool.description ?? `MCP 工具: ${mcpTool.name}`,
        inputSchema: this.convertInputSchema(mcpTool.inputSchema),
        mcpServerName: mcpTool.serverName,
        mcpOriginalName: mcpTool.name,
      };

      definitions.push(definition);
    }

    return definitions;
  }

  /**
   * 执行 MCP 工具调用
   */
  async execute(request: ToolExecuteRequest): Promise<ToolExecuteResult> {
    const startTime = Date.now();

    try {
      // 查找映射关系
      const mapping = this.toolMappings.get(request.toolName);
      if (!mapping) {
        return {
          success: false,
          data: null,
          error: `未找到 MCP 工具映射: ${request.toolName}`,
          durationMs: Date.now() - startTime,
        };
      }

      // 调用 MCP Client
      const result = await this.mcpAdapter.callTool({
        toolName: mapping.mcpOriginalName,
        serverName: mapping.mcpServerName,
        arguments: request.params,
      });

      return {
        success: result.success,
        data: result.content.map((c: { text: string }) => c.text).join("\n"),
        error: result.isError ? "MCP 工具执行失败" : undefined,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      return {
        success: false,
        data: null,
        error: error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 转换 MCP inputSchema 为标准格式
   */
  private convertInputSchema(
    schema: Record<string, unknown>
  ): ToolDefinition["inputSchema"] {
    // 尝试解析 MCP 的 JSON Schema 为简化格式
    const properties: Record<
      string,
      { type: string; description: string; required?: boolean }
    > = {};
    const required: string[] = [];

    if (schema && typeof schema === "object") {
      const props = schema.properties as Record<
        string,
        { type?: string; description?: string }
      > | null;

      if (props) {
        for (const [key, prop] of Object.entries(props)) {
          properties[key] = {
            type: prop?.type ?? "string",
            description: prop?.description ?? "",
          };
        }
      }

      if (Array.isArray(schema.required)) {
        required.push(...schema.required);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }
}
