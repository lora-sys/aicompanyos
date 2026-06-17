# @aicos/cli — AICOS 命令行界面

> TUI 终端应用 / 任务编排入口 / 进化可视化 | v0.2.0 | ESM

## 概述

`@aicos/cli` 是 AICOS 系统的用户交互前端，基于 `@earendil-works/pi-tui` TUI 框架构建。它将 Loop Engine 的完整生命周期封装为一个交互式终端应用，用户可通过键盘输入提交任务、查看实时循环状态、观察进化分析结果。

**CLI 命令**: `aicos`

**核心能力**:
- 交互式任务提交与拷问（Interrogation Modal）
- 6 阶段状态机驱动的完整执行循环
- 实时 ASCII 流程可视化
- 进化分析面板（进度条 + Diff 输出）
- Artifact 管道（`.md` → `.html` 自动转换）

## 核心导出

| 符号 | 类型 | 说明 |
|------|------|------|
| `AICOSApp` / `CLIApplication` | 类 | 主应用类，TUI 入口 |
| `CLIAppState` | 接口 | 全局应用状态类型 |
| `ActiveModalType` | 类型联合 | 当前激活的弹窗类型 |
| `MCPStatus` | 类型/枚举 | MCP 连接状态 |
| `LogEntry` | 接口 | 日志条目 |

## API 参考

---

### CLIApplication（AICOSApp）主类

```typescript
class CLIApplication {
  constructor()

  // 生命周期
  async initialize(): Promise<void>    // 创建引擎实例 + 注册 Agent 到 LoopHarness
  start(): void                        // 启动 TUI 渲染循环
  render(): void                       // 主渲染帧（每 tick 调用）
  handleInput(input: string): void     // 输入分发器

  // 任务操作
  submitTask(input: string): Promise<void>  // 提交任务触发完整 executeLoop

  // 弹窗控制
  showInterrogateModal(session: InterrogationSession): void
  closeModal(): void

  // 退出
  quit(): void
}
```

#### 枝始化流程 (`initialize()`)

```
1. 初始化 LLM Provider
2. 初始化 ToolRegistry（注册所有可用工具）
3. 初始化 LoopHarness（循环引擎）
4. 初始化 ArtifactManager（制品管理）
5. 初始化 MemoryManager（记忆系统）
6. 注册 WriterAgent → LoopHarness
7. 注册 CriticAgent → LoopHarness
8. 初始化应用状态 (CLIAppState)
```

#### 输入分发器 (`handleInput`)

```
输入 → "q" / "quit"          → quit()
     → 弹窗活跃状态           → handleInterrogateInput()
     → 其他                   → submitTask(input)
```

---

### executeLoop 6 阶段状态机

```
┌─────────────┐    ┌──────────┐    ┌───────────┐
│ INTERROGATING│───→│ PLANNING │───→│ EXECUTING │
│ (拷问Modal)  │    │(PlanEngine)   │↔ VERIFYING│
└─────────────┘    └──────────┘    │(最多Replan │
                                   │  3次)      │
                    ┌──────────┐    └─────┬─────┘
                    │   DONE   │←────────┘
                    │(Artifact │    ┌───────────┐
                    │ Pipeline)│    │ EVOLVING  │
                    └──────────┘    │(进化分析+  │
                                   │ 记忆持久化)│
                                   └───────────┘
```

| 阶段 | 状态值 | 核心动作 | 关键组件 |
|------|--------|----------|----------|
| 1. 拷问 | `INTERROGATING` | 显示 InterrogateModal 收集需求 | `interrogateEngine` |
| 2. 规划 | `PLANNING` | PlanEngine 生成执行计划 | `planEngine` |
| 3. 执行 | `EXECUTING` | LoopHarness 驱动 Writer/Critic | `loopHarness`, `orchestrator` |
| 4. 验证 | `VERIFYING` | VerifyEngine 校验输出质量 | `verifyEngine` |
| 5. 进化 | `EVOLVING` | EvolutionAgent 分析 + Memory 持久化 | `evolutionAgent`, `memoryManager` |
| 6. 完成 | `DONE` | ArtifactPipeline 转换输出 | `artifactManager` |

#### 集成点详情

