import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCPConnectionStatus } from "./types.js";
// 轻量级事件发射器
class EventEmitter {
    listeners = new Set();
    on(listener) {
        this.listeners.add(listener);
    }
    off(listener) {
        this.listeners.delete(listener);
    }
    emit(data) {
        for (const listener of this.listeners) {
            try {
                listener(data);
            }
            catch {
                // 忽略监听器异常
            }
        }
    }
}
const DEFAULT_TIMEOUT = 30000;
/**
 * MCP Client Adapter — 连接任意 MCP Server，发现工具，统一调用接口。
 */
export class MCPClientAdapter {
    servers = new Map();
    defaultTimeout;
    /** Server 已连接事件 */
    onServerConnected;
    _onServerConnected;
    /** Server 已断开事件 */
    onServerDisconnected;
    _onServerDisconnected;
    /** Server 错误事件 */
    onServerError;
    _onServerError;
    constructor(config) {
        this.defaultTimeout = config?.defaultTimeout ?? DEFAULT_TIMEOUT;
        this._onServerConnected = new EventEmitter();
        this.onServerConnected = this._onServerConnected;
        this._onServerDisconnected = new EventEmitter();
        this.onServerDisconnected = this._onServerDisconnected;
        this._onServerError = new EventEmitter();
        this.onServerError = this._onServerError;
    }
    /**
     * 连接一个 MCP Server
     * 流程：创建 Transport → 创建 Client → connect → listTools → 缓存结果
     */
    async connect(serverConfig) {
        const name = serverConfig.name;
        const timeout = serverConfig.timeout ?? this.defaultTimeout;
        // 如果已有连接，先断开旧连接
        if (this.servers.has(name)) {
            await this.disconnect(name);
        }
        // 更新状态为连接中
        const info = {
            name,
            config: serverConfig,
            status: MCPConnectionStatus.CONNECTING,
            tools: [],
        };
        this.servers.set(name, { client: null, transport: null, info });
        try {
            // 创建 Streamable HTTP Transport（远程 MCP Server 均通过 HTTP）
            const url = new URL(serverConfig.url);
            const transport = new StreamableHTTPClientTransport(url, {
                requestInit: {
                    headers: serverConfig.headers,
                    signal: AbortSignal.timeout(timeout),
                },
            });
            // 创建 MCP Client
            const client = new Client({ name: "aicos-mcp-client", version: "0.1.0" }, { enforceStrictCapabilities: false });
            // 建立连接（内部会完成 initialize 握手）
            await client.connect(transport);
            // 获取工具列表
            const toolsResponse = await client.listTools(undefined, { timeout });
            const tools = toolsResponse.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
                serverName: name,
            }));
            // 更新状态为已连接
            info.status = MCPConnectionStatus.CONNECTED;
            info.tools = tools;
            info.connectedAt = new Date();
            // 保存连接实例
            const conn = this.servers.get(name);
            conn.client = client;
            conn.transport = transport;
            conn.info = info;
            this._onServerConnected.emit(info);
            return info;
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            info.status = MCPConnectionStatus.ERROR;
            info.error = error.message;
            this.servers.delete(name);
            this._onServerError.emit({ name, error });
            throw new Error(`MCP Server "${name}" 连接失败: ${error.message}`);
        }
    }
    /**
     * 断开指定 Server
     */
    async disconnect(serverName) {
        const conn = this.servers.get(serverName);
        if (!conn)
            return;
        try {
            await conn.client.close();
        }
        catch {
            // 关闭失败也继续清理
        }
        this.servers.delete(serverName);
        this._onServerDisconnected.emit(serverName);
    }
    /**
     * 断开所有 Server
     */
    async disconnectAll() {
        const names = [...this.servers.keys()];
        await Promise.allSettled(names.map((name) => this.disconnect(name)));
    }
    /**
     * 从配置批量连接多个 Server
     */
    async connectAll(servers) {
        const results = new Map();
        const entries = Object.entries(servers);
        for (const [key, config] of entries) {
            // 确保使用 key 作为 name（如果 config 中未设置）
            const finalConfig = config.name ? config : { ...config, name: key };
            try {
                const info = await this.connect(finalConfig);
                results.set(key, info);
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                this._onServerError.emit({ name: key, error });
                // 记录失败的连接信息到 results
                results.set(key, {
                    name: key,
                    config: finalConfig,
                    status: MCPConnectionStatus.ERROR,
                    tools: [],
                    error: error.message,
                });
            }
        }
        return results;
    }
    /**
     * 获取已连接的所有 Server 信息
     */
    getServers() {
        const result = new Map();
        for (const [name, conn] of this.servers) {
            result.set(name, { ...conn.info });
        }
        return result;
    }
    /**
     * 获取指定 Server 的工具列表
     */
    getServerTools(serverName) {
        const conn = this.servers.get(serverName);
        if (!conn) {
            throw new Error(`MCP Server "${serverName}" 未连接`);
        }
        return [...conn.info.tools];
    }
    /**
     * 获取所有 Server 的所有工具（合并）
     */
    getAllTools() {
        const tools = [];
        for (const conn of this.servers.values()) {
            tools.push(...conn.info.tools);
        }
        return tools;
    }
    /**
     * 调用工具（自动路由到正确的 Server）
     */
    async callTool(request) {
        const { toolName, serverName, arguments: args } = request;
        const conn = this.servers.get(serverName);
        if (!conn) {
            throw new Error(`MCP Server "${serverName}" 未连接或不存在`);
        }
        if (conn.info.status !== MCPConnectionStatus.CONNECTED) {
            throw new Error(`MCP Server "${serverName}" 当前状态为 ${conn.info.status}，无法调用工具`);
        }
        // 验证工具是否存在
        const toolExists = conn.info.tools.some((t) => t.name === toolName);
        if (!toolExists) {
            throw new Error(`工具 "${toolName}" 在 MCP Server "${serverName}" 上不存在`);
        }
        const startTime = Date.now();
        const timeout = conn.info.config.timeout ?? this.defaultTimeout;
        try {
            const result = (await conn.client.callTool({ name: toolName, arguments: args }, undefined, { timeout }));
            const durationMs = Date.now() - startTime;
            // 标准化返回内容
            const content = Array.isArray(result.content)
                ? result.content.map((c) => ({
                    type: c.type,
                    text: c.text ?? JSON.stringify(c),
                }))
                : [];
            return {
                success: !(result.isError === true),
                content,
                isError: result.isError ?? false,
                durationMs,
                serverName,
                toolName,
            };
        }
        catch (err) {
            const durationMs = Date.now() - startTime;
            const error = err instanceof Error ? err : new Error(String(err));
            return {
                success: false,
                content: [{ type: "text", text: error.message }],
                isError: true,
                durationMs,
                serverName,
                toolName,
            };
        }
    }
    /**
     * 健康检查：发送 ping 验证连接是否正常
     */
    async healthCheck(serverName) {
        const conn = this.servers.get(serverName);
        if (!conn || conn.info.status !== MCPConnectionStatus.CONNECTED) {
            return false;
        }
        try {
            const timeout = conn.info.config.timeout ?? this.defaultTimeout;
            await conn.client.ping({ timeout });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * 重连指定 Server
     */
    async reconnect(serverName) {
        const conn = this.servers.get(serverName);
        if (!conn) {
            throw new Error(`MCP Server "${serverName}" 未找到，无法重连`);
        }
        // 保存原始配置
        const config = conn.info.config;
        // 断开旧连接
        await this.disconnect(serverName);
        // 用相同配置重新连接
        return this.connect(config);
    }
}
//# sourceMappingURL=client.js.map