export interface MCPServerConfig {
    name: string;
    url: string;
    headers?: Record<string, string>;
    timeout?: number;
}
export interface MCPToolDefinition {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    serverName: string;
}
export interface MCPToolCallRequest {
    toolName: string;
    serverName: string;
    arguments: Record<string, unknown>;
}
export interface MCPToolCallResult {
    success: boolean;
    content: Array<{
        type: string;
        text: string;
    }>;
    isError: boolean;
    durationMs: number;
    serverName: string;
    toolName: string;
}
export declare enum MCPConnectionStatus {
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    ERROR = "error"
}
export interface MCPServerInfo {
    name: string;
    config: MCPServerConfig;
    status: MCPConnectionStatus;
    tools: MCPToolDefinition[];
    connectedAt?: Date;
    error?: string;
}
//# sourceMappingURL=types.d.ts.map