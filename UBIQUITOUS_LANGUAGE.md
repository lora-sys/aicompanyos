# Ubiquitous Language — AI Company OS

> 本文档定义了项目中所有领域术语的规范用法，消除歧义，建立团队共识。
> 基于 ADR-001/002/003、端到端执行日志和代码实际使用情况提炼。

---

## Loop 生命周期（双层嵌套循环）

| Term | Definition | Aliases to avoid |
|------|-----------|------------------|
| **Task** | 用户通过 CLI 提交的原始需求（如"写一篇关于 AI Agent 的博客"），是整个 Loop 的输入 | Request, job, prompt |
| **Outer Loop** | 全局 replan 循环：EXECUTE → VERIFY → (失败则) PLAN → EXECUTE... 上限 3 次 Replan | 外层循环, global loop |
| **Inner Loop** | 单步内的 Writer→Critic 反馈环：Generator→Evaluator→Generator... 上限 4 轮迭代 | 内层循环, feedback loop |
| **Replan** | Outer Loop 在 VerifyEngine 判定质量不达标时触发的重新规划动作 | 重规划, re-plan |
| **Round** | Inner Loop 中的一次完整 Generate→Evaluate 周期 | 轮次, iteration |

## 状态机（7 态）

| Term | Definition | Aliases to avoid |
|------|-----------|------------------|
| **IDLE** | 系统空闲状态，等待 Task 输入 | idle, waiting |
| **INTERROGATING** | LLM 向用户提问以澄清需求（拷问阶段） | 拷问中, questioning |
| **PLANNING** | PlannerAgent 将需求拆解为 ExecutionPlan | 规划中, planning |
| **EXECUTING** | LoopModule 按 Plan 逐步执行 Inner Loop | 执行中, running |
| **VERIFYING** | VerifyEngine 对产出进行质量验证 | 验证中, checking |
| **EVOLVING** | EvolutionAgent 分析产物的进化趋势 | 进化分析中, analyzing |
| **DONE** | 任务完成，所有状态终态 | 完成, finished, complete |

## Agent 接口与实现（Seam 模式）

| Term | Definition | Aliases to avoid |
|------|-----------|------------------|
| **IPlannerAgent** | 规划器接口：将 Task 拆解为 ExecutionPlan | Planner interface |
| **IGeneratorAgent** | 生成器接口：按计划+反馈生成产出（**canonical 名称**） | Writer interface, Creator |
| **IEvaluatorAgent** | 评估器接口：按 GradingCriteria 对产出评分（**canonical 名称**） | Critic interface, Reviewer |
| **IEvolutionAgent** | 自进化接口：分析迭代历史给出策略建议 | Evolution interface, Learner |
| **WriterAgent** | IGeneratorAgent 的具体实现（写作场景） | Writer, ContentGenerator |
| **CriticAgent** | IEvaluatorAgent 的具体实现（审核场景） | Critic, ContentEvaluator |
| **PlanEngine** | IPlannerAgent 的具体实现 | Planner |
| **SimpleEvolutionAgent** | IEvolutionAgent 的具体实现 | EvolutionAgent |

> **规则：** 接口用 `I` 前缀（IPlannerAgent / IGeneratorAgent / IEvaluatorAgent / IEvolutionAgent），实现去掉 `I` 前缀加具体名称（WriterAgent / CriticAgent / PlanEngine / SimpleEvolutionAgent）。

## 核心数据结构

| Term | Definition | Aliases to avoid |
|------|-----------|------------------|
| **ExecutionPlan** | Planner 产出的有序步骤列表，包含 stepId / agentType / description / toolsNeeded | 计划, plan, steps |
| **PlanStep** | ExecutionPlan 中的单个步骤 | 步骤, step, task |
| **GradingCriteria** | 固定评估标准集，任务启动前定义、运行时不可变（"物理层焊死"） | 评分标准, criteria, rubric |
| **GradingDimension** | GradingCriteria 中的单个评估维度（5 维） | 维度, dimension |
| **GradingResult** | IEvaluatorAgent.evaluate() 返回的结构化评分结果 | 评分结果, evaluation, score |
| **IterationHandoff** | Inner Loop 轮次间传递的状态交接对象（含 bestScore / scoreTrend / currentStrategy 等） | 上下文传递, handoff, context |
| **StrategicDecision** | Generator 每轮评估后的战略选择：refine（精炼）/ pivot（转向）/ accept（接受） | 战略决策, decision |
| **EvidenceChain** | 完整执行过程的证据链，记录每轮迭代的输入/输出/评分/决策 | 证据链, audit trail |
| **Artifact** | 每个 PlanStep 执行后产生的产物文件（如 .md 文章） | 产物, output, deliverable |

