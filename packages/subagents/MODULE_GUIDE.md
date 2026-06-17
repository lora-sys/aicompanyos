# @aicos/subagents — 智能子代理模块

> 内容生成 / 审核评估 / 资料研究 / UI-UX 设计 | v0.1.0 | ESM

## 概述

`@aicos/subagents` 提供 4 个专业 Agent 子模块和 1 个 UI/UX 双模式子系统，是 AICOS 循环引擎的执行层核心。每个 Agent 封装了特定领域的专业知识与工作流，通过 `AgentExecutor` 基类实现统一的执行协议，可独立运行或被 `LoopHarness` 编排调度。

**包含子模块：**

| 子模块 | 角色 | 核心职责 |
|--------|------|----------|
| `WriterAgent` | 内容写手 | 基于 PlanStep 生成 Markdown 内容，含防漂移检测与长度裁剪 |
| `CriticAgent` | 内容审核员 | 五维评分审核 Writer 输出，支持模糊维度匹配 |
| `ResearcherAgent` | 资料研究员 | MCP + WebSearch 双通道搜索 + LLM 摘要整理 |
| `UIUXProMaxSkill/Agent` | UI/UX 设计师 | Skill（增量设计指导）+ Agent（五维审核）双模式 |

## 核心导出

### 包级导出 (`.`)

```json
{
  ".": "./dist/index.js",
  "./writer": "./dist/writer/index.js",
  "./writer/agent": "./dist/writer/agent.js",
  "./writer/types": "./dist/writer/types.js",
  "./critic": "./dist/critic/index.js",
  "./critic/agent": "./dist/critic/agent.js",
  "./critic/types": "./dist/critic/types.js"
}
```

### 导出符号一览

| 符号 | 来源路径 | 类型 |
|------|----------|------|
| `WriterAgent` | `./writer/agent` | 类 |
| `CriticAgent` | `./critic/agent` | 类 |
| `ResearcherAgent` | (researcher 模块) | 类 |
| `UIUXProMaxSkill` | (uiux 模块) | 类 |
| `UIUXProMaxAgent` | (uiux 模块) | 类 |
| `UIUXModeSwitcher` | (uiux 模块) | 类 |
| `UIUXMode` | (uiux 模块) | 枚举 |
| `WriterInput`, `WriterOutput` | `./writer/types` | 接口 |
| `CriticInput`, `CriticOutput` | `./critic/types` | 接口 |
| `GradingCriteria` | `./critic/types` | 接口/类型 |

## API 参考

---

### WriterAgent（内容写手）

**实现**: `AgentExecutor` + `IGeneratorAgent<PlanStep, WriterOutput>`

```typescript
class WriterAgent implements IGeneratorAgent<PlanStep, WriterOutput> {
  static readonly AGENT_TYPE = "writer";

  constructor(tools: ToolRegistry, llmProvider: LLMProvider)

  // AgentExecutor 协议
  execute(params: unknown): Promise<AgentResult>

  // IGeneratorAgent 协议
  generate(
    plan: PlanStep,
    feedback?: CriticOutput,
    handoff?: HandoffContext
  ): Promise<WriterOutput>
}
```

#### 内部工作流: `writingWorkflow(input)`

```
┌─────────────────────────────────────────────────────┐
│  1. getUIGuidance()                                  │
│     → 调用 UIUXProMaxSkill 获取设计指导               │
│                                                      │
│  2. research()                                       │
│     → web_search 工具搜索相关资料                      │
│                                                      │
│  3. generateContent()                                │
│     → LLM 生成内容                                    │
│     → Topic Drift 防漂移检测                          │
│     → enforceLengthLimit() 硬裁剪                     │
│                                                      │
│  4. writeArtifact()                                  │
│     → file_write 写入 ./artifacts/                    │
└─────────────────────────────────────────────────────┘
```

#### 数据模型

