// MCP Client Adapter — 公共 API 导出

// 类型导出
export type {
  MCPServerConfig,
  MCPToolDefinition,
  MCPToolCallRequest,
  MCPToolCallResult,
  MCPServerInfo,
} from "./types.js";
export { MCPConnectionStatus } from "./types.js";

// 核心 Client Adapter
export { MCPClientAdapter, type Event } from "./client.js";

// Exa 内置配置
export { EXA_MCP_CONFIG, EXA_WEB_SEARCH_TOOL } from "./exa.js";
