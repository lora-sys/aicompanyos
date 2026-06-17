# @aicos/mcp — MCP 协议客户端适配器

> MCP 协议客户端适配器 + Exa 搜索工具内置实现 | v0.1.0 | ESM | 外部依赖: @modelcontextprotocol/sdk ^1.0.0

## 概述

`@aicos/mcp` 封装了 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 的客户端连接能力，为 AICOS 提供统一的工具发现与调用接口。核心特性：

- **多 Server 管理**：同时连接多个 MCP Server，各自独立的生命周期
- **事件驱动**：连接/断开/错误均有事件通知机制
- **内置 Exa 配置**：预置 Exa 搜索 MCP Server 的默认配置和工具名常量
- **StreamableHTTP 传输**：基于 HTTP 的 MCP 传输协议，适合远程 Server 场景

## 核心导出

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `MCPClientAdapter` | class | 核心 Client 适配器 |
| `Event<T>` | interface | 类型安全的事件监听接口 |
| `MCPServerConfig` | interface | Server 连接配置 |
| `MCPToolDefinition` | interface | 工具定义 |
| `MCPToolCallRequest` | interface | 工具调用请求 |
| `MCPToolCallResult` | interface | 工具调用结果 |
| `MCPServerInfo` | interface | Server 完整信息 |
| `MCPConnectionStatus` | enum | 连接状态枚举 |
| `EXA_MCP_CONFIG` | const | Exa MCP Server 默认配置 |
| `EXA_WEB_SEARCH_TOOL` | const | Exa web_search 工具名 |

## API 参考

### MCPClientAdapter

```typescript
class MCPClientAdapter {
  // === 事件（只读暴露） ===
  readonly onServerConnected: Event<MCPServerInfo>
  readonly onServerDisconnected: Event<string>          // serverName
  readonly onServerError: Event<{ name: string; error: Error }>

  constructor(config?: { defaultTimeout?: number })      // 默认 30000ms

  // === 连接管理 ===
  async connect(serverConfig: MCPServerConfig): Promise<MCPServerInfo>
  async disconnect(serverName: string): Promise<void>
  async disconnectAll(): Promise<void>
  async connectAll(servers: Record<string, MCPServerConfig>): Promise<Map<string, MCPServerInfo>>
  async reconnect(serverName: string): Promise<MCPServerInfo>

  // === 查询 ===
  getServers(): Map<string, MCPServerInfo>
  getServerTools(serverName: string): MCPToolDefinition[]
  getAllTools(): MCPToolDefinition[]                    // 合并所有 Server 的工具

  // === 调用 ===
  async callTool(request: MCPToolCallRequest): Promise<MCPToolCallResult>
  async healthCheck(serverName: string): Promise<boolean>
}
```

#### 连接流程详解

`connect(serverConfig)` 的完整流程：
1. 若同名 Server 已连接 → 先断开旧连接
2. 创建 `StreamableHTTPClientTransport`（基于 URL + headers + timeout）
3. 创建 `Client` 实例（client info: `{ name: "aicos-mcp-client", version: "0.1.0" }`）
4. 调用 `client.connect(transport)` 完成 MCP 握手
5. 调用 `client.listTools()` 发现可用工具
6. 缓存 Server 信息，发射 `onServerConnected` 事件
7. 任一步骤失败 → 设置 ERROR 状态，发射 `onServerError` 事件，抛出异常

#### callTool 行为

- 自动路由到正确的 Server（根据 `request.serverName`）
- 校验 Server 状态必须为 `CONNECTED`
- 校验工具名必须存在于该 Server 的工具列表
- 成功时返回标准化 content 数组，失败时也返回结构化错误结果（不抛异常）
- 自动记录 `durationMs`

#### reconnect 行为

保存原 Server 配置 → 断开 → 用相同配置重新 `connect`

### 预配置常量

```typescript
// Exa MCP Server 默认配置
export const EXA_MCP_CONFIG: MCPServerConfig = {
  name: "exa",
  url: "https://mcp.exa.ai/mcp",
  timeout: 60000,  // 搜索可能需要更长时间
};

// Exa web_search 工具名
export const EXA_WEB_SEARCH_TOOL = "exa_web_search";
```

