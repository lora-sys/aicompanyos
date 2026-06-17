import type { MCPServerConfig } from "./types.js";

// Exa MCP Server 默认配置
export const EXA_MCP_CONFIG: MCPServerConfig = {
  name: "exa",
  url: "https://mcp.exa.ai/mcp",
  timeout: 60000, // 搜索可能需要更长时间
};

// 预定义的 Exa web_search 工具名
export const EXA_WEB_SEARCH_TOOL = "exa_web_search";