- **MemoryManager.initializeForTask()**: 在 EXECUTING 阶段的 `executePhase` 中调用，为当前任务初始化记忆上下文
- **TaskProfile 自动分类** (`classifyTaskProfile()`): 在 PLANNING 阶段 `runPlanningPhase()` 中调用，基于关键词启发式将任务输入映射到 5 种 TaskProfile（technical-blog / tutorial / design-doc / code-review / generic），标记到 `plan.taskProfile`
- **Memory 动态样例注入** (`injectMemoryExamples()`): 在 EXECUTING 阶段、LoopHarness 执行前调用，从 self.jsonl 查询同类型历史经验，转换为 `DynamicExample[]` 注入 LoopHarness（追加到 GradingCriteria 各维度的 examples）
- **runArtifactPipeline(result)**: 在 EXECUTING 阶段扫描所有 `.md` 文件，逐个调用 `createHTMLArtifact()` 生成对应 `.html`
- **persistEvolutionMemory()**: 将进化结果写入三个持久化文件：
  - `self.jsonl` — 系统自我经验积累
  - `user.jsonl` — 用户偏好画像更新
  - 能力成熟度数据 — 更新整体能力评分

#### v0.2.0 新增: TaskProfile 分类规则

| Profile | 触发关键词 | Pass 线 | Excellence 线 |
|---------|-----------|---------|---------------|
| `tutorial` | 教程 / how-to / 入门 / step by step / 指南 / 手把手 | 70 | **85** |
| `design-doc` | 设计文档 / 架构设计 / API 设计 / 方案 / PRD / 技术选型 | **80** | 88 |
| `code-review` | 代码审查 / code review / CR / 重构建议 / 代码质量 | **82** | **92** |
| `technical-blog` | *(默认)* | 75 | **90** |
| `generic` | *(无匹配时)* | 70 | **82** |

#### v0.2.0 新增: Memory 动态样例注入流程

