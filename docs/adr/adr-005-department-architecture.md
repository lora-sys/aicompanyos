# ADR-005: 部门制架构 (Department Architecture) — 内容产出部 v1

> 状态：**已实施 (Implemented)** | 日期：2026-06-18 | 核心原则：先做深再做广
>
> 更新记录：
> - 2026-06-19: v0.5.0 大重构 — WorkerRegistry 支持真实 factory（WorkerFactoryDeps 注入）；ITeamManager 新增 createWorkerFactoriesWithDeps(deps) 方法；ReviewerAgent 作为专用化 Agent 接入；CLI 拆分为 DepartmentSetup/TUIManager/ProviderFactory/HarnessFactory + 3 Coordinators；IInnerLoopEngine 统一接口替代 LoopHarness 直接依赖 LoopModule/PiAgentLoopEngine；PlanStep.agentType 收紧为 WorkerRole | string
> - 2026-06-19: 部门配置新增 `teamManager` 字段，CLI 在切换内容格式时自动组建动态团队；ResearcherAgent 已接入多 Worker 执行路径。

---

## 1. 愿景与动机

### 1.1 终极目标

```
AI Company OS
├── 部门 1: 内容产出部 (Content Production) ★ 当前焦点
│   ├── 图文/长文 (公众号/知乎)
│   ├── 种草/短图文 (小红书)
│   ├── 短视频脚本 (抖音/TikTok)
│   └── Newsletter/周报 (Substack)
│
├── 部门 2: 研发部 (R&D) [未来]
│   ├── 技术文档
│   ├── API 设计
│   └── 代码审查
│
├── 部门 3: 运营部 (Operations) [未来]
│   ├── 数据分析
│   └── 用户增长
│
└── 共享基础设施:
    ├── loop-engine (Loop Engineering Harness)
    ├── evidence-chain (执行证据链)
    ├── memory (记忆系统)
    └── mcp (工具协议)
```

**核心洞察**: 每个部门是同一套 Loop Engine 的 **不同配置剖面 (Profile)**，不是独立的系统。

### 1.2 为什么需要"部门"抽象

当前问题：
- `WriterAgent.SYSTEM_PROMPT` 写死为"技术文章创作者"
- `GoalTemplateRegistry` 只有代码/文章/UI 三种通用模板
- 没有"小红书种草笔记"或"短视频脚本"这种领域专属的验收标准
- OutputPipeline 只输出 md/html，不支持平台适配格式

**需要的是**: 一套机制，让同一个 loop-engine 通过不同的配置，驱动完全不同的行为模式。

---

## 2. 核心概念：Department（部门）

### 2.1 定义

一个 **Department（部门）** = 一套完整的 **内容生产配置剖面**，包含：

| 维度 | 说明 | 举例 |
|------|------|------|
| **Agent Profile** | Writer/Critic 的 Prompt、行为模式、风格约束 | "小红书种草写手" vs "技术博客作者" |
| **Goal Template** | 该部门内容的验收标准清单 | 图文: 标题+封面+正文+CTA; 短视频: 脚本+分镜+口播 |
| **Output Pipeline** | 产出物的后处理和格式转换 | md → 公众号 HTML / 小红书图 / 字幕文件 |
| **Tool Set** | 该部门可用的工具集 | 种草: 图片生成; 视频: BGM 库 |
| **Quality Gate** | 部门专属的质量门槛 | 种草: emoji密度+话题标签; 图文: SEO 关键词 |

### 2.2 DepartmentConfig 接口

```typescript
// ============================================================
// 文件位置：packages/loop-engine/src/department/types.ts
// ============================================================

/** 内容格式类型 */
export type ContentType =
  | "article"        // 图文/长文（公众号/知乎）
  | "seed"           // 种草/短图文（小红书/Instagram）
  | "short-video"    // 短视频脚本（抖音/TikTok）
  | "newsletter";    // Newsletter/周报（Substack）

/** 部门配置 — 一个部门 = 一个 DepartmentConfig 实例 */
export interface DepartmentConfig {
  // === 身份 ===
  departmentId: string;           // "content-production"
  departmentName: string;         // "内容产出部"
  version: string;                // "1.0.0"

  // === Agent Profile ===
  agentProfile: AgentProfile;

  // === Goal Template（验收标准）===
  goalTemplates: GoalTemplate[];

  // === Output Pipeline（产出后处理）===
  outputPipeline: OutputPipelineConfig;

  // === Tool Set（可用工具）===
  toolSet?: string[];              // ["web_search", "image_gen", ...]

  // === Quality Gate（质量门槛）===
  qualityGate?: QualityGateConfig;
}
```

