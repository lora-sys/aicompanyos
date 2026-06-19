# AI Company OS 演进实施计划 v2.0

> 基于 grill-me 拷问（4 个方向）+ teach 教学（2 节课）的完整实施计划
> 日期：2026-06-19 | 状态：待审批 | 分支：feature/department-evolution

---

## 一、演进总览

### 当前基线
- ADR-005 符合度 **95/100**，方向未跑偏
- 内容产出部 Phase A-E 全部完成，Phase F（CLI 路由）待实现
- E2E 测试通过，能产出 md/html，Memory 有写入但无回流

### 演进目标（4 个方向）

| # | 方向 | 当前状态 | 目标状态 | 优先级 |
|---|------|---------|---------|--------|
| D1 | 架构审查 | 95/100 | 维持 + 监控 | — |
| D2 | 动态团队 | 固定 Writer+Critic | 任务特征驱动的动态组合 | **P0** |
| D3 | 成长护城河 | 写入无闭环 | Memory 回流 → Prompt 注入 | **P0** |
| D4 | 文档同步 | 部分同步 | 全量同步（README + 9 个 MODULE_GUIDE） | P1 |

### 核心设计决策（已确认）

1. **动态团队 = 纯编排层 + departments 层实现规则**，loop-engine 定义通用接口
2. **团队组合 = 任务特征的函数**（TaskAnalyzer → TeamComposer → Worker[]）
3. **Memory 回流 MVP = HistoryReader 读取 self.jsonl → 注入 Writer Prompt 前缀**
4. **护城河 = 写入 × 回流 × 决策影响**，当前 0% → MVP 目标 50%

---

## 二、Phase 1: 动态团队 — 通用接口层

### 目标
在 `loop-engine/src/team/` 下定义 ITeam / IWorker / ITeamManager / TaskAnalyzer / TeamComposer 的通用接口和基础实现。

### 新增文件

```
packages/loop-engine/src/team/
├── types.ts                    # ITeam, IWorker, ITeamManager, TaskFeatures, TeamCompositionRule 等接口
├── task-analyzer.ts            # TaskAnalyzer 基础实现（规则引擎版）
├── team-composer.ts            # TeamComposer 规则匹配引擎
├── team-manager.ts             # TeamManager 编排器（组合 analyzer + composer）
├── worker-registry.ts          # WorkerRegistry 全局注册表
└── index.ts                    # 统一导出
```

### 接口定义（核心子集）

```typescript
// types.ts
type WorkerRole = "writer" | "critic" | "researcher" | "uiux-designer" | "reviewer";

interface IWorker {
  id: string;
  role: WorkerRole;
  agentType: string;
  configOverride?: Partial<WorkerConfig>;
}

interface ITeam {
  id: string;
  taskId: string;
  workers: IWorker[];
  goal: string;
  features: TaskFeatures;
  createdAt: Date;
}

interface TaskFeatures {
  domain: string;
  needsResearch: boolean;
  hasVisualContent: boolean;
  length: "short" | "medium" | "long";
  qualityTier: "draft" | "standard" | "premium";
  complexity: "low" | "medium" | "high";
  estimatedSteps: number;
}

interface TeamCompositionRule {
  id: string;
  match: (features: TaskFeatures) => boolean;
  team: Array<{ role: WorkerRole; priority: "essential" | "optional"; configOverride?: WorkerConfig }>;
  reasoning: string;
  priority: number;  // 数字越小越先匹配
}

interface ITeamManager {
  composeTeam(taskInput: string, context: TeamContext): Promise<ITeam>;
  createWorkerFactories(team: ITeam): Map<string, AgentFactory>;
}
```

### TaskAnalyzer 规则引擎（task-analyzer.ts）

基于正则/关键词的特征提取，无需 LLM：