**WriterInput**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskId` | `string` | 任务唯一标识 |
| `planStep` | `PlanStep` | 当前步骤，context 含 interrogationResults/userPreferences/designMDX/uiuxGuidance/previousOutputs |
| `lengthConstraint` | `number` | 字数约束 |
| `languagePreference` | `string` | 语言偏好 |
| `criticFeedback` | `CriticOutput?` | 审核反馈（重写轮次时传入） |
| `rewriteRound` | `number` | 当前重写轮次 |

**WriterOutput**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `string` (Markdown) | 生成的正文内容 |
| `artifactPath` | `string` | 文件写入路径 |
| `wordCount` | `number` | 实际字数 |
| `references` | `Array<{title, url}>` | 引用来源列表 |
| `usedTools` | `string[]` | 本次调用过的工具名列表 |

---

### CriticAgent（内容审核员）

**实现**: `AgentExecutor` + `IEvaluatorAgent<WriterOutput>`

```typescript
class CriticAgent implements IEvaluatorAgent<WriterOutput> {
  static readonly AGENT_TYPE = "critic";

  constructor(llmProvider: LLMProvider, criteria: GradingCriteria)

  // AgentExecutor 协议
  execute(params: unknown): Promise<AgentResult>

  // IEvaluatorAgent 协议
  evaluate(
    output: WriterOutput,
    criteria?: GradingCriteria,
    originalTask?: unknown
  ): Promise<CriticOutput>
}
```

#### 两套 Zod Schema

| Schema | 使用场景 | 用途 |
|--------|----------|------|
| `criticOutputSchema` | `execute()` 路径 | 从原始参数解析审核结果 |
| `gradingResultSchema` | `evaluate()` 路径 | 从 WriterOutput 直接评估 |

#### evaluate() 维度模糊匹配策略

```
精确 ID 匹配 → 归一化模糊匹配 → dimensionName 字符串匹配 → 兜底默认值
```

#### 数据模型

**CriticInput**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskId` | `string` | 任务标识 |
| `writerOutput` | `WriterOutput` | 待审核的写手输出 |
| `originalTask` | `unknown` | 原始任务上下文 |
| `planStep` | `PlanStep` | 当前步骤（含 context） |

**CriticOutput**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `overallScore` | `number` | 总分（0-100） |
| `dimensions` | `Record<string, number>` | 五维评分（各维度得分） |
| `passed` | `boolean` | 是否通过审核阈值 |
| `suggestions` | `Array<{type, severity, location, description, suggestion}>` | 改进建议列表 |
| `reasoning` | `string` | 审核推理过程文本 |

---

### ResearcherAgent（资料研究员）

**实现**: 仅 `AgentExecutor`（非 IGeneratorAgent / IEvaluatorAgent）

```typescript
class ResearcherAgent extends AgentExecutor {
  constructor(tools: ToolRegistry, llmProvider: LLMProvider)
}
```

#### 三步工作流

```
searchViaMCP() → searchViaWebSearch(fallback) → summarizeSources(LLM 整理摘要)
```

#### 数据模型

**ResearcherOutput**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `sources` | `ResearchSource[]` | 资料来源列表 |
| `summary` | `string` | LLM 生成的综合摘要 |
| `sourceCount` | `number` | 找到的来源数量 |
| `usedTools` | `string[]` | 调用过的工具列表 |

**ResearchSource**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | `string` | 来源标题 |
| `url` | `string` | 来源 URL |
| `relevance` | `number` | 相关度评分 (0-1) |
| `keyPoints` | `string[]` | 关键要点提取 |
| `credibility` | `string` | 可信度评级 |

---

### UI-UX-Pro-Max 子系统

本子系统提供 **Skill** 和 **Agent** 两种运行模式，通过 `UIUXModeSwitcher` 统一管理。

#### UIUXProMaxSkill（Skill 模式）

```typescript
class UIUXProMaxSkill {
  execute(input: UIUXInput): Promise<UIUXOutput>
}
```

**执行逻辑**: 有 `currentDesignMDX` 则执行 `incrementalUpdate()`，否则执行 `generateDesignGuidance()`。

**4 个嵌套 Zod Schema**:

| Schema | 对应字段 | 说明 |
|--------|----------|------|
| `colorPaletteSchema` | 配色方案 | 主色/辅色/中性色/语义色定义 |
| `typographySchema` | 排版设置 | 字体族/字号阶梯/行高/字重 |
| `layoutSchema` | 布局模板 | 网格系统/断点/间距体系 |
| `designTokensSchema` | 设计令牌 | 圆角/阴影/动画/过渡 |

→ 组合为 `uiUXOutputSchema`

**三级回退策略**:

```
LLM Schema 解析成功 → DEFAULT 值 (confidence=0.7) → FALLBACK 兜底值 (confidence=0.3)
```

#### UIUXProMaxAgent（Agent 模式）

```typescript
class UIUXProMaxAgent {
  review(input: ReviewInput, threshold?: number): Promise<ReviewOutput>
}
```

**五维审核维度**:

| 维度 | 英文标识 | 审核内容 |
|------|----------|----------|
| 色彩和谐度 | `colorHarmony` | 配色一致性、对比度、语义色使用 |
| 排版规范 | `typography` | 字体层级、行高、可读性 |
| 布局合理性 | `layout` | 响应式、间距、对齐 |
| 视觉层级 | `visualHierarchy` | 信息优先级、焦点引导 |
| 无障碍访问 | `accessibility` | WCAG 合规、键盘导航 |

#### UIUXModeSwitcher（模式切换器）

```typescript
class UIUXModeSwitcher {
  switchToAgentMode(): void
  switchToSkillMode(): void
  execute(input: unknown): Promise<unknown>   // 自动分发到当前模式
  asSkill: UIUXProMaxSkill                    // Skill 模式实例引用
  asAgent: UIUXProMaxAgent                    // Agent 模式实例引用
}
```

#### UIUXMode 枚举

```typescript
enum UIUXMode {
  SKILL = "skill",    // Skill 模式：生成/更新设计指导文档
  AGENT = "agent"     // Agent 模式：五维审核输出结果
}
```

## 与其他模块的集成

```
┌──────────────────────────────────────────────────┐
│                   LoopHarness                     │
│         (编排 Writer ↔ Critic 循环)                │
│                                                    │
│  ┌──────────────┐    ┌──────────────┐             │
│  │  WriterAgent  │───→│ CriticAgent  │             │
│  │  (IGenerator) │←──│(IEvaluator)  │             │
│  └──────┬───────┘    └──────────────┘             │
│         │                                          │
│    getUIGuidance()                                 │
│         ↓                                          │
│  ┌────────────────────┐                           │
│  │ UIUXModeSwitcher   │                           │
│  │  ├─ Skill 模式      │                           │
│  │  └─ Agent 模式      │                           │
│  └────────────────────┘                           │
│                                                    │
│  ResearcherAgent (独立调用，不参与主循环)            │
└──────────────────────────────────────────────────┘

依赖关系:
  @aicos/loop-engine  → AgentExecutor, ToolRegistry, LLMProvider, PlanStep 等
  zod (^3.23.0)       → 所有 Schema 定义与运行时校验
```

## 开发注意事项

1. **WriterAgent 的 `enforceLengthLimit` 是硬裁剪**：在 LLM 生成后强制截断，可能破坏 Markdown 结构，建议预留 10% 余量。
2. **CriticAgent 的维度模糊匹配**：新增审核维度时需同步更新 `GradingCriteria` 定义，否则会命中兜底逻辑。
3. **UIUXProMax 三级回退**：LLM 返回异常时自动降级，`confidence` 字段可用于下游判断是否需要人工确认。
4. **ResearcherAgent 的 fallback 链**：MCP 工具不可用时自动降级到 WebSearch，两者都失败则返回空 sources。

## 相关文档

- [Loop Engine 模块指南](../loop-engine/MODULE_GUIDE.md)
- [CLI 应用模块指南](../cli/MODULE_GUIDE.md)
- [Memory 模块指南](../memory/MODULE_GUIDE.md)