### 2.3 AgentProfile — 部门专属的 Agent 人格

```typescript
export interface AgentProfile {
  /** Writer 的 System Prompt */
  writerSystemPrompt: string;
  /** Writer 的行为约束 */
  writerConstraints: WriterConstraints;
  /** Critic 的评估维度（覆盖默认 GradingCriteria） */
  criticDimensions?: CriticDimension[];
  /** Critic 的 System Prompt */
  criticSystemPrompt?: string;
  /** 风格指南（如品牌调性手册） */
  styleGuide?: StyleGuide;
}

/** Writer 约束 */
export interface WriterConstraints {
  /** 篇幅约束 */
  lengthConstraint?: {
    minLength?: number;  // 最小字数
    maxLength?: number;  // 最大字数
    unit: "chars" | "words";
  };
  /** 结构要求 */
  structureRequirement?: {
    mustHaveSections?: string[];      // 必须包含的章节
    maxSectionLength?: number;         // 单节最大长度
  };
  /** 禁止事项 */
  prohibitions?: string[];             // 如 ["禁止使用第一人称", "禁止出现外部链接"]
  /** 必须包含元素 */
  requirements?: string[];            // 如 ["必须包含至少3个emoji", "必须有明确的行动号召(CTA)"]
  /** 语言风格 */
  tone?: "professional" | "casual" | "humorous" | "emotional" | "storytelling";
  /** 目标受众 */
  targetAudience?: string;            // 如 "25-35岁一线城市职场女性"
}
```

### 2.4 OutputPipelineConfig — 多格式输出

```typescript
export interface OutputPipelineConfig {
  /** 主要输出格式 */
  primaryFormat: "markdown" | "html" | "json";

  /** 后处理器链（按顺序执行） */
  postProcessors: OutputPostProcessor[];
}

/** 输出后处理器 */
export type OutputPostProcessor =
  | PlatformAdapterProcessor     // 平台适配（如微信公众号 HTML 格式）
  | MetadataInjector            // 元数据注入（标题/作者/日期）
  | FormatConverter             // 格式转换（md→HTML, md→字幕文件）
  | QualityChecker              // 质量检查（发布前最后安检）

/** 平台适配器示例 */
export interface PlatformAdapterProcessor {
  type: "platform_adapter";
  platform: "wechat" | "xiaohongshu" | "douyin" | "substack" | "generic";
  template?: string;           // HTML 模板路径
  transformations?: Record<string, string>; // 文本替换规则
}
```

### 2.5 QualityGateConfig — 部门专属质量门槛

```typescript
export interface QualityGateConfig {
  /** 覆盖默认 GradingCriteria 的维度 */
  overrideDimensions?: {
    dimension: string;
    weight: number;           // 权重（覆盖默认值）
    description: string;
  }[];

  /** 新增维度（部门特有） */
  extraDimensions?: {
    id: string;
    name: string;
    description: string;
    weight: number;
    scoringGuide: string;      // LLM 评分指导
  }[];

  /** 部门特有的通过阈值 */
  passThreshold?: number;       // 覆盖默认 75
  excellenceThreshold?: number; // 覆盖默认 90
}
```

---

## 3. 内容产出部 v1 — 具体实现

### 3.1 部门总览

