// 侧边栏组件
// MCP 连接状态面板 + 已注册工具列表

import type { SidebarArea, MCPConnectionInfo, ToolInfo, MCPStatus } from "../types.js";

/**
 * 默认的 MCP 连接信息（初始状态）
 */
const DEFAULT_MCP_CONNECTIONS: MCPConnectionInfo[] = [
  { name: "Exa Server", status: "disconnected", toolCount: 0 },
];

/**
 * 构建侧边栏渲染数据
 */
export function buildSidebarData(params?: {
  mcpConnections?: MCPConnectionInfo[];
  registeredTools?: ToolInfo[];
}): SidebarArea {
  return {
    mcpConnections: params?.mcpConnections ?? DEFAULT_MCP_CONNECTIONS,
    registeredTools: params?.registeredTools ?? [],
  };
}

/**
 * 格式化侧边栏为字符串（用于终端输出）
 */
export function formatSidebarString(data: SidebarArea): string {
  const lines: string[] = [];

  lines.push("┌─ MCP & Tools ─────────────────────┐");

  // MCP 连接状态
  lines.push("│  Connections:                      │");
  for (const conn of data.mcpConnections) {
    const icon = getStatusIcon(conn.status);
    const statusText = capitalize(conn.status);
    lines.push(`│  ${icon} ${conn.name.padEnd(18)} ${statusText.padEnd(12)} │`);
    if (conn.status === "connected") {
      lines.push(`│    (${conn.toolCount} tools registered)`.padEnd(38) + "│");
    }
    if (conn.error) {
      lines.push(`│    Error: ${conn.error.slice(0, 24)}`.padEnd(38) + "│");
    }
  }

  // 已注册工具列表
  if (data.registeredTools.length > 0) {
    lines.push("│                                      │");
    lines.push("│  Registered Tools:                   │");
    for (const tool of data.registeredTools.slice(0, 8)) {
      lines.push(`│  • ${tool.name.padEnd(24)} [${tool.category}]`.padEnd(38) + "│");
    }
    if (data.registeredTools.length > 8) {
      lines.push(`│  ... and ${data.registeredTools.length - 8} more`.padEnd(38) + "│");
    }
  }

  lines.push("└──────────────────────────────────────┘");

  return lines.join("\n");
}

/**
 * 获取状态图标
 */
function getStatusIcon(status: MCPStatus): string {
  switch (status) {
    case "connected":
      return "🟢";
    case "disconnected":
      return "⚪";
    case "error":
      return "🔴";
  }
}

/**
 * 首字母大写
 */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
