# AI 公司 OS v3 — 桌面端 Ticket Harness 设计

> 重新设计，只保留思路，代码推倒重来
> 范围：单部门（内容/自媒体），跑通 ticket → 认领 → 执行 → 交付 完整闭环
> 设计依据：Anthropic《Effective harnesses for long-running agents》《Harness design for long-running application development》+ awesome-harness-engineering 列表中的 12-Factor Agents / Ralph Wiggum / OpenHands context condensation

---

## 0. 这版要解决什么，明确不做什么

### 解决
- 写一个 ticket，系统能展开成可验证的具体目标
- 自动跑完 Writer/Critic 循环，但"完成"判定要有真实证据，不是 LLM 自己说完成了
- 桌面端 UI：提交 ticket、看进度、看每个 ticket 的产物+证据
- 单 ticket 可以跨多次启动续跑（关掉 app 重开不丢状态）
- 经验沉淀但有上限，不会无限堆砌

### 明确不做（这版）
- 不做 CEO/COO 多层 Agent 人格
- 不做动态团队组建（TaskAnalyzer 正则匹配团队）——只有一个部门，没有团队可组
- 不做 Web 仪表盘 / WebSocket 对外服务——桌面 UI 本身就是仪表盘
- 不做偏好学习模型——先看 memory 回流本身有没有用，再谈要不要加一层学习
- 不做多部门调度/抢单——只有一个部门，"认领"这一步先做成接口，逻辑先留空

这些不是否定，是排序。等内容部门这套闭环真正跑顺、跑了足够多真实 ticket 之后，再回头看是否需要。

---

## 1. 技术栈

| 层 | 选择 | 理由 |
|---|---|---|
| 桌面壳 | Tauri (Rust) | 体积小、原生打包、系统托盘/通知/keychain 都是现成能力 |
| 前端 | React (Tauri webview) | UI 状态展示，提交 ticket，看 board |
| 引擎 | Node.js sidecar (TypeScript) | Anthropic SDK / MCP 生态在 TS 里最成熟，不重写 Rust 版 harness |
| 进程间通信 | sidecar 起一个 localhost-only WebSocket，前端直连 | 比走 Tauri command 转发更省一层封装，又能直接做日志/进度的流式推送 |
| 持久化 | SQLite（sidecar 内用 better-sqlite3） | 单文件、零配置、足够支撑单机 ticket 量级 |
| 凭证 | OS keychain（Tauri 插件） | API key 不进明文配置文件 |

Tauri 只负责：开窗口、托盘图标、完成通知、管理 sidecar 进程生命周期（启动/重启/退出时杀掉）、打包成单一可执行文件。**所有 harness 逻辑都在 sidecar 里**，Rust 层不接触 Writer/Critic/Planner 这些概念。这样你完全沿用现有对 TypeScript + LLM SDK 的开发经验，Tauri 只是个"壳"。

---

## 2. Ticket 生命周期（核心设计）

这是整个系统的脊柱，对应上面的图。每个阶段在解决 Anthropic 两篇文章里点名的某个具体失败模式。

### 2.1 Inbox（提交）
用户在 UI 写一句话或几句话的 ticket，附加可选字段：内容类型（article/seed/short-video/newsletter）、截止偏好、参考资料链接。提交即落库，状态 `inbox`。

### 2.2 Planner（展开）—— 对应"agent 提前宣布完成"问题
这是现有系统完全缺失的一环。Planner 是一次性调用，把模糊的 ticket 展开成**结构化、可勾选的验收清单**，而不是让 Writer/Critic 直接对着一句话原文反复打磨。

```typescript
interface TicketSpec {
  ticketId: string;
  originalRequest: string;        // 锚定，物理焊死，全程不变
  contentType: ContentType;
  acceptanceCriteria: AcceptanceCriterion[];
  targetLength?: { min: number; max: number };
  constraints: string[];          // 来自 ticket 原文的硬约束，如"不能提价格"
}

interface AcceptanceCriterion {
  id: string;
  description: string;            // "必须包含至少 2 个真实案例"
  verifyMethod: "deterministic" | "llm_judge";
  passed: boolean;
  evidence?: string;               // 验证时记录的依据
}
```

**关键设计**：每条 acceptanceCriterion 在创建时就要标注 `verifyMethod`。Planner 被明确要求"能写成可编程检查的就不要写成主观判断"——这一步直接决定了第 4 步验证的质量上限。

### 2.3 Writer ↔ Critic（执行）—— 复用你已验证过的核心循环
物理焊死的 5 条原样保留：

1. GradingCriteria 5 维不可变
2. Critic 反馈完整注入下一轮
3. originalRequest 锚定在每个 prompt 顶部（现在多了一层：TicketSpec 也锚定）
4. 退化保护，最佳版本永不丢失
5. 最大迭代强制

唯一的变化：Critic 现在不止打 5 维分数，还要**逐条对照 acceptanceCriteria**，标记哪些条目本轮满足了。Writer 收到的反馈里，除了维度分数和文字意见，还有一份"还差哪几条没满足"的清单。这让循环的目标从"让 Critic 觉得满意"变成"把清单上的项打满"，更具体，更不容易出现"Critic 也在划水"的情况——因为清单本身有客观项打底。

### 2.4 Verification（验证）—— 对应"agent 自我评估不可靠"问题
这是新加的、也是最重要的一层。两篇 Anthropic 文章反复强调同一件事：**分离 generator 和 evaluator 本身不够，evaluator 必须做真实验证，不能只是"读了觉得还行"**。

verification 按 criterion 的 `verifyMethod` 分流：