```
ContentProductionDepartment (packages/departments/content-production/)
│
├── index.ts                    # 部门入口，导出 getDepartmentConfig()
├── profiles/
│   ├── article.ts              # 图文/长文 Profile（公众号/知乎）
│   ├── seed.ts                 # 种草/短图文 Profile（小红书）
│   ├── short-video.ts          # 短视频脚本 Profile（抖音/TikTok）
│   └── newsletter.ts           # Newsletter Profile（Substack）
│
├── prompts/
│   ├── writer-article.ts        # 图文 Writer System Prompt (~2000字)
│   ├── writer-seed.ts          # 种草 Writer System Prompt (~1500字)
│   ├── writer-short-video.ts   # 短视频 Writer System Prompt (~1500字)
│   ├── writer-newsletter.ts    # Newsletter Writer System Prompt (~1000字)
│   ├── critic-article.ts       # 图文 Critic 评估维度
│   ├── critic-seed.ts          # 种草 Critic 评估维度
│   ├── critic-short-video.ts   # 短视频 Critic 评估维度
│   └── critic-newsletter.ts    # Newsletter Critic 评估维度
│
├── goals/
│   ├── article-goals.ts        # 图文验收目标模板
│   ├── seed-goals.ts           # 种草验收目标模板
│   ├── short-video-goals.ts    # 短视频验收目标模板
│   └── newsletter-goals.ts     # Newsletter 验收目标模板
│
├── output/
│   ├── wechat-adapter.ts       # 微信公众号 HTML 适配器
│   ├── xiaohongshu-adapter.ts  # 小红书图文适配器
│   ├── douyin-script.ts        # 抖音脚本格式化器
│   └── newsletter-renderer.ts  # Newsletter HTML 渲染器
│
├── templates/                  # 输出模板（HTML/Nunjucks/EJS）
│   ├── wechat-article.html
│   ├── xiaohongshu-post.html
│   └── newsletter.html
│
└── quality-gates.ts           # 部门质量门槛定义
```

### 3.2 四种内容格式的关键差异

| 维度 | 图文 article | 种草 seed | 短视频 short-video | Newsletter |
|------|------------|----------|-------------------|-------------|
| **篇幅** | 2000-3500字 | 300-800字 | 500-1000字(口播) | 800-2000字 |
| **结构** | 标题+引言+N个章节+总结+CTA | 标题+正文+标签+CTA | 开头钩子+N个场景+反转+CTA | 问候+主題+N个板块+推荐+署名 |
| **风格** | 专业/有深度 | 轻松/亲切/种草感 | 口语化/节奏快/有情绪 | 个人化/像朋友写信 |
| **特殊要求** | SEO关键词 | emoji密度≥5个 | 场景切换标记[场景1][场景2] | unsubscribe链接 |
| **Critic 重点** | 信息准确性/深度/结构 | 吸引力/转化率/视觉描述 | 节奏/口语感/完播率驱动 | 打开率/可读性/价值密度 |
| **输出产物** | .md → .html (公众号) | .md → .html (卡片式) | .txt (分镜脚本) | .html (邮件) |
| **验收目标** | tsc不适用→改为 file_exists+word_count+has_title | file_exists+emoji_count+has_cta | file_exists+scene_markers+duration_check | file_exists+has_unsubscribe+spam_score |

---

## 4. 与现有系统的集成点

### 4.1 数据流（用户选择到最终产出）

```
用户在 CLI 选择:
  "我要写一篇关于 XX 的 [图文文章]"
        │
        ▼
┌─ CLI 层 ──────────────────────────────────────┐
│  taskType: "article"                          │
│  → ContentProductionDepartment               │
│    .getConfig("article")                      │
│    → 返回 DepartmentConfig                   │
│                                               │
│  → 将 departmentConfig 注入 LoopHarness       │
│                                               │
└──────────────────────┬────────────────────────┘
                     │
                     ▼
┌─ LoopHarness 层 ─────────────────────────────┐
│  getOrCreateModule(step):                     │
│    acceptanceGoals = department.goalTemplates  │
│    completionGuardConfig.maxEffort = ...       │
│    llmProviderFn = ... (不变)                 │
│                                               │
│  createWriterFactory():                       │
│    systemPrompt = department.agentProfile       │
│      .writerSystemPrompt  ← ★ 替换硬编码 prompt │
│    constraints = department.agentProfile         │
│      .writerConstraints                        │
│                                               │
│  createCriticFactory():                       │
│    dimensions = department.qualityGate          │
│      .overrideDimensions + .extraDimensions    │
│                                               │
└──────────────────────┬────────────────────────┘
                     │
                     ▼
┌─ LoopModule (Inner Loop) ────────────────────┐
│  run():                                       │
│    generate() → 用部门的 prompt 调 LLM          │
│    evaluate()  → 用部门的维度打分              │
│    guard.check() → 用部门的 goal 验证          │
│                                               │
│  result.output → 经过部门的 outputPipeline    │
│    postProcessors:                            │
│      FormatConverter → PlatformAdapter        │
│                                               │
└──────────────────────┬────────────────────────┘
                     │
                     ▼
              最终产物 (交付)
```

### 4.2 具体代码集成点

#### 集成点 1: CLI → Department 选择

