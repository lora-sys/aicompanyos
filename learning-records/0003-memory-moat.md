# Learning Record 0003: Memory 护城河 — 沉淀到回流的闭环

## 学到了什么

### 核心架构
1. **护城河公式**：写入能力 × 读取回流 × 决策影响 = 护城河强度。三项是乘法关系，任一为零则全零
2. **HistoryReader 是读取端的核心组件**：从 self.jsonl/user.jsonl/self.md 读取 → 筛选相关数据 → 构建 Markdown Prompt 前缀 → 注入 WriterAgent.systemPrompt
3. **写入端已有（v0.3.0）**：EvolutionAgent → EvolutionDocsManager → 4 个文件（self.jsonl / self.md / user.jsonl / design.mdx）
4. **断裂点精确位置**：没有任何代码在任务启动时调用 `getSelfMD()` 并注入 Writer Prompt

### HistoryReader 的 4 个关键设计决策
1. **相关性筛选**：基于关键词重叠 + 时间衰减 + 类型权重，不是全部倒出
2. **能力排序**：熟练度降序 → 名称匹配 → 最近使用时间
3. **低熟练度警告**：proficiency < 40 时生成 ⚠️ 标记，防止过度自信
4. **用户画像注入**：targetAudience / writingStyle / niche 直接告诉 Writer 为谁写作

### 实战验证证据
- E2E 测试 3 种内容类型全部通过：seed(85) / article(90) / newsletter(95)
- self.jsonl 沉淀 5 条跨类型经验（success/failure/learning 各有）
- Newsletter P.S. 优化案例：failure 经验记录 "P.S. 利用率不足" → 下次产出 P.S. 完整且高质量
- 当前处于 L2（基础闭环），下一步目标 L3（决策影响）

## 非显而易见的教训

1. **失败经验比成功经验更有价值** — 它们告诉你"不要做什么"，这比"做什么"更稀缺且更难通过通用训练获得
2. **Prompt 前缀不是越多越好** — 塞满历史数据会占用 context window、稀释当前任务指令。精准筛选 > 完整性
3. **用户画像是差异化来源** — 两个 AI 写手可能技术相同，但对目标用户的理解深度决定产出质量的天壤之别
4. **护城河等级体系**：L0(无) → L1(仅写) → L2(Prompt注入) → L3(多节点决策) → L4(自适应进化)

## 需要修正的理解

~~Memory 沉淀 = 自动变强~~ → Memory 没有读取回流就是死数据。必须主动构建读取端才能形成闭环

~~HistoryReader 需要 LLM 来理解语义~~ → 规则引擎（关键词匹配+时间衰减）足够作为 MVP，LLM 可以后续增强

## 代码实现要点

- `buildPromptPrefix(taskInput, options)` 返回 `HistoryPromptResult`（promptPrefix + stats + sourceData）
- 配置项：maxExperiences(5) / maxCapabilities(8) / maxLimitations(3) / proficiencyWarningThreshold(40)
- 依赖注入：构造函数接收 `readSelfMD()` 和可选的 `readUserMD()` 函数，解耦 FileStore
- 与 TeamManager 的集成点：ContentTeamManager 可选地创建 HistoryReader 实例并传入 LoopHarness

## 下一步
- 将 HistoryReader 接入真实 E2E 流程（LoopHarness.executeWithLoop 中调用 buildPromptPrefix）
- Lesson 0004: CompletionGuard 质量门控设计（R2 修复背后的原理）
- 思考题：如何让 Memory 数据影响团队组合决策？

---
*日期: 2026-06-19 | 前置: Learning Record 0002 | 相关 Lesson: lessons/0003-memory-moat.html*
