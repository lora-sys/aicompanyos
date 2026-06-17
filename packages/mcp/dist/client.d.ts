import type { MCPServerConfig, MCPServerInfo, MCPToolDefinition, MCPToolCallRequest, MCPToolCallResult } from "./types.js";
export interface Event<T> {
    on(listener: (data: T) => void): void;
    off(listener: (data: T) => void): void;
}
/**
 * MCP Client Adapter — 连接任意 MCP Server，发现工具，统一调用接口。
 */
export declare class MCPClientAdapter {
    private readonly servers;
    private readonly defaultTimeout;
    /** Server 已连接事件 */
    readonly onServerConnected: Event<MCPServerInfo>;
    private _onServerConnected;
    /** Server 已断开事件 */
    readonly onServerDisconnected: Event<string>;
    private _onServerDisconnected;
    /** Server 错误事件 */
    readonly onServerError: Event<{
        name: string;
        error: Error;
    }>;
    private _onServerError;
    constructor(config?: {
        defaultTimeout?: number;
    });
    /**
     * 连接一个 MCP Server
     * 流程：创建 Transport → 创建 Client → connect → listTools → 缓存结果
     */
    connect(serverConfig: MCPServerConfig): Promise<MCPServerInfo>;
    /**
     * 断开指定 Server
     */
    disconnect(serverName: string): Promise<void>;
    /**
     * 断开所有 Server
     */
    disconnectAll(): Promise<void>;
    /**
     * 从配置批量连接多个 Server
     */
    connectAll(servers: Record<string, MCPServerConfig>): Promise<Map<string, MCPServerInfo>>;
    /**
     * 获取已连接的所有 Server 信息
     */
    getServers(): Map<string, MCPServerInfo>;
    /**
     * 获取指定 Server 的工具列表
     */
    getServerTools(serverName: string): MCPToolDefinition[];
    /**
     * 获取所有 Server 的所有工具（合并）
     */
    getAllTools(): MCPToolDefinition[];
    /**
     * 调用工具（自动路由到正确的 Server）
     */
    callTool(request: MCPToolCallRequest): Promise<MCPToolCallResult>;
    /**
     * 健康检查：发送 ping 验证连接是否正常
     */
    healthCheck(serverName: string): Promise<boolean>;
    /**
     * 重连指定 Server
     */
    reconnect(serverName: string): Promise<MCPServerInfo>;
}
//# sourceMappingURL=client.d.ts.map