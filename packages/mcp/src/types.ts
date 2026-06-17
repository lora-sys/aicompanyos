// MCP Server 配置
export interface MCPServerConfig {
  name: string;
  url: string;
  headers?: Record<string, string>;
  timeout?: number; // ms, 默认 30000
}

// MCP 工具定义
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  serverName: string;
}

// MCP 工具调用请求
export interface MCPToolCallRequest {
  toolName: string;
  serverName: string;
  arguments: Record<string, unknown>;
}

// MCP 工具调用结果
export interface MCPToolCallResult {
  success: boolean;
  content: Array<{ type: string; text: string }>;
  isError: boolean;
  durationMs: number;
  serverName: string;
  toolName: string;
}

// MCP Server 连接状态
export enum MCPConnectionStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
}

// MCP Server 信息
export interface MCPServerInfo {
  name: string;
  config: MCPServerConfig;
  status: MCPConnectionStatus;
  tools: MCPToolDefinition[];
  connectedAt?: Date;
  error?: string;
}