- **deterministic**：字数范围、是否包含 ticket 要求的关键点（结构/关键词检查）、Markdown 格式是否合法、链接是否可达、是否有禁用词。这些用代码跑，不调 LLM，零主观。
- **llm_judge**：真正无法程序化的主观项（"语气是否符合品牌调性"），才交给独立的 Evaluator 角色判断——这个角色和 Writer/Critic 物理隔离，不知道 Writer 写作过程中的"自我感觉"，只看最终产物判断。

只有 deterministic 检查全过、且 llm_judge 项也通过，ticket 才能进 `done`。任何一项 deterministic 失败，直接打回 Writer ↔ Critic 循环并把具体失败原因带回去（而不是泛泛的"质量不够"）——这是图里那条虚线回退箭头。

### 2.5 Done（交付 + 证据包）
完成的 ticket 产出一个证据包，这是你最初提的"看任务完成情况，每个 ticket 有产物和证据"的直接落地：

```typescript
interface EvidenceBundle {
  ticketId: string;
  finalArtifact: { path: string; preview: string };
  acceptanceCriteria: AcceptanceCriterion[];  // 每条标注 passed + evidence
  rounds: RoundRecord[];        // 每轮 writer 输出 + critic 反馈 + 分数
  verificationLog: VerificationResult[];  // 每个 deterministic 检查的具体输出
  totalRounds: number;
  totalCost?: number;            // token 花费，便于你后续判断这套值不值
}
```

UI 上点开一个 done 的 ticket，应该能看到这整份东西——不是"完成了"三个字，而是"完成了，这是证据"。

---

## 3. 单 ticket 跨 session 续跑（状态文件）

对应 Anthropic 第一篇文章最核心的发现：**agent 跨多次运行最大的问题是不知道上次做到哪了**。即使你这版是桌面单机应用，"用户关掉 app，明天再开"本质上就是跨 session。

每个 ticket 在 SQLite 里有一行结构化状态（不是 git，但精神等价于 progress.txt + feature_list.json 的合体）：

```typescript
interface TicketState {
  ticketId: string;
  status: "inbox" | "planning" | "writing" | "verifying" | "done" | "failed";
  spec: TicketSpec;
  currentRound: number;
  bestVersion: { content: string; score: number; round: number };
  history: RoundRecord[];
  lastUpdated: string;
}
```

**UI 永远只读这个状态，不重新推导。** app 重启后，sidecar 起来第一件事是扫一遍所有非终态的 ticket，每个都能直接从 `currentRound` 和 `bestVersion` 接着跑，不用猜上次发生了什么。这是 12-Factor Agents 里"显式拥有自己的状态"那条原则的直接应用。

---

## 4. 部门配置（为以后留缝，但这版只填一个）

不做团队系统，但保留"部门是配置 profile"这个你原来就做对的设计：

```typescript
interface DepartmentConfig {
  id: string;                     // "content"
  claimRules: (ticket: TicketDraft) => boolean;  // v1: 永远返回 true（唯一部门）
  plannerPrompt: string;
  writerPrompts: Record<ContentType, string>;
  criticDimensions: GradingCriteria;
  verificationRules: Record<ContentType, AcceptanceCriterionTemplate[]>;
  memoryNamespace: string;
}
```

`claimRules` 这个字段现在没有意义（只有一个部门，永远命中），但**它的存在是故意的**：以后加第二个部门时，不需要改任何调度逻辑，只需要让两个部门的 `claimRules` 各自判断要不要接这张 ticket。现在不写这个字段，以后加部门就是改架构；现在写好，以后加部门就是加配置。

---

## 5. 记忆：有上限的蒸馏，不是无限堆叠

延续之前讨论的结论：self.jsonl 式的无限追加会让 prompt 越喂越长。这版的记忆写入规则：

- 只在 ticket 进入 `done` 或永久 `failed` 时写一条
- 写入前做蒸馏：不存完整 transcript，只存"模式 + 教训"一句话（成功：是什么做对了；失败：踩了什么坑）
- 读取时只取最近 N 条里 Critic 分数最高的若干条，注入 Planner 和 Writer 的 prompt 前缀
- 定期（比如每 50 条新增）触发一次摘要压缩，把旧记录归并成更少的几条原则性陈述

这个机制要从第一版就写进去，不要等 jsonl 堆到几千行才发现 prompt 爆了。

---

## 6. 建议的搭建顺序

不要一次性把 UI、sidecar、verification 全部铺开。按这个顺序，每步都能独立验证：

1. **Sidecar 核心，无 UI**：TicketState 状态机 + Planner + 复用现有 Writer/Critic prompt + 退化保护/最大迭代。先用命令行直接喂一个 ticket 字符串，确认整个循环能产出东西、能正确推进状态。
2. **Verification 引擎**：先给 article/seed 两种类型各写 3-5 条 deterministic 检查（字数、关键点覆盖、格式）。在第 1 步基础上接入，确认"打回重写"这条路径真的会触发。
3. **最小 Tauri 壳**：只做"提交 ticket → 看到它在跑 → 看到最终产物"，目的是先打通 Rust 进程管理 + sidecar WebSocket 通信这条链路，UI 越简陋越好。
4. **Board + 证据详情页**：完整的 kanban 视图（Inbox/Planning/Writing/Verifying/Done）+ 点开看 EvidenceBundle 全部内容。
5. **记忆蒸馏与回流**：接入 Planner/Writer prompt 前缀注入，用固定几个真实 ticket 跑两遍（有/无记忆）对比效果，确认这层真的有用再保留。
6. **此时再考虑第二个部门**，不在这版范围内。

每一步都是可以独立跑通、独立验证的闭环，不要等全部做完才第一次测试整个系统。

---

**版本**: v3-design-draft
**日期**: 2026-06-20
**状态**: 设计稿，未实现
