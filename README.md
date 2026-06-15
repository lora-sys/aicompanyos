<p align="center">
  <img src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=futuristic%20AI%20agent%20architecture%20diagram%2C%20glowing%20nodes%20connected%20by%20data%20streams%2C%20dark%20background%2C%20cyan%20and%20purple%20neon%20colors%2C%20tech%20blueprint%20style%2C%20minimalist%2C%20high%20quality&image_size=landscape_16_9" alt="AI Company OS" width="800"/>
</p>

<h1 align="center">AI Company OS</h1>

<p align="center">
  <strong>Loop-Driven AI Execution Harness — 8 层架构的自主内容生产与进化平台</strong>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> •
  <a href="#核心架构">架构</a> •
  <a href="#loop-engineering-harness">Loop 引擎</a> •
  <a href="#cli-使用指南">CLI</a> •
  <a href="#产物示例">产出</a>
</p>

***

## 目录

- [什么是 AI Company OS](#什么是-ai-company-os)
- [核心架构 — 8 层设计](#核心架构--8-层设计)
- [Loop Engineering Harness — 物理层焊死的闭环](#loop-engineering-harness--物理层焊死的闭环)
- [固定评估标准 — 焊死在任务开始前](#固定评估标准--焊死在任务开始前)
- [完整执行流程](#完整执行流程)
- [CLI 使用指南](#cli-使用指南)
- [产物示例](#产物示例)
- [项目结构](#项目结构)
- [技术栈](#技术栈)

***

## 什么是 AI Company OS

AI Company OS 是一个 **Loop-Driven AI Execution Harness**（循环驱动型 AI 执行框架）。它不是简单的 LLM 调用包装器，而是一个将 **Planner → Generator → Evaluator → Evolution** 四个 Agent 通过物理层约束焊死成闭环的系统。

**核心理念：**

> "Is this output good?" is hard to answer consistently, but **"does it follow our grading criteria?"** gives the system something concrete to measure against.

系统在任务开始前定义固定的评估标准，然后通过 Inner Loop（Writer→Critic 反馈环）和 Outer Loop（全局 replan）持续迭代，直到产出达到质量阈值或确认已达到平台期。

**当前状态：78/78 E2E 测试全通过 (100%)**

***

## 核心架构 — 8 层设计

<p align="center">
  <img src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=8-layer%20software%20architecture%20diagram%2C%20layers%20stacked%20vertically%20with%20arrows%20between%20them%2C%20each%20layer%20has%20a%20distinct%20color%2C%20dark%20background%2C%20neon%20glow%2C%20futuristic%20dashboard%20style&image_size=landscape_16_9" alt="8-Layer Architecture" width="900"/>
</p>

```
┌─────────────────────────────────────────────────────────────────┐
│  L8: Evolution System    ← 自进化：从每次执行中学习，更新策略     │
├─────────────────────────────────────────────────────────────────┤
│  L7: Memory System       ← 4 维记忆：任务/风格/决策/能力成熟度   │
├─────────────────────────────────────────────────────────────────┤
│  L6: Output Layer         ← 多格式产物：Markdown/Tweet/Doc/PDF  │
├─────────────────────────────────────────────────────────────────┤
│  L5: Evidence Chain       ← 完整证据链：步骤/决策/工具调用/快照   │
├─────────────────────────────────────────────────────────────────┤
│  L4: Tool Registry        ← 工具注册中心：Local + MCP + Skill     │
│     ├─ Local Tools: file_read, file_write, web_search           │
│     ├─ MCP Tools: Exa Search (可扩展)                          │
│     └─ Skill Tools: UI-UX-Pro-Max                              │
├─────────────────────────────────────────────────────────────────┤
│  L3: SubAgents            ← 专业子 Agent                         │
│     ├─ WriterAgent    → 写作（接受 Critic 反馈重写）             │
│     ├─ CriticAgent    → 审核（按固定标准评分）                  │
│     ├─ ResearcherAgent → 搜索（MCP Exa 实时资料）               │
│     └─ UIUXProMaxSkill → UI/UX 设计指导                        │
├─────────────────────────────────────────────────────────────────┤
│  L2: Loop Engine Core     ← 循环引擎（系统的"心脏"）              │
│     ├─ State Machine: idle→interrogating→planning→executing      │
│     │                 →verifying→[replan]→evolving→done        │
│     ├─ Interrogate Engine: 拷问引擎（3-5 个维度澄清需求）       │
│     ├─ Plan Engine: 规划引擎（4-6 步细粒度计划）                │
│     ├─ Consensus Lock: 共识锁（Critic + Writer 自评双票制）    │
│     ├─ Verify Engine: 验证引擎（全局质量门控）                   │
│     └─ Rollback Manager: 回滚管理器                             │
├─────────────────────────────────────────────────────────────────┤
│  L1: User Input / Task Inbox                                   │
│     CLI / TUI / API → 任务接收 → Task ID 生成                  │
└─────────────────────────────────────────────────────────────────┘
```

### 各层职责

| 层      | 名称        | 职责                  | 关键组件            |
| ------ | --------- | ------------------- | --------------- |
| **L1** | 用户输入层     | 接收任务、生成 ID          | TaskInbox       |
| **L2** | 循环引擎核心    | 状态机、拷问、规划、共识、验证     | 6 个引擎           |
| **L3** | 子 Agent 层 | 专业执行：写作/审核/搜索/设计    | 4 个 Agent       |
| **L4** | 工具注册层     | 统一工具路由：本地/MCP/Skill | ToolRegistry    |
| **L5** | 证据链层      | 记录每一步决策和执行的完整轨迹     | EvidenceChain   |
| **L6** | 输出层       | 多格式产物生成与管理          | ArtifactManager |
| **L7** | 记忆系统      | 4 维记忆：任务/风格/决策/能力   | MemoryManager   |
| **L8** | 自进化层      | 从历史执行中学习，优化策略       | EvolutionAgent  |

***

## Loop Engineering Harness — 物理层焊死的闭环

这是本系统最核心的创新。参考 frontend design harness 的三 Agent 架构（Planner → Generator → Evaluator），我们实现了 **双层嵌套循环**：

<p align="center">
  <img src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=feedback%20loop%20diagram%2C%20generator%20and%20evaluator%20connected%20in%20a%20circle%20with%20arrows%2C%20quality%20score%20going%20up%20each%20iteration%2C%20dark%20background%2C%20green%20and%20orange%20gradient%2C%20minimalist%20infographic&image_size=landscape_16_9" alt="Loop Engineering" width="900"/>
</p>

```
┌───────────────────────────────────────────────────────────────┐
│                    LOOP ENGINEERING HARNESS                     │
│                                                               │
│  ══════════════════════════════════════════════════════       │
│                    OUTER LOOP (Plan 级)                        │
│    完整执行一轮 → Verify 全局质量 → 不达标 → Replan             │
│    maxReplan: 2                                               │
│  ══════════════════════════════════════════════════════       │
│                                                               │
│    For each Writer Step in Plan:                               │
│    ══════════════════════════════════════════════════         │
│              INNER LOOP (Step 级 — 核心闭环)                   │
│                                                               │
│      ┌──────────┐     ┌──────────┐     ┌──────────┐          │
│      │ WRITER   │────▶│ CRITIC   │────▶│ Score≥85?│          │
│      │ (生成)   │     │ (审核)   │     │          │          │
│      └────▲─────┘     └────┬─────┘     └────┬─────┘          │
│           │                  │               │                 │
│           │  注入完整反馈     │          YES  │ NO              │
│           │◀─────────────────┘               ▼                 │
│           │                            ┌──────────┐          │
│           └───────────────────────────▶│ 下一步    │          │
│                                        └──────────┘          │
│           │                                                   │
│           └────▶(带着 Critic 反馈重新生成)────────────────────┘│
│                                                               │
│      maxRewrite: 3 | 每轮记录 Evidence | 退化保护              │
│    ══════════════════════════════════════════════════════     │
│                                                               │
│  ══════════════════════════════════════════════════════       │
│                    EVOLUTION (自进化)                           │
│    分析迭代趋势 → refine/pivot/accept 决策 → 更新策略          │
│  ══════════════════════════════════════════════════════       │
└───────────────────────────────────────────────────────────────┘
```

### 物理层约束清单

以下约束在代码层面被**焊死**，不依赖 LLM 的自觉性：

| 约束                       | 实现方式                            | 效果                 |
| ------------------------ | ------------------------------- | ------------------ |
| **固定评估标准**               | `GradingCriteria` 在构造时注入，运行时不可变 | Evaluator 每次输出相同维度 |
| **Critic → Writer 反馈注入** | Critic 完整报告原样拼接到 Writer prompt  | Writer 能看到所有修改建议   |
| **分数阈值 85 分**            | 未达标自动触发重写                       | 质量下限保障             |
| **平台期检测**                | 连续 2 轮同分自动接受                    | 避免空转浪费 token       |
| **退化保护**                 | 重写后分数下降则终止+保留最佳版本               | 防止越改越差             |
| **Context Reset**        | `IterationHandoff` 结构化状态交接      | 避免 context anxiety |
| **Topic 防漂移**            | 关键词匹配 + HTML 警告注入               | 防止 Writer 写偏题      |
| **篇幅控制**                 | `enforceLengthLimit(15000)` 硬裁剪 | 防止输出失控             |

***

## 固定评估标准 — 焊死在任务开始前

评估标准是整个 Loop 的"尺子"。它在任务开始前定义，Generator 和 Evaluator **共享同一套标准**，全程不变。

### 5 维度体系

```
╔══════════════════════════════════════════════════════════╗
║         Technical Writing Standard v1.0.0                 ║
║                                                          ║
║  ┌─────────────┬──────┬───────────────────────────────┐  ║
║  │ 维度         │ 权重 │ 评估重点                      │  ║
║  ├─────────────┼──────┼───────────────────────────────┤  ║
║  │ Topic Accuracy│ 25% │ 是否围绕主题？有无偏题？       │  ║
║  │ Technical Depth│25% │ 有无深入原理？代码是否生产级？ │  ║
║  │ Code Quality │ 20% │ TypeScript 类型？错误处理？    │  ║
║  │ Readability  │ 15% │ 结构清晰？过渡自然？            │  ║
║  │ Originality  │ 15% │ 有无独特见解？拒绝 AI slop？   │  ║
║  └─────────────┴──────┴───────────────────────────────┘  ║
║                                                          ║
║  通过线: ≥75分  |  优秀线: ≥90分  |  满分: 100分       ║
╚══════════════════════════════════════════════════════════╝
```

每个维度包含：

- **criteria**: 注入 Evaluator prompt 的详细评分规则
- **guidance**: 注入 Generator prompt 的优化指引
- **examples**: Few-shot 校准样例（让 Evaluator 判断对齐）

***

## 完整执行流程

以用户输入 **"写一篇关于 AI Agent 架构设计的深度技术博客"** 为例：

### Phase 1: 拷问 (Interrogate)

```
用户输入 → InterrogateEngine → 3 个结构化问题

Q1 🎯 主题方向: 您希望聚焦于 AI Agent 架构的哪个层面？
Q2 👥 目标读者: 这篇博客的目标读者群体是谁？
Q3 ✍️ 输出风格: 您期望的技术深度和写作风格？

→ 收集到 3 个维度的用户偏好
```

### Phase 2: 规划 (Plan)

```
拷问结果 + 用户原始任务 → PlanEngine → 6 步执行计划

Step1 [WRITER]: 撰写引言、AI Agent 概念定义及整体架构概览
Step2 [CRITIC]: 审核引言和架构概览的技术准确性、可读性
Step3 [WRITER]: 撰写核心章节：ReAct/Plan-and-Execute/多Agent协作
Step4 [CRITIC]: 审核核心章节的代码正确性、技术深度
Step5 [WRITER]: 撰写记忆管理、工具调用机制、总结与最佳实践
Step6 [UI-UX]: 验证 Markdown 格式规范性、排版质量
```

### Phase 3: 执行 + Inner Loop (LoopHarness)

```
Step1 [WRITER] → 产出 → Step2 [CRITIC] → score=88 ✅ PASS (1轮)

Step3 [WRITER] → 产出 → Step4 [CRITIC] → score=88 ✅ PASS (1轮)

Step5 [WRITER] → 产出 → (无 Critic 配对) → 直接通过
```

> 实际运行中，如果某步 score < 85，系统会自动：
>
> 1. 将 Critic 的完整审核报告注入 Writer 的下一次 prompt
> 2. Writer 标注"这是第 N 轮重写"
> 3. 重新生成 → 重新审核 → 直到通过或达到上限

### Phase 4: 验证 + 进化 (Verify → Evolve)

```
VerifyEngine 全局验证 → quality_score=62 → 记录到记忆
EvolutionAgent 分析 → 更新 self.md（经验）、user.md（偏好）、design.mdx（视觉DNA）
```

### Phase 5: 产物输出

```
ArtifactManager → 生成多格式产物：
├── artifacts/blog.md      (主产物，~7600 chars, 328 行)
├── artifacts/tweet.md     (Twitter 摘要)
└── artifacts/summary-doc.md (文档摘要)
```

***

## CLI 使用指南

### 安装

```bash
# 克隆项目
git clone https://github.com/aicos/aicompanyos.git
cd aicompanyos

# 安装依赖
pnpm install

# 构建
pnpm build
```

### 环境配置

```bash
# 创建 .env 文件
cat > .env << 'EOF'
OPENAI_API_KEY=your-api-key
OPENAI_API_BASE=https://api.longcat.chat/openai
OPENAI_MODEL=LongCat-2.0-Preview
EOF
```

### 启动方式

```bash
# 方式一：交互模式（TUI 终端界面）
npx tsx packages/cli/src/index.ts

# 方式二：直接执行任务
npx tsx packages/cli/src/index.ts --non-interactive "写一篇关于 XX 的技术博客"

# 方式三：管道输入
echo "帮我写一份产品文档" | npx tsx packages/cli/src/index.ts

# 方式四：查看帮助
npx tsx packages/cli/src/index.ts --help
```

### TUI 界面组件

启动后你会看到一个终端仪表板：

```
┌────────────────────────────────────────────────────────┐
│  AI Company OS v0.1.0  │  state: done  │  2026-06-15  │
├────────────────────────────┬───────────────────────────┤
│                            │                           │
│   ┌─── 状态流转图 ───┐     │   ┌─ 侧边栏 ─────────┐   │
│   │  idle             │     │   │ Tasks: 1         │   │
│   │    ↓              │     │   │ Artifacts: 3     │   │
│   │  interrogating    │     │   │ Memory: 4 dims    │   │
│   │    ↓              │     │   └──────────────────┘   │
│   │  planning         │     │                           │
│   │    ↓              │     │   ┌─ 进化面板 ───────┐   │
│   │  executing        │     │   │ Patterns: 2       │   │
│   │    ↓              │     │   │ Last evolution: OK│   │
│   │  verifying        │     │   └──────────────────┘   │
│   │    ↓              │     │                           │
│   │  evolving → done   │     │   > aicos_              │
│   └───────────────────┘     └───────────────────────────┘
├────────────────────────────┴───────────────────────────┤
│  [12:34:56] ✅ WriterAgent 执行: 产出 7646 chars       │
│  [12:35:21] ✅ CriticAgent 执行: 评分 82/100           │
│  [12:35:47] ✅ 共识流程完成: passed=true                │
└────────────────────────────────────────────────────────┘
```

**快捷键：**

| 按键      | 功能     |
| ------- | ------ |
| `Enter` | 提交/确认  |
| `Esc`   | 跳过当前步骤 |
| `Tab`   | 切换焦点   |
| `q`     | 退出应用   |

### E2E 测试

```bash
# 运行全架构测试（78 项断言）
npx tsx e2e-full-architecture.ts
```

预期输出：

```
总测试项: 78 | 通过: 78 ✅ | 失败: 0 ❌

✅ L0-INIT:    1/1    ✅ L1:        2/2    ✅ L2-SM:     9/9
✅ L2-INT:    5/5    ✅ L2-PLAN:   8/8    ✅ LOOP:      5/5
✅ L3-WRITER: 4/4    ✅ L3-CRITIC: 1/1    ✅ L2-CONS:   4/4
✅ L2-VERIFY: 3/3    ✅ L5-EC:     7/7    ✅ L7-MEM:   11/11
✅ L8-EVO:    1/1    ✅ UI:        6/6

🎉 全架构 8 层综合测试全部通过！
```

***

## 产物示例

以下是系统实际产出的 **blog.md** 内容片段（由 Loop Harness 经 Inner Loop 自动精炼后生成）：

````markdown
<!-- AI Agent 架构：从概念到工程实践 -->

> 2024 年，AI Agent 已从实验室走向生产环境。本文将深入剖析 Agent
> 的核心架构设计，帮助你在实际项目中构建可靠、可扩展的智能体系统。

## 一、什么是 AI Agent

### 1.1 定义与核心特征

AI Agent 是一个能够**感知环境、自主决策并采取行动**以实现目标的系统。

| 特征 | 说明 |
|------|------|
| **自主性** | 无需逐步指令，自行规划和执行任务 |
| **工具使用** | 调用外部 API、数据库、代码执行器等 |
| **记忆能力** | 维护短期上下文与长期知识 |
| **多步推理** | 分解复杂目标为可执行的子任务 |

## 二、ReAct 架构：Agent 的核心范式

### 2.1 思考-行动-观察循环

以下是一个基于 TypeScript 的 ReAct Agent 核心循环实现：

```typescript
class ReActAgent {
  private llm: LLMClient;
  private tools: Map<string, Tool>;

  async run(userQuery: string): Promise<string> {
    for (let i = 0; i < this.maxIterations; i++) {
      const response = await this.llm.generate(this.buildPrompt(userQuery));
      const step = this.parseResponse(response);
      if (step.action === "Final Answer") return step.actionInput;
      const tool = this.tools.get(step.action);
      step.observation = await tool.execute(step.actionInput);
    }
  }
}
````

（... 完整产物约 7600 字符，328 行，涵盖 7 个章节 ...）

```

**产物质量指标（来自实际 E2E 测试）：**

| 指标 | 值 |
|------|-----|
| 字符数 | 7,646 chars |
| 行数 | 328 lines |
| Critic 评分 | 82/100 |
| Consensus verdict | APPROVED |
| Verify 质量分 | 62/100 |
| 代码示例 | TypeScript（非 Python）✅ |
| Markdown 结构 | title + headers + code + table ✅ |

---

## 项目结构

```

aicompanyos/
├── packages/
│   ├── loop-engine/          # 🔧 核心：循环引擎 + 工具注册 + 状态机
│   │   ├── src/
│   │   │   ├── loop-module/     # 🆕 可复用 Loop Module
│   │   │   │   ├── grading-criteria.ts  # 固定评估标准 (5维度)
│   │   │   │   ├── engine.ts            # LoopModule 核心引擎
│   │   │   │   └── simple-evolution.ts  # Evolution 分析器
│   │   │   ├── loop-harness/     # Writer-Critic 反馈环
│   │   │   ├── consensus/        # 共识锁 (双票制)
│   │   │   ├── verify/           # 验证引擎
│   │   │   ├── plan/             # 规划引擎
│   │   │   ├── interrogate/      # 拷问引擎
│   │   │   ├── orchestrator/     # 执行编排器
│   │   │   ├── state-machine/    # 状态机
│   │   │   ├── tool-registry/    # 工具注册中心
│   │   │   └── utils/            # LLMStructuredOutput 等
│   │
│   ├── subagents/            # 🤖 子 Agent 实现
│   │   ├── src/
│   │   │   ├── writer/          # 写作 Agent (接受反馈重写)
│   │   │   ├── critic/          # 审核 Agent (固定标准评分)
│   │   │   ├── researcher/       # 🆕 搜索 Agent (MCP Exa)
│   │   │   └── ui-ux-pro-max/   # UI/UX 设计 Skill
│   │
│   ├── evidence-chain/       # 📋 证据链系统
│   ├── memory/              # 💾 4 维记忆系统
│   ├── mcp/                 # 🔌 MCP 协议适配 (Exa 等)
│   ├── evolution/           # 🧬 自进化系统
│   ├── config/              # ⚙️ 配置管理
│   └── cli/                 # 💻 CLI/TUI 应用入口
│
├── artifacts/               # 📦 产物输出目录
│   ├── blog.md              # 主产物 (Markdown)
│   ├── tweet.md             # Twitter 摘要
│   └── summary-doc.md       # 文档摘要
│
├── memory/                  # 🧠 持久化记忆存储
│   ├── evidence/            # 证据链 JSONL 文件
│   ├── tasks/               # 任务记忆
│   ├── styles/              # 风格记忆
│   ├── decisions/           # 决策记忆
│   ├── user.md              # 用户画像
│   ├── self.md              # 系统自省经验
│   └── design.mdx           # 视觉 DNA
│
├── e2e-full-architecture.ts # 🧪 全架构 E2E 测试 (78 项断言)
└── README.md                # 本文件

```

---

## 技术栈

| 类别 | 技术 | 用途 |
|------|------|------|
| **语言** | TypeScript 5.5+ | 全栈类型安全 |
| **构建** | pnpm workspace | Monorepo 管理 |
| **LLM 集成** | OpenAI-compatible API | LongCat-2.0-Preview |
| **JSON 验证** | Zod 3.x | 运行时 schema 校验 |
| **MCP 协议** | @aicos/mcp | 外部工具接入 (Exa) |
| **TUI** | pi-tui | 终端交互界面 |
| **测试** | tsx + 手写断言 | E2E 全架构验证 |

---

## 设计原则

1. **物理层焊死** — 不信任 LLM 的自觉性，用代码约束行为
2. **固定标准** — 评估标准在任务开始前定义，全程不变
3. **退化保护** — 重写不会无限继续，分数下降即停止
4. **Evidence First** — 每一步都有据可查，证据链不可篡改
5. **Context Reset** — 每次迭代清空上下文，通过 Handoff 传递状态
6. **Graceful Degradation** — 任何环节失败都有 fallback，不会整体崩溃

---

<p align="center">
  <img src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=minimalist%20badge%20showing%2078%20of%2078%20tests%20passing%2C%20green%20checkmark%2C%20clean%20white%20background%2C%20modern%20design&image_size=square" alt="78/78 Tests Passing" width="120"/>
</p>

<p align="center">
  <strong>78/78 E2E Tests Passing — Loop Engineering Harness 闭环达成</strong>
</p>
```