```typescript
// 特征提取规则
const FEATURE_RULES = [
  { key: "needsResearch", pattern: /调研|研究|数据|论文|报告|分析/i },
  { key: "hasVisualContent", pattern: /小红书|卡片|配图|设计|视觉|种草/i },
  { key: "domain.tech", pattern: /技术|编程|AI|代码|架构|API/i },
  { key: "domain.lifestyle", pattern: /生活|穿搭|美食|旅行|护肤/i },
  // ... 更多规则
];
```

### TeamComposer 匹配逻辑（team-composer.ts）

```typescript
class TeamComposer {
  constructor(private rules: TeamCompositionRule[]) {}

  compose(features: TaskFeatures): ITeamWorkerDef[] {
    // 按 priority 升序排序，第一个命中的规则胜出
    const sorted = [...this.rules].sort((a, b) => a.priority - b.priority);
    for (const rule of sorted) {
      if (rule.match(features)) {
        return rule.team;  // 命中返回
      }
    }
    throw new Error("没有匹配的团队规则（应该有默认兜底规则）");
  }
}
```

### 验收标准
- [ ] `pnpm --filter @aicos/loop-engine build` 编译通过
- [ ] `npx vitest run packages/loop-engine/src/team/__tests__/` 全部通过
- [ ] TaskAnalyzer 能正确提取 5 种以上任务特征
- [ ] TeamComposer 能正确匹配规则（含默认兜底）
- [ ] ITeamManager.createWorkerFactories() 返回正确的 Map 结构

### 风险
- 与现有 LoopHarness.registerAgent() 的集成需要验证
- WorkerRole 枚举可能与现有 agentType 字符串不兼容

---

## 三、Phase 2: 动态团队 — 部门规则层

### 目标
在 `content-production/src/team/` 下定义内容产出部专属的团队组合规则。

### 新增文件

```
packages/departments/content-production/src/team/
├── types.ts                     # 部门扩展的 WorkerConfig（如 ContentWriterConfig）
├── content-rules.ts             # 6-8 条 TeamCompositionRule
├── content-workers.ts           # 部门专属的 Worker 定义（Writer 变体等)
├── content-team-manager.ts      # 实现 ITeamManager 接口的部门版本
└── index.ts
```

### 内容产出部规则集（content-rules.ts）

| Rule ID | 条件 | 团队 | 适用场景 |
|----------|------|------|---------|
| research-heavy | needsResearch && high | SeniorWriter + Researcher + SeniorCritic + Reviewer? | 深度技术文章 |
| visual-content | hasVisualContent | Writer + Critic + UIUXDesigner | 小红书种草 |
| quick-output | short && !needsResearch | FastWriter(低门槛) + QuickCritic | 短内容快速出稿 |
| premium-quality | qualityTier=premium | SeniorWriter + Researcher + Critic + Reviewer | 高质量长文 |
| default-pair | (兜底) | Writer + Critic | 所有其他场景 |

### 验收标准
- [ ] `pnpm --filter @aicos/content-production build` 编译通过
- [ ] 至少 4 条规则有对应测试用例
- [ ] ContentTeamManager 能正确处理所有 4 种 ContentType

### 集成点修改
- [index.ts](packages/departments/content-production/src/index.ts)：导出 ContentTeamManager
- CLI app.ts 或 E2E 测试：在任务启动时调用 `teamManager.composeTeam()` 替代固定的 `getConfig()`

---

## 四、Phase 3: Memory 回流闭环

### 目标
实现 HistoryReader → 读取 self.jsonl/user.jsonl → 注入新任务的 Writer Prompt。

### 新增文件

```
packages/departments/content-production/src/knowledge/
├── history-reader.ts            # HistoryReader 主类
├── prompt-builder.ts            # 将经验数据转换为 Prompt 片段
└── index.ts
```

### HistoryReader 核心（history-reader.ts）

