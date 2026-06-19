# AGENTS.md — AI Company OS 开发者导航

> 本文件是 Agent（AI 编程助手 / 人类开发者）进入项目后的**第一站**。
> 所有模块文档的索引、开发规范、增量更新约定均在此处定义。

---

## 快速开始：我是新来的 Agent，该从哪读起？

```
阅读顺序建议（按依赖层级，自底向上）：

Step 1: 共识词汇
   └─ UBIQUITOUS_LANGUAGE.md          ← 领域术语表（必读）

Step 2: 基础设施层（零互相依赖）
   ├─ packages/config/MODULE_GUIDE.md    ← 全局类型契约
   ├─ packages/mcp/MODULE_GUIDE.md       ← MCP 协议适配
   ├─ packages/memory/MODULE_GUIDE.md    ← 记忆持久化系统
   └─ packages/evidence-chain/MODULE_GUIDE.md ← 证据链记录

Step 3: 核心引擎层
   └─ packages/loop-engine/MODULE_GUIDE.md ← ★ Loop 引擎核心（最复杂）

Step 4: Agent 实现层
   └─ packages/subagents/MODULE_GUIDE.md  ← Writer/Critic/Researcher/UI-UX

Step 5: 编排与进化层
   ├─ packages/evolution/MODULE_GUIDE.md  ← 自进化引擎
   └─ packages/cli/MODULE_GUIDE.md        ← CLI 入口 + TUI 组件

Step 6: 部门层（ADR-005 部门制架构）
   └─ packages/departments/content-production/ ← 内容产出部（首个部门实现）
```

---

## 模块索引

| # | 模块 | 包名 | 职责 | 层级 | 核心导出 |
|---|------|------|------|------|----------|
| 1 | [config](packages/config/MODULE_GUIDE.md) | `@aicos/config` | 全局配置类型契约 | 基础设施 | `AICOSConfig`, `LoopConfig`, `EvolutionConfig` |
| 2 | [mcp](packages/mcp/MODULE_GUIDE.md) | `@aicos/mcp` | MCP 协议客户端 + Exa 搜索 | 基础设施 | `MCPClientAdapter`, `EXA_MCP_CONFIG` |
| 3 | [memory](packages/memory/MODULE_GUIDE.md) | `@aicos/memory` | self.jsonl / user.jsonl / design.mdx 持久化 | 基础设施 | `MemoryManager`, `EvolutionDocsManager` |
| 4 | [evidence-chain](packages/evidence-chain/MODULE_GUIDE.md) | `@aicos/evidence-chain` | 执行证据链记录与回放 | 基础设施 | `EvidenceChain`, `5 种 TraceRecorder` |
| 5 | **[loop-engine](packages/loop-engine/MODULE_GUIDE.md)** | **`@aicos/loop-engine`** | **双层嵌套循环引擎（Canonical 核心）** | **核心** | **`LoopModule`, `LoopHarness`, `GradingCriteria`, `LoopStateMachine`, `TeamManager`, `TaskAnalyzer`, `HistoryReader`, `WorkerRegistry`** |
| 6 | [subagents](packages/subagents/MODULE_GUIDE.md) | `@aicos/subagents` | Writer / Critic / Researcher / UI-UX Pro Max | Agent | `WriterAgent`, `CriticAgent`, `UIUXProMaxSkill` |
| 7 | [evolution](packages/evolution/MODULE_GUIDE.md) | `@aicos/evolution` | 自进化引擎（模式提取 / 异常检测 / Diff / 合并） | 进化 | `EvolutionAgent`, `PatternExtractor`, `AnomalyDetector` |
| 8 | [cli](packages/cli/MODULE_GUIDE.md) | `@aicos/cli` | 交互式 TUI 入口 + 6 个 UI 组件 | 入口 | `CLIApplication`, `InterrogateModal` |
| 9 | [content-production](packages/departments/content-production/) | `@aicos/content-production` | 内容产出部（自媒体内容生产部门）| 部门 | `ContentProductionDepartment`, `ContentTeamManager`, `CONTENT_TEAM_RULES` |

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│              packages/departments (部门层)                           │
│   ContentProductionDepartment → DepartmentConfig (4种ContentType)    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ departmentConfig 注入
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  L2.5: Dynamic Team Layer ← 任务特征驱动的智能组队 (2-5人)          │
│     ├─ TaskAnalyzer: 7 维特征提取（规则引擎）                       │
│     ├─ TeamComposer: 8 条优先级规则匹配                            │
│     ├─ TeamManager: 编排器（组合+工厂生成）                         │
│     ├─ WorkerRegistry: 全局 Worker 注册表                          │
│     └─ HistoryReader: Memory 回流→Prompt 注入                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ team orchestration
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        packages/cli (入口层)                         │
│   CLIApplication → executeLoop() → 6 阶段状态机 → TUI 渲染           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
┌──────────────┐  ┌────────────────┐  ┌──────────────────┐
│ subagents    │  │ loop-engine    │  │ evolution         │
│              │  │ (Canonical 核心)│  │                   │
│ WriterAgent  │→ │ LoopModule     │  │ EvolutionAgent    │
│ CriticAgent  │  │ LoopHarness    │  │ PatternExtractor  │
│ Researcher   │  │ StateMachine   │  │ AnomalyDetector   │
│ UIUXProMax   │  │ GradingCriteria│  │ DiffGenerator     │
└──────┬───────┘  ├───┬──────┬─────┘  └────────┬─────────┘
       │          │   │      │               │
       │    ┌─────┘   │      └──────┬────────┘
       │    │         │             │
       ▼    ▼         ▼             ▼
