# @aicos/evidence-chain — 执行证据链系统

> 完整执行过程的证据链记录与回放系统 | v0.1.0 | ESM | 零依赖

## 概述

`@aicos/evidence-chain` 提供对 AICOS 执行全过程的**结构化追踪与回放**能力。核心设计为：

- **EvidenceChain** 作为链容器，管理一条完整执行链的所有追踪记录
- **5 种专用 TraceRecorder** 分别负责不同类型的追踪（步骤转换、LLM 决策、工具调用、状态快照、推理过程）
- 支持 **JSONL 格式**的序列化/反序列化，便于持久化和跨进程传输
- **ToolCallTraceRecorder** 是唯一有状态的 Recorder，采用 `startCall → endCall` 两阶段模式以精确计时

所有 TraceEntry 共享联合类型 `TraceEntry`，每条记录包含 UUID 级别的 `traceId` 和 ISO 8601 时间戳。

## 核心导出

| 导出项 | 类型 | 说明 |
|--------|------|------|
| `EvidenceChain` | class | 链容器，主入口 |
| `StepTraceRecorder` | class | 状态转换记录器（无状态） |
| `DecisionTraceRecorder` | class | LLM 决策记录器（无状态） |
| `ToolCallTraceRecorder` | class | 工具调用记录器（有状态，两阶段） |
| `SnapshotRecorder` | class | 系统状态快照记录器（无状态） |
| `ReasoningTraceRecorder` | class | LLM 推理过程记录器（无状态） |
| `TraceEntry` | type | 5 种 Entry 的联合类型 |
| `EvidenceChainMeta` | interface | 链元数据 |
| 各 *TraceEntry | interface | 各类型的具体接口定义 |

## API 参考

### EvidenceChain（链容器）

```typescript
class EvidenceChain {
  // 只读子记录器实例
  readonly steps: StepTraceRecorder;
  readonly decisions: DecisionTraceRecorder;
  readonly toolCalls: ToolCallTraceRecorder;
  readonly snapshots: SnapshotRecorder;
  readonly reasoning: ReasoningTraceRecorder;

  constructor(chainId: string, taskId: string, taskInput: string)

  // 记录管理
  append(entry: TraceEntry): void
  getMeta(): EvidenceChainMeta
  getEntries(): TraceEntry[]                          // 按时间升序排序
  getEntriesByType<T extends TraceEntry["type"]>(type: T): Extract<TraceEntry, { type: T }>[]
  getInRange(start: Date, end: Date): TraceEntry[]     // 按时间范围过滤

  // 序列化 / 持久化
  exportToJSONL(): string
  static importFromJSONL(jsonl: string): EvidenceChain // 工厂方法
  async saveToFile(filePath: string): Promise<void>
  static async loadFromFile(filePath: string): Promise<EvidenceChain>

  // 生命周期
  end(): void                                          // 标记 endedAt
  replay(callback: (entry: TraceEntry) => void): void  // 按时间顺序回放
}
```

- **构造参数**: `chainId`（链标识）、`taskId`（关联任务）、`taskInput`（原始输入）
- **append**: 追加记录后自动更新 meta 中的 totalEntries 和各类型计数
- **importFromJSONL**: 静态工厂方法，从 JSONL 字符串重建 EvidenceChain（chainId 格式为 `imported-{timestamp}`）
- **replay**: 对按时间排序后的每条 entry 调用回调函数

### StepTraceRecorder（状态转换）

```typescript
class StepTraceRecorder {
  record(params: {
    previousState: string
    nextState: string
    triggerReason: string
    triggeredBy: string        // 组件名称
    taskId: string
    metadata?: Record<string, unknown>
  }): StepTraceEntry
}
```

无状态工厂方法，每次调用生成一个新的 `StepTraceEntry`。

### DecisionTraceRecorder（LLM 决策）

```typescript
class DecisionTraceRecorder {
  record(params: {
    agentType: string           // writer / critic / ui-ux / evolution
    decisionPoint: string       // 决策点描述
    inputPrompt: string
    outputReasoning?: string
    finalChoice: string
    confidence?: number         // 0-1
    alternatives?: Array<{ choice: string; reasoning: string }>
    taskId: string
  }): DecisionTraceEntry
}
```

### ToolCallTraceRecorder（工具调用，有状态）

```typescript
class ToolCallTraceRecorder {
  // 开始计时，返回 traceId 用于后续 endCall 配对
  startCall(
    toolName: string,
    toolCategory: "local" | "mcp" | "skill",
    callerAgent: string,
    inputParams: Record<string, unknown>,
    taskId: string
  ): { traceId: string }

  // 结束计时，生成完整的 ToolCallTraceEntry
  endCall(
    traceId: string,
    result: unknown,
    success: boolean,
    errorMessage?: string,
    mcpServerName?: string
  ): ToolCallTraceEntry
}
```

