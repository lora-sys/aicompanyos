import type { SidebarArea, MCPConnectionInfo, ToolInfo } from "../types.js";
/**
 * 构建侧边栏渲染数据
 */
export declare function buildSidebarData(params?: {
    mcpConnections?: MCPConnectionInfo[];
    registeredTools?: ToolInfo[];
}): SidebarArea;
/**
 * 格式化侧边栏为字符串（用于终端输出）
 */
export declare function formatSidebarString(data: SidebarArea): string;
//# sourceMappingURL=sidebar.d.ts.map