┌──────────┐ ┌──────────┐  ┌──────────────┐  ┌───────────────┐
│ memory   │ │ mcp      │  │ evidence-    │  │ config        │
│          │ │          │  │ chain        │  │ (纯类型)       │
│self.jsonl│ │ Exa搜索  │  │ TraceRecorder │  │ AICOSConfig   │
│user.jsonl│ │ MCP协议  │  │ JSONL 导入导出│  │ LoopConfig    │
│design.mdx│ │          │  │              │  │ EvolutionConfig│
└──────────┘ └──────────┘  └──────────────┘  └───────────────┘
```

**依赖方向**: cli → content-production → loop-engine → memory / mcp / evidence-chain / config / evolution

> **星形拓扑**: `loop-engine` 是被最多包引用的核心基础设施。`team` 子模块是通用层（不依赖任何部门），`content-production/src/team` 是部门规则层（依赖 `loop-engine/team`）。不存在循环依赖。

---

## 关键数据流

### 端到端执行流（用户提交 Task 到产出 Artifact）

```
用户输入 "写一篇关于 XX 的文章"
    │
    ▼
┌─ INTERROGATING ──────────────────────────────┐
│  InterrogateEngine → LLM 生成澄清问题          │
│  InterrogateModal (TUI) 收集回答               │
│  输出: interrogationResults: Record<string,string>
└──────────────────────┬────────────────────────┘
                       ▼
┌─ PLANNING ────────────────────────────────────┐
│  PlanEngine.generatePlan(taskInput, results)  │
│  输出: ExecutionPlan { steps: PlanStep[] }    │
└──────────────────────┬────────────────────────┘
                       ▼
┌─ DEPARTMENT CONFIG (ADR-005) ─────────────────┤
│  ContentProductionDepartment.getConfig(type)   │
│  → DepartmentConfig {                         │
│      agentProfile, goalTemplates,              │
│      outputPipeline, qualityGate               │
│    }                                          │
│  → 注入 LoopHarness.departmentConfig           │
│  → 注入 LoopHarness.outputProcessor (回调)      │
└──────────────────────┬────────────────────────┘
                       ▼
