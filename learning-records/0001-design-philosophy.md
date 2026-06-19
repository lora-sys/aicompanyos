# Learning Record 0001: AI Company OS 核心设计哲学

## 学到了什么

### 核心概念
1. **部门 = 配置剖面（Profile）**：每个部门不是独立系统，而是同一套 LoopEngine 的不同配置。这是 ADR-005 的核心设计决策。
2. **团队 = 任务的函数**：动态团队应该根据任务特征（needsResearch, complexity, hasVisualContent）来组合 Agent，而不是根据静态的 contentType 映射。
3. **护城河 = 闭环**：写入 self.jsonl/user.jsonl 不够，必须在新任务时读取并注入到 Prompt/决策中，形成闭环才有护城河价值。
4. **分层 = 变化频率**：loop-engine（低频）→ departments（中频）→ team（高频）→ knowledge（持续增长）。

### 关键洞察
- 当前系统的 Memory 是"死"数据：有完整的写入链路（EvolutionAgent → EvolutionDocsManager → 4 个文件），但**零读取回流**
- 唯一的半回流是 `dynamicExamples` 注入到 GradingCriteria 的 examples 字段（只影响 Critic 打分，不影响 Writer 质量）
- 动态团队应该放在 `loop-engine/src/team/` 作为通用层，各部门只定义自己的规则和 Worker 池

## 非显而易见的教训

1. **"配置剖面"模式的价值不在于代码复用，而在于进化复利** — Engine 改进一次，所有部门自动受益
2. **TaskAnalyzer 不一定要用 LLM** — 规则引擎（关键词匹配 + 特征检测）可能足够，LLM 可以作为增强层
3. **Memory 回流的第一步不需要复杂的设计** — 只需一个 HistoryReader 读取 getSelfMD() 并拼接成 Prompt 前缀

## 需要修正的理解

~~部门是一个独立的业务单元~~ → 部门是一组配置参数，执行逻辑全部在 loop-engine

~~动态团队意味着每次都创建新的 Agent 实例~~ → 动态团队意味着选择不同的 Agent 组合和配置，Agent 实例可以复用

## 下一步
- Lesson 0002: 动态团队的接口设计与规则引擎（TaskAnalyzer / TeamComposer / WorkerRegistry）
- 实践：设计 content-production 部门的 TeamCompositionRule 集

---
*日期: 2026-06-19 | 相关 Mission: AI Company OS 架构设计哲学*