```typescript
class HistoryReader {
  constructor(private evolutionDocs: EvolutionDocsManager) {}

  /**
   * 读取最近的 N 条经验记录
   */
  async loadRecentExperiences(count = 10): Promise<SelfExperienceEntry[]> {
    const selfData = await this.evolutionDocs.getSelfMD();
    if (!selfData?.experiences) return [];
    return [...selfData.experiences]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);
  }

  /**
   * 生成 Writer Prompt 前缀（注入到 systemPrompt 开头）
   */
  async buildPromptPrefix(
    experiences: SelfExperienceEntry[],
    contentType: ContentType,
  ): Promise<string> {
    if (experiences.length === 0) return "";

    // 按类型分组
    const successes = experiences.filter(e => e.type === "success");
    const failures = experiences.filter(e => e.type === "failure");

    return `
=== 历史经验参考（来自 ${experiences.length} 条过往任务记录） ===

${successes.length > 0 ? `✅ 成功模式 (${successes.length}条):
${successes.map(e => `- ${e.pattern}: ${e.lesson}`).join('\n')}` : ''}

${failures.length > 0 ? `❌ 失败教训 (${failures.length}条):
${failures.map(e => `- ${e.pattern}: ${e.lesson}`).join('\n')}` : ''}

请参考以上经验，避免重复失败模式，复用成功策略。
===
`.trim();
  }
}
```

### 数据流闭环图

```
[写入链路 - 已有]
Task Complete → EvolutionAgent.run()
  → EvolutionDocsManager.addExperience() → self.md + self.jsonl
  → EvolutionDocsManager.updateUserField() → user.md + user.jsonl
  → EvolutionDocsManager.updateDesignBlock() → design.mdx

[读取链路 - 新增 ★]
New Task Start → HistoryReader.loadRecentExperiences(10)
  → EvolutionDocsManager.getSelfMD()  ← 已有方法！
  → HistoryReader.buildPromptPrefix(experiences, contentType)
  → 注入到 WriterAgent.systemPrompt 前缀
  → Writer 看到历史经验 → 产出质量提升 ★

[闭环完成 ✅]
```

### 需要修改的现有文件

| 文件 | 改动 |
|------|------|
| [CLI app.ts](packages/cli/src/app.ts) 或 E2E 测试 | 在任务启动时调用 HistoryReader，将 promptPrefix 传入 departmentConfig |
| [content-production/index.ts](packages/departments/content-production/src/index.ts) | 导出 HistoryReader |

### 验收标准
- [ ] HistoryReader 能从 self.md 读取经验并格式化为 Prompt 前缀
- [ ] 空 self.md 时返回空字符串（优雅降级）
- [ ] E2E 测试：第 2 次运行比第 1 次 Prompt 包含历史经验前缀
- [ ] `pnpm -r build` 全量编译通过

### 护城河指标

| 指标 | 当前 | Phase 3 后 | 最终目标 |
|------|------|-----------|----------|
| 写入能力 | 100% | 100% | 100% |
| 读取回流 | 0% | **100%** | 100% |
| 决策影响 | 0% | **50%** (仅 Writer Prompt) | 80%+ (Prompt+Constraints+Goals) |
| **护城河总值** | **0%** | **50%** | **80%+** |

---

## 五、Phase 4: 文档全量同步

### 目标
更新所有项目文档，反映当前架构状态和演进计划。

### 文件清单

| 文件 | 操作 | 主要更新内容 |
|------|------|-------------|
| **README.md** | 重写 | 项目介绍、架构图、快速开始、功能列表、截图占位 |
| **ADR-005** | 更新 | 状态 Draft → Implemented（Phase A-E），新增 Phase G（动态团队）、Phase H（Memory 回流） |
| **AGENTS.md** | 更新 | 模块索引表增加 team/ knowledge 模块；架构图增加 Team/Knowledge 层 |
| **UBIQUITOUS_LANGUAGE.md** | 更新 | 新增术语：Team, Worker, TaskAnalyzer, TeamComposer, HistoryReader, Moat |
| **loop-engine/MODULE_GUIDE.md** | 更新 | 新增 team/ 子模块文档；接口导出索引更新 |
| **content-production/MODULE_GUIDE.md** | 新建 | 部门完整文档（从零创建） |
| **memory/MODULE_GUIDE.md** | 更新 | 新增 HistoryReader 使用说明；读取 API 文档补全 |
| **evolution/MODULE_GUIDE.md** | 更新 | 新增与 Team/Knowledge 的集成说明 |
| **cli/MODULE_GUIDE.md** | 更新 | 新增 TeamManager 集成示例；HistoryReader 初始化流程 |