┌─ EXECUTING × N steps ─────────────────────────┤
│  LoopHarness.executeWithLoop(plan, context)    │
│    [departmentConfig 注入:                     │
│     → Writer Prompt 替换为部门专属 prompt       │
│     → Critic 维度替换为部门质量门槛             │
│    ]                                           │
│    [outputProcessor 回调注入（避免循环依赖）:    │
│     → CLI 层传入 OutputPipeline 闭包            │
│     → executeWithLoop() 完成后自动调用           │
│     → 产出 md → html 平台适配                   │
│    ]                                           │
│     → CompletionGuard 使用部门 GoalTemplate    │
│    ]                                           │
│    └─ LoopModule.run(step) [Inner Loop]       │
│       ├─ Round 1: WriterAgent.generate()       │
│       │   └─ writingWorkflow:                  │
│       │      UIUXSkill → research → LLM → write│
│       │                                       │
│       ├─ Round 1: CriticAgent.evaluate()       │
│       │   └─ 5 维评分 → GradingResult          │
│       │                                       │
│       ├─ IterationHandoff → Round 2...4       │
│       │   (refine / pivot / accept)            │
│       │                                       │
│       └─ EvolutionAgent.analyze(history)       │
│                                               │
│  输出: HarnessExecutionResult { stepResults }  │
└──────────────────────┬────────────────────────┘
                       ▼
┌─ VERIFYING ───────────────────────────────────┐
│  VerifyEngine.verify(artifacts, originalTask)  │
│  文件存在性检查 + LLM 质量审核                  │
│  ❌ 不通过? → Replan (回到 PLANNING, ≤3 次)    │
│  ✅ 通过 → 进入 EVOLVING                       │
└──────────────────────┬────────────────────────┘
                       ▼
┌─ EVOLVING ─────────────────────────────────────┐
│  EvolutionAgent.run(artifacts, history)         │
│  persistEvolutionMemory():                      │
│    ├─ self.jsonl ← addExperience()             │
│    ├─ self.md   ← addCapability()              │
│    └─ user.jsonl← updateUserField()            │
└──────────────────────┬────────────────────────┘
                       ▼
┌─ DONE ─────────────────────────────────────────┐
│  runOutputPipeline():                          │
│    .md artifacts → OutputPipeline (部门配置)   │
│      → FormatConverter → PlatformAdapter       │
│      → ProcessedOutput (最终交付物)             │
│    (可扩展: PDF / DOCX / EPUB ...)              │
└─────────────────────────────────────────────────┘```

### Outer Loop vs Inner Loop 对比

| 维度 | Outer Loop | Inner Loop |
|------|-----------|------------|
| **范围** | 整个 Task 的执行 | 单个 PlanStep 内的迭代 |
| **驱动** | VerifyEngine 判定 | GradingResult 分数驱动 |
| **循环体** | EXECUTE → VERIFY → (Replan) | Generate → Evaluate → (Generate) |
| **上限** | MAX_OUTER_REPLANS = 3 | MAX_INNER_ROUNDS = 4 |
| **终止条件** | Verify 通过或 Replan 耗尽 | EXCELLENCE_STOP(90) 或 maxIterations |

---

## 共识词汇速查

所有领域术语的定义见 [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md)。以下是高频术语速查：

| 术语 | 一句话解释 |
|------|-----------|
| **Task** | 用户通过 CLI 提交的原始需求 |
| **Outer Loop** | 全局 replan 循环 (EXECUTE→VERIFY→PLAN, 上限 3 次) |
| **Inner Loop** | Writer→Critic 反馈环 (上限 4 轮) |
| **Round** | Inner Loop 中的一次 Generate→Evaluate |
| **Replan** | Verify 不达标时重新规划 |
| **Artifact** | Step 执行后产生的产物文件 (.md / .html) |
| **GradingCriteria** | 固定评估标准集，运行时不可变（"物理层焊死"） |
| **IterationHandoff** | Inner Loop 轮次间状态交接对象 |
| **Context Reset** | 每轮清空上下文，仅通过 Handoff 传状态 |
| **ConsensusLock** | 多视角审核（Writer 自评 + Critic 他评） |
| **退化保护** | 新版本分数低于历史最佳则回滚 |
| **Seam 模式** | 接口(I前缀) 与实现分离的设计模式 |

---

## 开发规范

### 1. 命名约定

| 类别 | 规则 | 示例 |
|------|------|------|
| Agent 接口 | `I` 前缀 | `IGeneratorAgent`, `IEvaluatorAgent` |
| Agent 实现 | 具体名称 + `Agent` 后缀 | `WriterAgent`, `CriticAgent` |
| 引擎类 | 功能名 + `Engine` 后缀 | `PlanEngine`, `VerifyEngine` |
| 管理器类 | 功能名 + `Manager` 后缀 | `MemoryManager`, `ArtifactManager` |
| 配置接口 | 大驼峰 + `Config` | `LoopModuleConfig`, `ConsensusConfig` |
| 类型导出入口 | `*-entry.ts` | `types-entry.ts`, `tools-entry.ts` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_WRITING_CRITERIA`, `EXCELLENCE_STOP` |