```typescript
// packages/cli/src/app.ts (新增)
import { ContentProductionDepartment } from "@aicos/content-production";

async function selectContentType(): Promise<ContentType> {
  // TUI 让用户选择内容类型
  // 返回 "article" | "seed" | "short-video" | "newsletter"
}

// 在 executeLoop() 中:
const contentType = await selectContentType();
const dept = new ContentProductionDepartment();
const deptConfig = dept.getConfig(contentType);

// 将 deptConfig 传入 Harness
this.harness = new LoopHarness(toolRegistry, llmProvider, {
  ...existingConfig,
  departmentConfig: deptConfig,  // ★ 新增字段
});
```

#### 集成点 2: LoopHarness 接收 DepartmentConfig

```typescript
// packages/loop-engine/src/loop-harness/engine.ts (修改)
export interface LoopHarnessConfig {
  // ... 现有字段 ...
  
  // ★ ADR-005: 部门配置注入
  departmentConfig?: DepartmentConfig;
}

// getOrCreateModule() 中:
createWriterFactory(ctx) {
  const writerPrompt = this.config.departmentConfig?.agentProfile?.writerSystemPrompt
    ?? WriterAgent.SYSTEM_PROMPT; // 无部门配置时用默认

  return new WriterAgent(this.toolRegistry, this.llmProvider, {
    customSystemPrompt: writerPrompt,
    constraints: this.config.departmentConfig?.agentProfile?.writerConstraints,
  });
}
```

#### 集成点 3: CompletionGuard 使用部门 GoalTemplate

```typescript
// extractGoalsForStep() 中:
private extractGoalsForStep(step: PlanStep): AcceptanceGoal[] {
  // 1. metadata 显式目标（最高优先）
  // 2. 部门 GoalTemplate（新! 第二优先）
  if (this.config.departmentConfig?.goalTemplates) {
    for (const template of this.config.departmentConfig.goalTemplates) {
      if (template.match?.keywords?.some((kw) =>
        step.description.toLowerCase().includes(kw.toLowerCase())
      )) {
        return template.generate(step.stepId, step.description);
      }
    }
  }
  // 3. 通用 GoalTemplate（兜底）
  return LoopHarness.goalTemplateRegistry.generateGoals(...);
}
```

#### 集成点 4: 输出后处理

```typescript
// LoopHarness.executeWithLoop() 最后:
if (result.bestOutput && this.config.departmentConfig?.outputPipeline) {
  const processed = await this.runOutputPipeline(
    result.bestOutput,
    this.config.departmentConfig.outputPipeline
  );
  result.processedOutput = processed;
}
```

---

## 5. 分阶段执行计划

### Phase A: Department 抽象层（当前）

**目标**: 定义所有接口类型，零运行时改动

- [ ] 创建 `packages/loop-engine/src/department/types.ts` — DepartmentConfig 全量类型
- [ ] 更新 `LoopHarnessConfig` 添加 `departmentConfig?` 字段
- [ ] 更新 `LoopModuleResult` 添加 `processedOutput?` 字段
- [ ] tsc 编译通过

### Phase B: 内容产出部 — Prompt 工程（核心）

**目标**: 4 套完整的 Writer/Critic Prompt

- [ ] `prompts/writer-article.ts` — 图文 Writer System Prompt
  - 角色定义（深度内容创作者）
  - 结构要求（标题/H1-H4/引用/代码块/总结）
  - SEO 要求（关键词布局/内链/元描述）
  - 禁止事项（抄袭/空洞/偏题）
- [ ] `prompts/writer-seed.ts` — 种草 Writer System Prompt
  - 角色定义（生活方式分享者/种草达人）
  - 结构要求（标题+首图描述+正文3-5段+标签+CTA）
  - 种草要素（emoji/话题标签/互动引导/真实感）
  - 禁止事项（广告感/说教/长篇大论）
- [ ] `prompts/writer-short-video.ts` — 短视频 Writer System Prompt
  - 角色定义（短视频编剧）
  - 结构要求（黄金3秒开头+N个场景+反转+CTA）
  - 节奏控制（每5秒一个信息点/口语化/无长句）
  - 格式标记（[场景][画面][音效][字幕]）
- [ ] `prompts/writer-newsletter.ts` — Newsletter Writer System Prompt
  - 角色定义（个人品牌通讯作者）
  - 结构要求（问候+本期主题+N个板块+推荐+署名）
  - Newsletter 特殊元素（unsubscribe/转发引导/P.S.）
  - 风格要求（像朋友聊天/个人化/高信噪比）