### README.md 结构草案

```markdown
# AI Company OS

> 用 AI Agent 模拟公司运作的循环工程系统

## 它是什么？
AI Company OS 是一个基于 **Loop Engineering（循环工程）** 范式的 AI Agent 协作框架。
通过双层嵌套循环（Outer Loop / Inner Loop）驱动多个专业 Agent 协作完成复杂任务。

## 核心概念
- **Department（部门）** = 同一套 Engine 的不同配置剖面
- **Team（团队）** = 任务特征驱动的动态 Agent 组合
- **LoopHarness** = 双层循环执行引擎（Writer→Critic 反馈环）
- **Moat（护城河）** = Memory 回流闭环带来的持续进化能力

## 架构概览
[ASCII 架构图]

## 快速开始
[安装 → 配置 → 运行 E2E 测试]

## 模块一览
[9 个包的表格]

## 部门体系
- 内容产出部（已实现）：article / seed / short-video / newsletter
- 研发部（规划中）
- 运营部（规划中）
```

---

## 六、Phase 5: 集成测试 + E2E 验证

### 测试策略

| 测试类型 | 工具 | 覆盖范围 |
|----------|------|----------|
| 单元测试 | Vitest | TaskAnalyzer / TeamComposer / HistoryReader |
| 集成测试 | Vitest | TeamManager + LoopHarness 协作 |
| E2E 测试 | tsx + LLM API | 完整流程：组队 → 执行 → 产出 → Memory 写入 → 下次读取 |

### E2E 验证场景

```
Scenario 1: 动态团队 — 高复杂度调研型任务
  Given: taskInput = "写一篇关于 AI Agent 的深度技术文章，需要调研最新论文"
  When:  TeamManager.composeTeam(taskInput)
  Then:  team.workers 包含 researcher 角色
  And:   team.features.needsResearch === true

Scenario 2: 动态团队 — 种草笔记
  Given: taskInput = "写一个小红书种草笔记推荐夏日防晒霜"
  When:  TeamManager.composeTeam(taskInput)
  Then:  team.workers 包含 uiux-designer 角色
  And:   team.features.hasVisualContent === true

Scenario 3: Memory 回流闭环
  Given: 已完成 1 次 E2E 任务（self.jsonl 有内容）
  When:  启动第 2 次 E2E 任务
  Then:  WriterAgent 收到的 systemPrompt 包含 "历史经验参考" 前缀
  And:  前缀中包含第 1 次任务的 lesson 内容
```

---

## 七、实施顺序与依赖关系

```
Phase 1 (team 接口层) ──┐
                         ├──→ Phase 5 (集成测试 + E2E)
Phase 2 (部门规则层) ──┤
                         │
Phase 3 (Memory 回流) ──┘
                         │
Phase 4 (文档同步) ──────→ 可并行于任意 Phase 之后
```

**建议执行顺序**：Phase 1 → Phase 2 → Phase 3 → Phase 5 → Phase 4

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| TaskAnalyzer 规则覆盖率不足 | 中 | 中 | 先上线规则版，收集数据后迭代为 LLM 版 |
| HistoryReader 读取性能（self.md 过大） | 低 | 低 | 只读最近 N 条；未来可加索引 |
| 动态团队导致 E2E 不稳定 | 中 | 高 | 保留固定配对作为 fallback；充分测试 |
| 文档同步工作量大 | 高 | 低 | 用 subagent 并行生成各文档初稿 |
| LoopEngine 接口变更影响现有测试 | 中 | 中 | 新接口可选，不破坏现有 registerAgent API |

---

*文档版本: v2.0-draft | 基于 grill-me + teach 会话输出 | 待用户审批后执行*