### 2. 接口扩展指南（如何添加新的 Agent 类型）

```typescript
// Step 1: 在 loop-engine/src/loop-module/engine.ts 定义接口
interface INewAgent<TInput, TOutput> {
  process(input: TInput, context?: Record<string, unknown>): Promise<TOutput>;
}

// Step 2: 在 types-entry.ts re-export
export type { INewAgent } from "./loop-module/index.js";

// Step 3: 在 subagents 下创建实现
// packages/subagents/new-agent/agent.ts
class NewAgent implements INewAgent<PlanStep, NewOutput> {
  // ...
}

// Step 4: 在 cli/src/app.ts 的 initialize() 中注册
this.newAgent = new NewAgent(this.toolRegistry, this.llmProvider);
```

### 3. 错误处理规范

- LLM 调用必须使用 `retryWithBackoff()` 包装
- 使用 `ErrorClassifier.classify(error)` 区分 TransientError / PermanentError
- TransientError 自动重试（默认 3 次，指数退避）
- PermanentError 直接向上抛出，不重试
- 解析失败必须有 fallback（Zod schema → 正则 → 安全默认值三级降级）

### 4. 测试规范

- 测试文件放在 `__tests__/` 目录下
- 使用 vitest 框架
- 每个 public 方法至少有 happy path + error path 用例
- 运行命令: `npm test`（根目录全量）或 `cd packages/<pkg> && npx vitest run`

---

## 增量更新约定

> **当代码发生变更时，以下文件必须同步更新。这是硬性规定。**

### 变更 → 文件映射表

| 变更范围 | 必须更新的文件 | 更新方式 |
|----------|---------------|----------|
| **新增/修改公共 API**（类/方法/接口/类型） | 对应模块的 `MODULE_GUIDE.md` | 增量修改受影响的章节（API 参考 / 导出索引） |
| **修改数据结构**（字段增删改、存储格式变更） | 对应模块的 `MODULE_GUIDE.md` + `UBIQUITOUS_LANGUAGE.md` | MODULE_GUIDE 更新数据模型章节；如涉及领域术语则更新 UBIQUITOUS_LANGUAGE |
| **新增/删除/重命名模块** | `AGENTS.md`（本文档）+ 新模块的 `MODULE_GUIDE.md` | AGENTS.md 更新模块索引表和架构图；新建对应文档 |
| **修改模块间依赖关系**（新增 import / 修改 package.json dependencies） | `AGENTS.md`（架构图 + 依赖方向）+ 涉及模块的 `MODULE_GUIDE.md` | 同步更新依赖关系章节 |
| **修改状态机转换逻辑** | `packages/loop-engine/MODULE_GUIDE.md` + `packages/cli/MODULE_GUIDE.md` + `UBIQUITOUS_LANGUAGE.md` | 三处同步更新状态转换表 |
| **修改阈值/配置常量** | `packages/loop-engine/MODULE_GUIDE.md` + `UBIQUITOUS_LANGUAGE.md` | 更新阈值表 |
| **修改 Artifact Pipeline**（新增输出格式等） | `packages/cli/MODULE_GUIDE.md` + `packages/loop-engine/MODULE_GUIDE.md` | 更新管线说明和数据流图 |
| **修改 Memory 持久化格式**（JSON/JSONL 字段变更） | `packages/memory/MODULE_GUIDE.md` + `UBIQUITOUS_LANGUAGE.md` | 更新存储布局和数据模型 |
| **新增/修改 TUI 组件** | `packages/cli/MODULE_GUIDE.md` | 更新组件清单和职责表 |

