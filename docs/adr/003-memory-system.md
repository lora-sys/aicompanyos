# ADR-003: 记忆系统架构设计决策

## Status
Accepted

## Context

Loop Engineering 系统需要在多次任务执行之间持续学习和进化。这需要一个能够存储、检索和利用历史经验的记忆系统。

**记忆需求的四个维度：**

1. **任务记忆（Task Memory）**：当前任务的上下文、中间状态、迭代历史
2. **风格记忆（Style Memory）**：用户的偏好、写作风格、常用表达方式
3. **决策记忆（Decision Memory）**：过去做过的关键决策及其后果
4. **能力成熟度（Capability Maturity）**：系统自身在各领域的能力水平和成长轨迹

**为什么单一 JSON 文件不够用：**

- user.md 和 self.md 作为快照只能反映最新状态
- 无法追溯"某个字段是什么时候被更新的"、"某项能力是如何成长的"
- 增量日志对于调试、回滚和分析趋势至关重要

## Decision

采用 **四维记忆架构 + JSONL 增量日志** 的混合存储方案：

### 四维架构

```
┌────────────────────────────────────────────────────────────┐
│                    Memory System Architecture               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ TaskMemory   │  │ StyleMemory  │  │ DecisionMemory   │ │
│  │ (design.mdx) │  │ (user.md)    │  │ (self.md)        │ │
│  │              │  │              │  │ + experiences[]  │ │
│  │ • blocks[]   │  │ • profile{}  │  │ • capabilities[] │ │
│  │ • version    │  │ • fields[]   │  │ • limitations[]  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘ │
│         │                 │                 │             │
│         └─────────────────┴─────────────────┘             │
│                           │                               │
│                           ▼                               │
│              ┌────────────────────────┐                   │
│              │ CapabilityMaturity     │                   │
│              │ (self.md 内嵌)         │                   │
│              │ • proficiency 追踪      │                   │
│              │ • success/failure 计数  │                   │
│              └────────────────────────┘                   │
│                                                            │
│  ─ ─ ─ ─ ─ ─ ─ 增量日志层 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│                                                            │
│  ┌─────────────────┐  ┌─────────────────┐                │
│  │ user.jsonl      │  │ self.jsonl      │                │
│  │ (追加写入)       │  │ (追加写入)       │                │
│  │ • field_update  │  │ • experience     │                │
│  │ • profile_merge │  │ • limitation     │                │
│  └─────────────────┘  │ • capability_upd│                │
│                       └─────────────────┘                │
└────────────────────────────────────────────────────────────┘
```

### 各文件职责

| 文件 | 格式 | 写入模式 | 内容 |
|------|------|---------|------|
| `design.mdx` | JSON（完整覆盖） | overwrite | 当前任务的设计文档块（blocks 数组） |
| `user.md` | JSON（完整覆盖） | overwrite | 用户画像最新快照（profile + fields） |
| `self.md` | JSON（完整覆盖） | overwrite | 系统自记忆最新快照（experiences + capabilities + limitations） |
| `user.jsonl` | JSONL（逐行追加） | append | 用户偏好变更的增量日志 |
| `self.jsonl` | JSONL（逐行追加） | append | 系统经验/能力/限制的增量日志 |

### 为什么选择 JSONL 而非纯 JSON

| 特性 | JSON（覆盖写入） | JSONL（追加写入） |
|------|-----------------|------------------|
| 写入性能 | O(n) — 每次重写整个文件 | O(1) — 只追加一行 |
| 历史追溯 | ❌ 只有最新状态 | ✅ 每条记录带时间戳 |
| 并发安全 | 需要锁机制 | 追加操作天然原子性 |
| 文件大小 | 稳定（只存最新） | 持续增长（需定期归档） |
| 查询效率 | 解析一次即可 | 需要逐行扫描或建索引 |
| 适用场景 | 快照读取、API 响应 | 审计日志、时序分析 |

**JSONL 格式示例（user.jsonl）：**
```jsonl
{"action":"field_update","key":"preferredLanguage","value":"TypeScript","source":"inference","confidence":0.9,"timestamp":"2026-01-15T10:30:00Z"}
{"action":"profile_merge","writingStyle":"concise","timestamp":"2026-01-15T11:00:00Z"}
{"action":"field_update","key":"frameworkPreference","value":"React","source":"explicit","confidence":1.0,"timestamp":"2026-01-15T14:20:00Z"}
```

**JSONL 格式示例（self.jsonl）：**
```jsonl
{"action":"experience","pattern":"async-error-handling","type":"success","lesson":"Use Result type instead of try/catch for composable error handling","timestamp":"2026-01-15T09:00:00Z"}
{"action":"limitation","limitation":"Struggles with CSS grid layouts","source":"evaluator","severity":"medium","timestamp":"2026-01-15T10:15:00Z"}
{"action":"capability_update","capabilityName":"react-hooks","success":true,"proficiencyDelta":10,"timestamp":"2026-01-15T11:30:00Z"}
```

### 数据流向图

```
用户输入 ──→ Planner ──→ Generator(Writer)
                                    │
                                    ▼
                             Evaluator(Critic)
                          ╱              ╲
                         ▼                ▼
                   更新 design.mdx    写入评分结果
                         │                │
                         ▼                ▼
                   ┌─────────────────────────┐
                   │    Evolution Agent       │
                   │  ┌───────────────────┐  │
                   │  │ addExperience()   │──┼──→ self.md (overwrite)
                   │  │   → self.jsonl    │  │     self.jsonl (append)
                   │  ├───────────────────┤  │
                   │  │ addCapability()   │──┤
                   │  ├───────────────────┤  │
                   │  │ recordLimitation()│──┤
                   │  ├───────────────────┤  │
                   │  │ updateUserField() │──┼──→ user.md (overwrite)
                   │  │   → user.jsonl    │  │     user.jsonl (append)
                   │  └───────────────────┘  │
                   └─────────────────────────┘
                              │
                              ▼
                       下一轮 Planner（携带进化后的记忆）
```

## Consequences

### 正面影响

1. **完整的审计追踪**：任何字段的变更都有时间线记录，便于调试和回溯
2. **趋势分析能力**：可以从 JSONL 日志中计算能力成长曲线、偏好变化频率等
3. **容错恢复**：如果 self.md 损坏，可以从 self.jsonl 重建
4. **关注点分离**：快照文件供快速读取，日志文件供深度分析

### 负面影响

1. **存储增长**：JSONL 文件会持续增长，需要定期归档或清理策略
2. **双写开销**：每次更新同时写入 JSON 快照和 JSONL 日志
3. **一致性挑战**：理论上 JSON 和 JSONL 可能不一致（通过先写 JSONL 再写 JSON 的顺序缓解）

### 归档策略建议

- 当 JSONL 文件超过 10MB 或 10000 行时触发归档
- 归档格式：按月压缩为 `.jsonl.gz`
- 归档后清空原文件，从当前 self.md/user.md 快照继续