```
self.jsonl (Memory)
    │
    ▼ evolution.getExperiences(30)
    │
    ├─ 过滤: taskType 匹配当前 taskProfile 或 "content-generation"
    │
    ├─ 成功经验 (type=success) → DynamicExample { score: 88 }
    │   └─ 取最近 2 条
    │
    └─ 失败经验 (type=failure) → DynamicExample { score: 42 }
        └─ 取最近 2 条
            │
            ▼ loopHarness.setDynamicExamples(examples)
                │
                ▼ buildProfileAwareCriteria()
                    │
                    └─ 追加到 GradingCriteria.dimensions[].examples[]
                        （每个维度都获得相同的动态样例）

---

### 私有成员清单

| 成员 | 类型 | 说明 |
|------|------|------|
| `tui` | `TUIInstance` | pi-tui 框架实例 |
| `state` | `CLIAppState` | 全局应用状态 |
| `stateMachine` | `StateMachine` | 6 阶段状态机实例 |
| `loopContext` | `LoopContext` | 当前循环执行上下文 |
| `interrogateEngine` | `InterrogationEngine` | 拷问引擎 |
| `planEngine` | `PlanEngine` | 规划引擎 |
| `orchestrator` | `Orchestrator` | 编排器（协调 Agent 执行） |
| `verifyEngine` | `VerifyEngine` | 验证引擎 |
| `rollbackManager` | `RollbackManager` | 回滚管理器 |
| `artifactManager` | `ArtifactManager` | 制品管理器 |
| `memoryManager` | `MemoryManager` | 记忆管理器 |
| `writerAgent` | `WriterAgent` | 写手 Agent 实例 |
| `criticAgent` | `CriticAgent` | 审核 Agent 实例 |
| `toolRegistry` | `ToolRegistry` | 工具注册表 |
| `loopHarness` | `LoopHarness` | 循环引擎 |

---

### CLIAppState 类型定义

```typescript
interface CLIAppState {
  currentTaskId: string | null;        // 当前任务 ID
  currentTaskInput?: string;           // 用户原始输入
  loopState: LoopState;                // 当前循环阶段状态
  mcpStatus: Map<string, MCPStatus>;   // MCP 连接状态映射
  activeModal: ActiveModalType;        // 当前激活的弹窗类型
  modalData?: unknown;                 // 弹窗附加数据
  logs: LogEntry[];                    // 日志条目列表
}
```

## TUI 组件

### 1. header.ts — 顶栏

| 函数 | 说明 |
|------|------|
| `buildHeaderData(state)` | 从 CLIAppState 构建顶栏数据 |
| `formatHeaderString(data)` | 格式化为终端字符串 |

**显示内容**: 当前状态标签 + 任务 ID  
**状态颜色映射**: 每种 LoopState 对应独立颜色（如 EXECUTING=绿色, VERIFYING=黄色, ERROR=红色）

### 2. loop-visualization.ts — 中央流程图

| 函数 | 说明 |
|------|------|
| `buildLoopVisualizationData(context)` | 从 LoopContext 构建 7 步流程数据 |
| `formatLoopASCII(data)` | 格式化为 7 步 ASCII art 流程图 |

**7 步流程**: Interrogate → Plan → Write → Critic → Verify → (Replan?) → Evolve → Done

### 3. sidebar.ts — 侧边栏

| 函数 | 说明 |
|------|------|
| `buildSidebarData(state)` | 构建侧边栏数据 |
| `formatSidebarString(data)` | 格式化为终端字符串 |

**显示内容**: MCP 连接状态 + 已注册工具列表

### 4. footer.ts — 底栏

| 函数 | 说明 |
|------|------|
| `buildFooterData(logs)` | 构建底栏数据 |
| `formatFooterString(data)` | 格式化为终端字符串 |

**显示内容**: 最近 6 条日志 + 快捷键提示（q=quit, ?=help 等）

### 5. evolution-panel.ts — 进化面板

| 函数 | 说明 |
|------|------|
| `buildEvolutionPanelData(result)` | 从 EvolutionResult 构建面板数据 |
| `formatEvolutionString(data)` | 格式化为终端字符串 |

**显示内容**: 进化模式标签 + 进度条 + Design/User/Self 三类 Diff 输出

### 6. interrogate-modal.ts — 拷问弹窗

```typescript
class InterrogateModal {
  // 唯一的有状态 TUI 组件
  // 双模式渲染:
  //   QuestionCard  — 显示单个问题 + 选项
  //   SummaryCard   — 显示拷问结果汇总
}
```

**特点**: 唯一维护内部状态的组件，其他组件均为纯函数式（state → string）。

## 与其他模块的集成

```
┌──────────────────────────────────────────────────────┐
│                    AICOSApp (CLI)                      │
│                                                        │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │ LoopHarness │  │PlanEngine   │  │ EvolutionAgent  │  │
│  │(编排执行)   │  │(规划阶段)    │  │(进化分析)       │  │
│  └─────┬──────┘  └──────┬──────┘  └───────┬─────────┘  │
│        │                │                 │             │
│  ┌─────▼──────┐  ┌──────▼──────┐  ┌───────▼─────────┐  │
│  │ subagents  │  │loop-engine  │  │ evolution        │  │
│  │Writer/Critic│  │(状态机/验证) │  │ memory          │  │
│  └────────────┘  └─────────────┘  └─────────────────┘  │
│                                                        │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │ pi-tui     │  │ memory      │  │ evidence-chain  │  │
│  │(TUI框架)    │  │(记忆持久化)  │  │(证据链读取)      │  │
│  └────────────┘  └─────────────┘  └─────────────────┘  │
└──────────────────────────────────────────────────────┘

依赖:
  @aicos/loop-engine  → LoopHarness, PlanEngine, VerifyEngine, LoopState 等
  @aicos/subagents    → WriterAgent, CriticAgent
  @aicos/memory       → MemoryManager, 记忆读写
  @earendil-works/pi-tui → TUI 渲染框架
```

## 开发注意事项

1. **TUI 组件纯函数化**: 除 `InterrogateModal` 外，所有组件均为 `state → string` 纯函数，便于测试。
2. **Replan 上限硬编码为 3 次**: `EXECUTING ↔ VERIFYING` 之间最多循环 3 次 Replan，超出直接进入 EVOLVING。
3. **日志保留最近 6 条**: footer 组件固定展示最近 6 条 LogEntry，避免终端刷屏。
4. **ArtifactPipeline 只处理 .md**: 扫描 artifacts 目录中所有 `.md` 文件转换为 `.html`，其他格式跳过。
5. **MCPStatus 为 Map 结构**: sidebar 通过 `Map<string, MCPStatus>` 动态展示连接状态，支持运行时增删 MCP 服务。

## 相关文档

- [SubAgents 模块指南](../subagents/MODULE_GUIDE.md)
- [Loop Engine 模块指南](../loop-engine/MODULE_GUIDE.md)
- [Evolution 模块指南](../evolution/MODULE_GUIDE.md)
- [Memory 模块指南](../memory/MODULE_GUIDE.md)
