# @aicos/config — 全局配置类型契约

> 纯类型定义包，全局配置的类型契约 | v0.1.0 | ESM | 零依赖

## 概述

`@aicos/config` 是 AICOS 系统的**纯类型定义包**，不包含任何运行时代码。它定义了整个系统的顶层配置接口 `AICOSConfig` 及其子结构，作为配置文件的类型约束和数据契约。

本包的设计原则：
- **零运行时开销**：仅有 TypeScript 接口/类型定义，编译后产物极小
- **集中式契约**：所有配置形状在此处统一定义，避免分散在各业务模块
- **可扩展性**：`MCPServer` 使用索引签名 `[key: string]: unknown`，允许各 MCP Server 携带自定义配置字段

## 核心导出

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `AICOSConfig` | interface | 顶层配置，聚合所有子配置 |
| `MCPServer` | interface | 单个 MCP Server 配置 |
| `LoopConfig` | interface | 执行循环配置 |
| `EvolutionConfig` | interface | 进化策略配置 |

## API 参考

### AICOSConfig（顶层配置）

```typescript
interface AICOSConfig {
  mcpServers: Record<string, MCPServer>;
  loop: LoopConfig;
  evolution: EvolutionConfig;
}
```

系统的完整配置入口，三个顶级字段分别对应 MCP 服务、执行循环、进化策略。

### MCPServer（MCP Server 配置）

```typescript
interface MCPServer {
  url: string;
  [key: string]: unknown;
}
```

- `url`: MCP Server 端点地址（必填）
- 索引签名 `[key: string]: unknown`: 允许携带任意额外字段（如 `timeout`、`headers` 等），与 `@aicos/mcp` 的 `MCPServerConfig` 配合使用

### LoopConfig（执行循环配置）

```typescript
interface LoopConfig {
  maxRetries: number;         // 最大重试次数
  consensusRounds: number;    // 共识轮次
  consensusThreshold: number; // 共识阈值
}
```

控制 AICOS 主执行循环的行为参数：
- `maxRetries`: 单步失败后的最大重试次数
- `consensusRounds`: 多 Agent 共识协商的最大轮次
- `consensusThreshold`: 达成共识所需的最小同意比例（0-1 或百分比）

### EvolutionConfig（进化策略配置）

```typescript
interface EvolutionConfig {
  autoEvolve: boolean;            // 是否启用自动进化
  deepEvolveThreshold: number;    // 触发深度进化的阈值
}
```

控制系统自我进化行为：
- `autoEvolve`: 是否在满足条件时自动触发进化流程
- `deepEvolveThreshold`: 触发深度进化（而非轻量级调整）的数值阈值

## 数据模型

### 配置层次关系

```
AICOSConfig
├── mcpServers: Record<string, MCPServer>
│   └── MCPServer { url: string; [key: string]: unknown }
├── loop: LoopConfig
│   ├── maxRetries: number
│   ├── consensusRounds: number
│   └── consensusThreshold: number
└── evolution: EvolutionConfig
    ├── autoEvolve: boolean
    └── deepEvolveThreshold: number
```

### 典型配置示例

```typescript
import type { AICOSConfig } from "@aicos/config";

const config: AICOSConfig = {
  mcpServers: {
    exa: {
      url: "https://mcp.exa.ai/mcp",
      timeout: 60000,
    },
  },
  loop: {
    maxRetries: 3,
    consensusRounds: 2,
    consensusThreshold: 0.7,
  },
  evolution: {
    autoEvolve: true,
    deepEvolveThreshold: 5,
  },
};
```

## 存储布局

本包为纯类型定义，无运行时存储。配置数据通常由消费方（如 CLI 入口、主循环模块）从配置文件（JSON/YAML/TS）加载后进行类型断言。

## 依赖关系

- **零依赖** — 无任何运行时依赖或 peer dependency
- **被依赖方**：`@aicos/mcp`（`MCPServerConfig` 与 `MCPServer` 形状兼容）、loop 模块、CLI 入口等

## 开发注意事项

1. **纯类型包**：编译后的 JS 产物为空或仅包含 re-export 语句，不影响 bundle size。
2. **MCPServer vs MCPServerConfig**：本包的 `MCPServer` 使用宽松的索引签名，而 `@aicos/mcp` 的 `MCPServerConfig` 定义了更具体的字段（`name`, `url`, `headers?`, `timeout?`）。两者形状兼容但不完全相同——`MCPServerConfig` 是 `MCPServer` 的超集（增加了 name 必填字段）。在实际使用中，配置文件通常遵循 `MCPServerConfig` 形状。
3. **类型版本锁定**：由于本包是类型契约，修改接口字段属于 **breaking change**，需要同步更新所有消费方。
4. **扩展方式**：如需增加新的配置域（如 `agent: AgentConfig`），直接在本包中添加新 interface 并并入 `AICOSConfig` 即可。

## 相关文档

- [AGENTS.md](../../AGENTS.md)
