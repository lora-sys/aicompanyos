// Tool Registry 类型定义

// 工具类别
export enum ToolCategory {
  LOCAL = "local",
  MCP = "mcp",
  SKILL = "skill",
}

// 工具定义
export interface ToolDefinition {
  name: string;
  category: ToolCategory;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        required?: boolean;
      }
    >;
    required?: string[];
  };
  // MCP 专用字段
  mcpServerName?: string;
  mcpOriginalName?: string; // MCP Server 上原始的工具名
}

// 工具执行请求
export interface ToolExecuteRequest {
  toolName: string;
  params: Record<string, unknown>;
  callerAgent: string; // 调用者 Agent 名
  taskId: string;
}

// 工具执行结果
export interface ToolExecuteResult {
  success: boolean;
  data: unknown;
  error?: string;
  durationMs: number;
}

// 工具处理器接口（每种工具类型的执行器）
export interface ToolHandler {
  category: ToolCategory;
  execute(request: ToolExecuteRequest): Promise<ToolExecuteResult>;
}