- [ ] 对应的 4 套 Critic Prompt 和评估维度

### Phase C: 内容产出部 — GoalTemplate（自验证）

**目标**: 每种格式有不同的验收目标

- [ ] `goals/article-goals.ts` — 图文验收
  - file_exists: 产出 .md 文件且 > 1500 字
  - content_match: 有 H1 标题
  - content_match: 有 CTA 段落（"关注"/"点赞"/"评论"等）
  - command: markdown-lint 检查（如有）
- [ ] `goals/seed-goals.ts` — 种草验收
  - file_exists: 产出 .md 文件且 > 200 字
  - content_match: emoji 密度 ≥ 5 个
  - content_match: 有话题标签（#xxx#）
  - content_match: 有 CTA（@xxx 或"评论区见"）
- [ ] `goals/short-video-goals.ts` — 短视频验收
  - file_exists: 产出 .txt/.md 脚本文件
  - content_match: 包含 [场景X] 标记 ≥ 3 个
  - content_match: 总时长估算在 30s-120s 区间
  - content_match: 有明确的 CTA（关注/点赞/评论/购买）
- [ ] `goals/newsletter-goals.ts` — Newsletter 验收
  - file_exists: 产出 .html/.md 文件
  - content_match: 含 unsubscribe 链接
  - spam_score: 不含垃圾邮件触发词（"免费"/"中奖"/"!!!")

### Phase D: 内容产出部 — OutputPipeline（交付）

**目标**: 产出物经过平台适配后交付

- [ ] `output/wechat-adapter.ts` — 微信公众号适配器
  - md → 带样式的 HTML（微信兼容 CSS）
  - 自动注入标题/作者/日期/版权
  - 生成目录导航
- [ ] `output/xiaohongshu-adapter.ts` — 小红书适配器
  - md → 卡片式 HTML（圆角/渐变背景/Emoji 标题）
  - 首图占位符 + 标签渲染
- [ ] `output/douyin-script.ts` — 抖音脚本格式化
  - 纯文本 → 标准分镜脚本格式
  - 时间戳标注 + 字数统计
- [ ] `output/newsletter-renderer.ts` — Newsletter 渲染器
  - md → 邮件兼容 HTML（inline CSS）
  - Header/Footer/预览文本

### Phase E: LoopHarness 集成（打通）

**目标**: DepartmentConfig 完整注入数据流

- [ ] LoopHarness 构造函数接受 `departmentConfig?`
- [ ] `getOrCreateModule()` 中从 departmentConfig 提取 goals/prompts/constraints
- [ ] WriterAgent 支持自定义 `customSystemPrompt` + `constraints`
- [ ] CriticAgent 支持自定义评估维度
- [ ] `executeWithLoop()` 末尾调用 outputPipeline
- [ ] 全流程端到端测试：用户选"图文" → 产出一篇带格式的文章

### Phase F: CLI 层路由（交互）

**目标**: 用户可以选择内容类型

- [ ] CLI TUI 添加内容类型选择界面
- [ ] `ContentProductionDepartment.getAvailableTypes()` 返回可选列表
- [ ] 选择后自动加载对应 DepartmentConfig
- [ ] 任务描述自动适配（如图文任务自动加 SEO 提示）

---

## 6. 未来部门扩展路径（做广时的参考）

当需要创建第二个部门时（如研发部），只需：

```
1. 创建 packages/departments/rnd/
2. 实现 RndDepartment implements DepartmentInterface
3. 定义 R&D 专属的:
   - AgentProfile (代码审查员 Prompt)
   - GoalTemplate (tsc_clean + test_pass + lint_ok + doc_coverage)
   - OutputPipeline (API doc → OpenAPI JSON / README.md)
   - QualityGate (代码覆盖率 ≥ 80% / 类型安全 / 无 any)
4. 在 CLI 中注册新部门选项
5. loop-engine 零改动 ✅
```

**这就是"先做深再做广"的价值**：Phase A 定义的抽象层会确保第一个部门打磨过程中发现的问题都能被正确抽象，而不是为第一个部门写死逻辑。

---

*文档版本: v0.2-implemented | 基于 ADR-004 (CompletionGuard) 构建 + v0.5.0 重构更新 | 日期: 2026-06-19*
