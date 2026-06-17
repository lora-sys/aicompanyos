import type { MCPClientAdapter } from "@aicos/mcp";
import {
  ToolCategory,
  type ToolDefinition,
  type ToolExecuteRequest,
  type ToolExecuteResult,
  type ToolHandler,
} from "./types.js";
// 重新导出类型
export {
  ToolCategory,
  type ToolDefinition,
  type ToolExecuteRequest,
  type ToolExecuteResult,
  type ToolHandler,
} from "./types.js";
import type { LLMProvider } from "../interrogate/types.js";
import {
  createLocalToolsHandler,
  getLocalToolDefinitions,
} from "./local-tools.js";
import { MCPToolsAdapter } from "./mcp-tools-adapter.js";
import { SkillToolsAdapter } from "./skill-tools-adapter.js";

/**
 * Tool Registry - 统一工具管理中枢
 * 支持三类工具：Local Tools、MCP Tools、Built-in Skills
 * Agent 通过 Registry 调用工具，自动路由到对应执行器
 */
export class ToolRegistry {
  // 工具定义存储
  private tools = new Map<string, ToolDefinition>();

  // 处理器映射（按类别）
  private handlers = new Map<ToolCategory, ToolHandler>();

  // 适配器引用
  private mcpAdapter?: MCPToolsAdapter;
  private skillsAdapter?: SkillToolsAdapter;

  /**
   * 注册一个工具
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, definition);
    this.handlers.set(definition.category, handler);
  }

  /**
   * 批量注册 Local Tools
   */
  registerLocalTools(llmProvider?: LLMProvider): void {
    const definitions = getLocalToolDefinitions();
    const handler = createLocalToolsHandler(llmProvider);

    for (const def of definitions) {
      this.register(def, handler);
    }
  }

  /**
   * 连接 MCP Adapter 并同步 MCP 工具
   */
  connectMCP(mcpAdapter: MCPClientAdapter): void {
    this.registerMCPTools(mcpAdapter);
  }

  /**
   * 注册 MCP 工具到 ToolRegistry
   * 从 MCPClientAdapter 获取已连接服务器的工具列表，
   * 转换为 ToolDefinition 格式并注册，同时设置 MCP 执行 handler。
   */
  registerMCPTools(mcpAdapter: MCPClientAdapter): void {
    // 创建 MCP 适配器（负责格式转换和执行转发）
    this.mcpAdapter = new MCPToolsAdapter(mcpAdapter);

    // 从 MCP Adapter 获取所有已连接服务器的工具列表，转换为 ToolDefinition 并注册
    const mcpTools = this.mcpAdapter.syncToolsFromMCP();

    for (const tool of mcpTools) {
      this.register(tool, this.mcpAdapter);
    }
  }

  /**
   * 连接 Skills Adapter
   */
  connectSkills(skillsAdapter: SkillToolsAdapter): void {
    this.skillsAdapter = skillsAdapter;
  }

  /**
   * 查找工具
   */
  find(toolName: string): ToolDefinition | undefined {
    return this.tools.get(toolName);
  }

  /**
   * 列出所有可用工具
   */
  listAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 按类别列出工具
   */
  listByCategory(category: ToolCategory): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.category === category
    );
  }

  /**
   * 执行工具调用（统一入口）
   */
  async execute(request: ToolExecuteRequest): Promise<ToolExecuteResult> {
    // 参数校验
    const validation = this.validateParams(request.toolName, request.params);
    if (!validation.valid) {
      return {
        success: false,
        data: null,
        error: `参数校验失败: ${validation.errors?.join(", ")}`,
        durationMs: 0,
      };
    }

    // 查找工具定义
    const definition = this.find(request.toolName);
    if (!definition) {
      return {
        success: false,
        data: null,
        error: `未找到工具: ${request.toolName}`,
        durationMs: 0,
      };
    }

    // 根据类别路由到对应处理器
    const handler = this.handlers.get(definition.category);
    if (!handler) {
      return {
        success: false,
        data: null,
        error: `未找到工具处理器: ${request.toolName} (${definition.category})`,
        durationMs: 0,
      };
    }

    // 执行调用（handler 内部会记录耗时）
    return handler.execute(request);
  }

  /**
   * 参数校验
   */
  validateParams(
    toolName: string,
    params: Record<string, unknown>
  ): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // 查找工具定义
    const definition = this.find(toolName);
    if (!definition) {
      errors.push(`工具不存在: ${toolName}`);
      return { valid: false, errors };
    }

    const schema = definition.inputSchema;

    // 检查必填字段
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in params) || params[field] === undefined || params[field] === null) {
          errors.push(`缺少必填参数: ${field}`);
        }
      }
    }

    // 类型基本校验
    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema.properties[key];
      if (!propSchema) continue;

      if (
        propSchema.type === "string" &&
        typeof value !== "string" &&
        value !== undefined
      ) {
        errors.push(`参数 "${key}" 应为 string 类型`);
      } else if (
        propSchema.type === "number" &&
        typeof value !== "number" &&
        value !== undefined
      ) {
        errors.push(`参数 "${key}" 应为 number 类型`);
      } else if (
        propSchema.type === "boolean" &&
        typeof value !== "boolean" &&
        value !== undefined
      ) {
        errors.push(`参数 "${key}" 应为 boolean 类型`);
      }
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  /**
   * 检查工具是否存在
   */
  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }
}