## 评估体系（5 维固定标准）

| Term | Definition | Aliases to avoid |
|------|-----------|------------------|
| **Topic Accuracy** | 内容是否紧密围绕用户原始任务主题（权重 25%） | 主题准确性, accuracy |
| **Technical Depth** | 技术分析是否触及实现原理、有独特洞察（权重 25%） | 技术深度, depth |
| **Code Quality** | 代码语法正确性、类型完整性、错误处理（权重 20%） | 代码质量, code |
| **Readability** | 文章结构清晰度、段落过渡、格式规范性（权重 15%） | 可读性, readability |
| **Originality** | 是否有独特观点而非复述官方文档（权重 15%） | 原创性, originality |

## 阈值系统（物理层约束）

| Term | Value | Meaning | Aliases to avoid |
|------|-------|---------|------------------|
| **EXCELLENCE_STOP** | 90 | 达到此分立即终止 Inner Loop（优秀线） | excellent threshold, stop line |
| **EVALUATOR_PASS** | 75 | 单次评估及格线 | pass threshold, pass line |
| **CONSENSUS_PASS** | 70 | ConsensusLock 多票制通过线 | consensus line |
| **MAX_INNER_ROUNDS** | 4 | Inner Loop 最大迭代次数 | max iterations |
| **MAX_OUTER_REPLANS** | 3 | Outer Loop 最大 Replan 次数 | max replans |

## 物理层约束（Harness Engineering 核心概念）

| Term | Definition | Aliases to avoid |
|------|-----------|------------------|
| **物理层焊死** | GradingCriteria 在任务启动前定义、运行时不可变的设计原则 | fixed criteria, immutable standard |
| **退化保护** | 若新版本得分低于历史最佳分，回滚到最佳版本 | degradation guard, rollback |
| **平台期检测** | 连续 N 轮分数波动 < 5% 时判定为平台期，提前终止 | plateau detection |
| **Context Reset** | Inner Loop 每轮清空 LLM 上下文窗口，仅通过 IterationHandoff 传递关键状态 | context reset, clean slate |
| **ConsensusLock** | 多视角审核机制（Writer 自评 + Critic 他评 + 可选 UI-UX 评审），投票决定是否通过 | 共识锁, multi-reviewer |

## 引擎组件

| Term | Definition | Aliases to avoid |
|------|-----------|------------------|
| **LoopModule** | **Canonical 循环引擎** — 实现 Inner Loop 逻辑（Planner→Generator→Evaluator + Evolution） | 主引擎, core engine |
| **LoopHarness** | LoopModule 的薄包装层，负责 CLI 集成和向后兼容 | 包装层, harness facade |
| **VerifyEngine** | Outer Loop 的质量验证引擎，判定是否需要 Replan | 验证引擎, quality checker |
| **InterrogateEngine** | 需求澄清引擎，LLM 生成拷问问题 | 拷问引擎, question engine |
| **ConsensusEngine** | 多票制共识引擎，聚合多个审核者的投票 | 共识引擎, voting engine |
| **ToolRegistry** | 工具注册表，管理 LocalTools（file_write / web_search 等） | 工具表, tool manager |
| **ArtifactManager** | 产物管理器，负责 Artifact 的存储和检索 | 产物管理, output manager |

## 关系图

```
Task ──► InterrogateEngine ──► PlanEngine(IPlannerAgent)
                                        │
                                        ▼
                              ExecutionPlan (N × PlanStep)
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
             LoopModule ◄──── LoopHarness ◄──── CLI (app.ts)
              │  │
              │  ├─ WriterAgent(IGeneratorAgent).generate()
              │  │     → 产出 Artifact
              │  │
              │  ├─ CriticAgent(IEvaluatorAgent).evaluate()
              │  │     → GradingResult (vs GradingCriteria)
              │  │
              │  └─ IterationHandoff (轮次间传递)
              │
              ▼
       SimpleEvolutionAgent(IEvolutionAgent).analyze()
              │
              ▼
         EvidenceChain (全量记录)

Outer Loop: Execute → VerifyEngine → (❌) → Replan → Execute...
Inner Loop: Generate → Evaluate → (未达标) → Generate... (≤4 rounds)
```

