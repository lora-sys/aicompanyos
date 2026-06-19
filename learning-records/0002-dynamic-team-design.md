# Learning Record 0002: 动态团队接口设计与规则引擎

## 学到了什么

### 核心接口
- **IWorker**：描述性配置（不含 Agent 实例），包含 role/agentType/configOverride
- **ITeam**：一次任务的 Worker 集合 + goal + features（触发特征）
- **TaskFeatures**：任务结构化特征（domain/needsResearch/hasVisualContent/length/complexity）
- **ITeamManager**：两个方法 — `composeTeam()` (分析+组队) 和 `createWorkerFactories()` (与 LoopHarness 集成)
- **TeamCompositionRule**：有序规则表，match() → team[]，按 priority 排序匹配

### 关键设计决策
1. **规则优先，LLM 增强**：TaskAnalyzer 先用正则/关键词提取特征，置信度低时才调用 LLM
2. **纯编排层**：TeamManager 不做 LLM 调用，只做规则匹配和工厂创建
3. **LoopEngine 零改动**：通过已有的 `registerAgent()` API 注入动态工厂
4. **部门自定义规则**：每个部门在 `src/team/content-rules.ts` 定义自己的 TeamCompositionRule[]

### 与现有架构的集成点
- LoopHarness.registerAgent() 已支持多 Agent 类型注册 ✅
- ExecutionOrchestrator 已支持非 Writer step 顺序执行 ✅
- 新增工作：loop-engine/src/team/ 接口层 + content-production/src/team/ 规则层

## 非显而易见的教训

1. **规则的 priority 是反直觉的**：数字越小越先匹配（特殊规则优先），默认兜底用 999
2. **configOverride 是关键**：同一个 Writer role 可以通过不同的 configOverride 变成 "资深写手" 或 "快速写手"
3. **optional vs essential 影响 executeWithLoop 的行为**：essential 角色缺失应该报错，optional 角色缺失跳过

## 下一步
- Lesson 0003: Memory 回流闭环 — HistoryReader 设计
- 实践：实现 TaskAnalyzer 的规则引擎（正则版）

---
*日期: 2026-06-19 | 前置: Learning Record 0001*