典型用法：
```typescript
import { MCPClientAdapter, EXA_MCP_CONFIG, EXA_WEB_SEARCH_TOOL } from "@aicos/mcp";

const adapter = new MCPClientAdapter();
await adapter.connect(EXA_MCP_CONFIG);
const result = await adapter.callTool({
  toolName: EXA_WEB_SEARCH_TOOL,
  serverName: "exa",
  arguments: { query: "React best practices 2026", numResults: 5 },
});
```

## 数据模型

### MCPServerConfig

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | `string` | ✅ | — | Server 名称（用作 key） |
| `url` | `string` | ✅ | — | MCP Server 端点 URL |
| `headers` | `Record<string, string>` | ❌ | — | 自定义请求头 |
| `timeout` | `number` | ❌ | `30000` | 超时时间（毫秒） |

### MCPToolDefinition

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 工具名 |
| `description` | `string?` | 工具描述 |
| `inputSchema` | `Record<string, unknown>` | JSON Schema 格式的参数定义 |
| `serverName` | `string` | 所属 Server 名称 |

### MCPToolCallRequest

| 字段 | 类型 | 说明 |
|------|------|------|
| `toolName` | `string` | 要调用的工具名 |
| `serverName` | `string` | 目标 Server 名 |
| `arguments` | `Record<string, unknown>` | 调用参数 |

### MCPToolCallResult

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | `boolean` | 是否成功 |
| `content` | `Array<{ type: string; text: string }>` | 返回内容 |
| `isError` | `boolean` | 是否为错误响应 |
| `durationMs` | `number` | 耗时（毫秒） |
| `serverName` | `string` | 来源 Server |
| `toolName` | `string` | 调用的工具名 |

### MCPServerInfo

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | Server 名称 |
| `config` | `MCPServerConfig` | 连接配置 |
| `status` | `MCPConnectionStatus` | 当前状态 |
| `tools` | `MCPToolDefinition[]` | 已发现的工具列表 |
| `connectedAt` | `Date?` | 连接建立时间 |
| `error` | `string?` | 错误信息（仅在 ERROR 状态时有值） |

### MCPConnectionStatus（枚举）

| 值 | 说明 |
|----|------|
| `"disconnected"` | 未连接 |
| `"connecting"` | 连接中 |
| `"connected"` | 已连接 |
| `"error"` | 错误状态 |

### Event<T>

```typescript
interface Event<T> {
  on(listener: (data: T) => void): void
  off(listener: (data: T) => void): void
}
```

轻量级事件接口，支持订阅/取消订阅。内部实现为 `EventEmitter<T>` 类。

## 存储布局

本包为纯运行时模块，无文件系统操作。连接状态和工具缓存均保存在内存中的 `Map<string, ServerConnection>` 里。

## 依赖关系

```
@aicos/mcp
└── @modelcontextprotocol/sdk ^1.0.0    （唯一外部依赖）
    ├── Client                           (来自 client/index.js)
    └── StreamableHTTPClientTransport    (来自 client/streamableHttp.js)
```

被上层模块（loop、agents 等）调用来连接外部 MCP Server 并调用工具。

## 开发注意事项

1. **connect 的幂等性**：若同名 Server 已连接，`connect` 会先断开再重建。不会抛 "already connected" 错误。
2. **callTool 不抛异常**：即使工具调用失败，也返回 `success: false` 的 `MCPToolCallResult`。调用方需检查 `result.success` 或 `result.isError`。
3. **connectAll 容错**：批量连接时某个 Server 失败不会中断其他 Server 的连接，失败信息会被记录到返回 Map 中且触发 `onServerError` 事件。
4. **EventEmitter 异常隔离**：事件监听器的异常会被静默捕获，不会影响主流程或其他监听器。
5. **StreamableHTTP 传输**：当前仅支持 HTTP 传输（`StreamableHTTPClientTransport`），不支持 stdio 或 SSE 传输。
6. **Exa 超时配置**：`EXA_MCP_CONFIG.timeout` 设为 60000ms（60s），因为搜索操作通常耗时较长，高于默认的 30000ms。

## 相关文档

- [AGENTS.md](../../AGENTS.md)
- [MCP 规范](https://modelcontextprotocol.io)
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