## 示例对话

> **Dev:** "当 **Task** 进入 **EXECUTING** 状态后，**LoopModule** 会怎么处理？"
>
> **Domain Expert:** "**LoopModule** 遍历 **ExecutionPlan** 中的每个 **PlanStep**，对每步启动一个 **Inner Loop**：先调用 **WriterAgent**（实现了 **IGeneratorAgent**）生成 **Artifact**，再调用 **CriticAgent**（实现了 **IEvaluatorAgent**）按 **GradingCriteria** 五维标准打分。如果达到 **EXCELLENCE_STOP**（90 分）就 STOP；否则通过 **IterationHandoff** 传递反馈进入下一 **Round**。"
>
> **Dev:** "那如果 **Inner Loop** 跑完 4 轮还是不达标呢？"
>
> **Domain Expert:"** "控制权回到 **Outer Loop**，**VerifyEngine** 判定质量不达标，触发 **Replan**——**PlanEngine** 重新生成 **ExecutionPlan**，然后再次进入 **EXECUTING**。最多 **MAX_OUTER_REPLANS**（3 次）。这就是'物理层焊死'的意义：**GradingCriteria** 从头到尾不变，但计划可以重做。"
>
> **Dev:** "**ConsensusLock** 在这个流程里扮演什么角色？"
>
> **Domain Expert:** "**ConsensusLock** 是 **Inner Loop** 里的多视角审核层。**WriterAgent** 先自评，**CriticAgent** 再他评，两者投票。如果都 approve 或加权分 ≥ **CONSENSUS_PASS**（70），才认为通过。这比单次 **IEvaluatorAgent.evaluate()** 更严格，能减少单一视角的偏差。"

---

## Flagged Ambiguities

### 1. Writer vs Generator（已统一）
- **问题：** 代码中同时存在 `WriterAgent`（实现类名）、`IGeneratorAgent`（接口名）、以及注释中的 "Generator" 三种称呼
- **决议：** 接口统一叫 **IGeneratorAgent**，写作场景的实现叫 **WriterAgent**，口头讨论用 **Generator** 泛指任何实现
- **已修复位置：** [writer/agent.ts](packages/subagents/src/writer/agent.ts) 已实现 `IGeneratorAgent<PlanStep, WriterOutput>` 接口

### 2. Critic vs Evaluator（已统一）
- **问题：** `CriticAgent` 实现类名 vs `IEvaluatorAgent` 接口名 vs 旧代码中的 fallback prompt 使用了不同的维度名称（accuracy/completeness/style/format/uxQuality）
- **决议：** 接口统一叫 **IEvaluatorAgent**，实现叫 **CriticAgent**，维度名称锁定为 **topicAccuracy/technicalDepth/codeQuality/readability/originality**
- **已修复位置：** [critic/agent.ts](packages/subagents/src/critic/agent.ts)

### 3. LoopHarness vs LoopModule（已统一）
- **问题：** 两套竞争引擎并存，职责边界模糊
- **决议：** **LoopModule** 为 canonical 引擎（包含所有核心逻辑），**LoopHarness** 降级为薄包装层（CLI 集成 + 向后兼容）
- **已修复位置：** [loop-harness/engine.ts](packages/loop-engine/src/loop-harness/engine.ts) 已重构为 LoopModule wrapper

### 4. Plan vs ExecutionPlan
- **问题：** 有时简称 "Plan"，有时用全称 "ExecutionPlan"，可能引起混淆（与动词 "plan" 混淆）
- **决议：** 类型定义用 **ExecutionPlan**，口语可简称为 **计划**，动词形式用 "规划" 区分

### 5. Artifact vs Output vs 产物
- **问题：** 三种称呼混用
- **决议：** 统一用 **Artifact** 指代 Step 执行后的文件产出，中文可用 **产物**

### 6. "拷问" vs "Interrogation"
- **问题：** "拷问" 是项目内部俚语（来自 ADR），对外沟通可能引起误解
- **决议：** 内部代码/文档继续用 **Interrogate** / **INTERROGATING**，口语解释时可补充说明为"需求澄清"

---

*最后更新：2026-06-16 | 基于端到端执行日志（3 轮 Outer Loop, 33 Artifacts, 全部通过）*