**唯一的有状态 Recorder**。内部维护 `pendingCalls: Map<traceId, PendingCall>`，`startCall` 注册待完成调用并开始计时，`endCall` 配对后计算 `durationMs` 并从 Map 中移除。若 `traceId` 未找到则抛出错误。

### SnapshotRecorder（系统状态快照）

```typescript
class SnapshotRecorder {
  capture(params: {
    snapshotType: "pre_execute" | "post_verify" | "pre_replan" | "post_evolution" | "custom"
    loopState: string
    systemState: Record<string, unknown>  // 完整可序列化状态
    taskId: string
  }): SnapshotEntry
}
```

⚠️ 方法名是 **`capture`** 而非 `record`。

### ReasoningTraceRecorder（LLM 推理过程）

```typescript
class ReasoningTraceRecorder {
  record(params: {
    agentType: string
    inputPrompt: string
    reasoningProcess: string     // LLM 思考过程 / 中间步骤
    finalOutput: string          // 最终输出摘要
    tokenUsage?: { prompt: number; completion: number }
    modelUsed?: string
    taskId: string
  }): ReasoningTraceEntry
}
```

## 数据模型

### TraceEntry（联合类型）

所有 5 种 Entry 共享的基础字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `traceId` | `string` | UUID，全局唯一 |
| `timestamp` | `string` | ISO 8601 时间戳 |
| `taskId` | `string` | 关联任务 ID |
| `metadata` | `Record<string, unknown>?` | 可选扩展元数据 |

各类型的独有字段：

**StepTraceEntry** (`type: "step"`)
- `previousState`, `nextState`, `triggerReason`, `triggeredBy`

**DecisionTraceEntry** (`type: "decision"`)
- `agentType`, `decisionPoint`, `inputPrompt`, `outputReasoning?`, `finalChoice`, `confidence?`, `alternatives?`

**ToolCallTraceEntry** (`type: "tool_call"`)
- `toolName`, `toolCategory: "local"|"mcp"|"skill"`, `callerAgent`, `inputParams`, `outputResult`, `success`, `errorMessage?`, `durationMs`, `mcpServerName?`

**SnapshotEntry** (`type: "snapshot"`)
- `snapshotType: "pre_execute"|"post_verify"|"pre_replan"|"post_evolution"|"custom"`, `loopState`, `systemState`

**ReasoningTraceEntry** (`type: "reasoning"`)
- `agentType`, `inputPrompt`, `reasoningProcess`, `finalOutput`, `tokenUsage?`, `modelUsed?`

### EvidenceChainMeta

| 字段 | 类型 | 说明 |
|------|------|------|
| `chainId` | `string` | 链唯一标识 |
| `taskId` | `string` | 关联任务 ID |
| `taskInput` | `string` | 原始输入 |
| `startedAt` | `string` | ISO 8601 开始时间 |
| `endedAt` | `string?` | ISO 8601 结束时间（调用 `end()` 后设置） |
| `totalEntries` | `number` | 总记录数 |
| `entryCounts` | object | 各类型计数 `{ steps, decisions, toolCalls, snapshots, reasonings }` |

## 存储布局

本包不强制规定存储位置，但提供以下持久化能力：

- **exportToJSONL()** → JSON Lines 字符串（每行一个 JSON 对象）
- **saveToFile(filePath)** → 将 JSONL 写入指定文件路径
- **loadFromFile(filePath)** / **importFromJSONL(jsonl)** → 从文件/字符串重建完整链

典型用法：
```typescript
const chain = new EvidenceChain("chain-001", "task-001", "build a landing page");
// ... 追加各种记录 ...
await chain.saveToFile("./evidence/task-001.jsonl");
chain.end();

// 回放
const loaded = await EvidenceChain.loadFromFile("./evidence/task-001.jsonl");
loaded.replay((entry) => console.log(entry.type, entry.traceId));
```

## 依赖关系

- **零依赖** — 仅使用 Node.js 内置模块 (`node:fs/promises`, `node:crypto`)
- 被 loop 层调用，用于记录每次执行的完整轨迹
- 与 `@aicos/mcp` 配合：`ToolCallTraceEntry.mcpServerName` 记录 MCP 工具调用来源

## 开发注意事项

1. **ToolCallTraceRecorder 是唯一有状态的 Recorder**：必须严格配对 `startCall` / `endCall`，否则 pendingCalls Map 会泄漏内存。建议在 finally 块中调用 `endCall`。
2. **SnapshotRecorder 使用 `capture` 而非 `record`**：与其他 4 个 Recorder 命名不一致，是历史遗留命名。
3. **内存模型**：EvidenceChain 将所有 entries 保存在内存数组中。对于超长执行链（数千条记录），注意内存占用。
4. **importFromJSONL 的 chainId**：导入时自动生成 `imported-{timestamp}` 格式的 chainId，原始 chainId 信息会丢失。
5. **类型安全**：`getEntriesByType` 使用 TypeScript 条件类型，返回值自动窄化为具体 Entry 类型。

## 相关文档

- [AGENTS.md](../../AGENTS.md)