### 更新操作 Checklist

每次完成代码变更后，执行以下检查：

- [ ] 我修改了哪些文件的**公共 API**？→ 更新对应的 `MODULE_GUIDE.md`
- [ ] 是否引入了**新的领域术语**？→ 如是，追加到 `UBIQUITOUS_LANGUAGE.md`
- [ ] 是否**新增/移除/重命名**了模块？→ 更新 `AGENTS.md` 索引
- [ ] **依赖关系**是否变化？→ 更新 `AGENTS.md` 架构图
- [ ] 在 Git commit message 中标注更新的文档文件（如 `docs: update loop-engine MODULE_GUIDE.md for new retry config`）

---

## 项目命令速查

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装所有 workspace 依赖 |
| `pnpm -r build` | 全量构建 9 个包 |
| `pnpm -r build --filter=@aicos/cli` | 仅构建指定包及其依赖 |
| `npm test` | 全量运行 211 个单元测试 |
| `cd packages/<pkg> && npm run build` | 单包构建 |
| `cd packages/<pkg> && npx vitest run` | 单包测试 |
| `node packages/cli/dist/index.js` | 启动 CLI（需 .env 配置） |

---

## 文件清单

| 文件 | 用途 | 维护者 |
|------|------|--------|
| [AGENTS.md](AGENTS.md) | **本文件** — 总索引 + 开发规范 + 增量更新约定 | 全体 |
| [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) | 领域共识词汇表 | 全体 |
| [packages/config/MODULE_GUIDE.md](packages/config/MODULE_GUIDE.md) | 配置类型契约 | config 维护者 |
| [packages/mcp/MODULE_GUIDE.md](packages/mcp/MODULE_GUIDE.md) | MCP 协议适配器 | mcp 维护者 |
| [packages/memory/MODULE_GUIDE.md](packages/memory/MODULE_GUIDE.md) | 记忆持久化系统 | memory 维护者 |
| [packages/evidence-chain/MODULE_GUIDE.md](packages/evidence-chain/MODULE_GUIDE.md) | 证据链记录系统 | evidence-chain 维护者 |
| [packages/loop-engine/MODULE_GUIDE.md](packages/loop-engine/MODULE_GUIDE.md) | Loop 引擎核心 | loop-engine 维护者 |
| [team/](packages/loop-engine/src/team/) | 动态团队抽象层（6个文件+34个测试） | loop-engine 维护者 |
| [packages/subagents/MODULE_GUIDE.md](packages/subagents/MODULE_GUIDE.md) | Agent 实现（4 种） | subagents 维护者 |
| [packages/evolution/MODULE_GUIDE.md](packages/evolution/MODULE_GUIDE.md) | 自进化引擎 | evolution 维护者 |
| [packages/cli/MODULE_GUIDE.md](packages/cli/MODULE_GUIDE.md) | CLI 入口 + TUI | cli 维护者 |
| [content-production/team/](packages/departments/content-production/src/team/) | 内容产出部专属团队规则（5个文件+21个测试） | content-production 维护者 |
| [docs/adr-005-department-architecture.md](docs/adr-005-department-architecture.md) | 部门制架构（ADR-005） | 架构组 |
| [docs/adr-004-goal-driven-completion-guard.md](docs/adr-004-goal-driven-completion-guard.md) | 目标驱动停止条件体系（ADR-004） | loop-engine 维护者 |

---

*最后更新：2026-06-19 | 基于 v0.3.0 全量源码扫描（含 ADR-004/005 + Dynamic Team Layer）*
