/**
 * Department Architecture (ADR-005) — 部门制抽象层类型定义
 *
 * 核心设计：
 * - 每个 Department 是同一套 Loop Engine 的不同配置剖面（Profile），不是独立系统
 * - DepartmentConfig = AgentProfile + GoalTemplate + OutputPipeline + QualityGate
 * - 先做深再做广：抽象层必须能支撑内容产出部的完整需求，同时不阻碍未来部门扩展
 *
 * 文件位置：packages/loop-engine/src/department/types.ts
 */
/**
 * 内容格式类型 — 内容产出部支持的 4 种格式
 *
 * 未来扩展：可在此联合类型中新增成员（如 "podcast", "infographic" 等）
 */
export type ContentType = "article" | "seed" | "short-video" | "newsletter";
/** 所有支持的内容格式列表 */
export declare const CONTENT_TYPES: readonly ContentType[];
/**
 * Writer 约束 — 控制生成行为的参数化约束
 *
 * 覆盖维度：篇幅 / 结构 / 禁止事项 / 必须元素 / 语言风格 / 目标受众
 */
export interface WriterConstraints {
    /** 篇幅约束 */
    lengthConstraint?: {
        minLength?: number;
        maxLength?: number;
        unit: "chars" | "words";
    };
    /** 结构要求 */
    structureRequirement?: {
        mustHaveSections?: string[];
        maxSectionLength?: number;
    };
    /** 禁止事项（如 "禁止使用第一人称"、"禁止出现外部链接"） */
    prohibitions?: string[];
    /** 必须包含元素（如 "必须包含至少3个emoji"、"必须有明确的行动号召(CTA)"） */
    requirements?: string[];
    /**
     * 语言风格
     *
     * 控制 LLM 输出的语气和表达方式
     */
    tone?: "professional" | "casual" | "humorous" | "emotional" | "storytelling";
    /** 目标受众描述（如 "25-35岁一线城市职场女性"） */
    targetAudience?: string;
}
/**
 * Critic 评估维度 — 覆盖默认 GradingCriteria 的部门专属维度
 *
 * 当 departmentConfig.qualityGate 中提供此字段时，
 * CriticAgent 将使用这些维度替代或补充默认的 GradingCriteria。
 */
export interface CriticDimension {
    /** 维度 ID（如 "seed_emoji_density"） */
    id: string;
    /** 维度显示名称（如 "Emoji 密度与使用恰当性"） */
    name: string;
    /** 维度描述（用于 Prompt 注入） */
    description: string;
    /** 该维度满分 */
    maxScore: number;
    /** 评分指导（告诉 LLM 如何打分） */
    scoringGuide: string;
    /** 优秀线（该维度达到此分数视为优秀） */
    excellenceThreshold?: number;
}
/**
 * 风格指南 — 品牌调性手册级别的细粒度控制
 *
 * 用于对 Writer 输出进行品牌一致性约束。
 * 可选：不是所有部门都需要完整的风格指南。
 */
export interface StyleGuide {
    /** 品牌名称 */
    brandName?: string;
    /** 品牌调性关键词（如 "专业但不枯燥"、"有趣但不轻浮"） */
    brandToneKeywords?: string[];
    /** 禁用词汇表 */
    forbiddenWords?: string[];
    /** 必用词汇/短语表 */
    requiredPhrases?: string[];
    /** 格式规范（如 "标题不超过30字"、"段落不超过5行"） */
    formatRules?: string[];
}
/**
 * Agent Profile — 一个部门中 Agent 的完整人格配置
 *
 * 这是 DepartmentConfig 的核心：
 * - writerSystemPrompt: 替换 WriterAgent 的硬编码 SYSTEM_PROMPT
 * - writerConstraints: 参数化约束（篇幅/结构/禁止项等）
 * - criticDimensions: 覆盖默认评分维度
 * - criticSystemPrompt: 替换 CriticAgent 的评估 Prompt
 * - styleGuide: 品牌调性约束
 */
export interface AgentProfile {
    /** Writer 的 System Prompt（完整替换默认值） */
    writerSystemPrompt: string;
    /** Writer 的行为约束（参数化，注入到 Prompt 尾部） */
    writerConstraints: WriterConstraints;
    /** Critic 的评估维度（覆盖默认 GradingCriteria） */
    criticDimensions?: CriticDimension[];
    /** Critic 的 System Prompt（可选，覆盖默认评估指令） */
    criticSystemPrompt?: string;
    /** 风格指南（可选，品牌调性手册） */
    styleGuide?: StyleGuide;
}
/**
 * 部门级 GoalTemplate — 扩展自 completion-guard 的 GoalTemplate
 *
 * 与 completion-guard/goal-templates.ts 中 GoalTemplate 的关系：
 * - completion-guard.GoalTemplate: 通用模板（代码/文章/UI/通用兜底）
 * - department.DepartmentGoalTemplate: 部门专属模板（图文/种草/短视频/Newsletter）
 *
 * 优先级（从高到低）：
 * 1. PlanStep.metadata.acceptanceGoals （显式定义，最高优先）
 * 2. DepartmentConfig.goalTemplates （部门专属模板）
 * 3. GoalTemplateRegistry 内置模板（通用兜底）
 */
export interface DepartmentGoalTemplate {
    /** 匹配条件 */
    match: {
        /** 匹配的 ContentType（* 表示全部） */
        contentType: ContentType | "*";
        /** description 中的关键词（任一匹配即触发） */
        keywords?: string[];
    };
    /** 生成的目标列表工厂 */
    generate: (stepId: string, description: string) => import("../completion-guard/types.js").AcceptanceGoal[];
}
/**
 * 平台类型 — OutputPipeline 支持的目标发布平台
 */
export type PlatformType = "wechat" | "xiaohongshu" | "douyin" | "substack" | "generic";
/**
 * 输出后处理器联合类型
 *
 * 后处理器按顺序组成处理链（pipeline pattern）：
 * FormatConverter → MetadataInjector → PlatformAdapter → QualityChecker
 */
export type OutputPostProcessor = PlatformAdapterProcessor | MetadataInjector | FormatConverter | QualityCheckerProcessor;
/**
 * 平台适配处理器 — 将内容转换为特定平台的 HTML/CSS 格式
 *
 * 示例：
 * - 微信公众号: 内联 CSS + 兼容样式 + 目录导航
 * - 小红书: 卡片式布局 + 圆角 + 渐变背景 + Emoji 标题
 * - 抖音: 分镜脚本格式 + 时间戳标注
 * - Substack: 邮件兼容 HTML + Header/Footer + unsubscribe 链接
 */
export interface PlatformAdapterProcessor {
    type: "platform_adapter";
    platform: PlatformType;
    /** HTML 模板路径（相对于项目根目录） */
    templatePath?: string;
    /** 文本替换规则（key → value） */
    transformations?: Record<string, string>;
}
/**
 * 元数据注入器 — 向输出物注入标题/作者/日期等元信息
 */
export interface MetadataInjector {
    type: "metadata_injector";
    /** 要注入的元数据键值对 */
    metadata: {
        title?: string;
        author?: string;
        date?: string;
        tags?: string[];
        description?: string;
        [key: string]: unknown;
    };
}
/**
 * 格式转换器 — 在输出格式之间转换
 *
 * 支持的转换路径：
 * - markdown → html（最常用）
 * - markdown → plain text（脚本类）
 * - html → json（结构化输出）
 */
export interface FormatConverter {
    type: "format_converter";
    from: "markdown" | "html" | "json" | "plain";
    to: "markdown" | "html" | "json" | "plain";
    /** 转换选项（如 markdown→html 时的 CSS 样式策略） */
    options?: Record<string, unknown>;
}
/**
 * 质量检查处理器 — 发布前的最后安检
 *
 * 在所有其他处理器之后执行，确保最终产物符合基本质量标准。
 */
export interface QualityCheckerProcessor {
    type: "quality_checker";
    /** 检查规则 */
    checks: Array<{
        id: string;
        name: string;
        /** 检查类型 */
        type: "word_count_min" | "word_count_max" | "has_title" | "no_broken_links" | "spam_score" | "custom_regex";
        /** 检查参数 */
        params?: Record<string, unknown>;
        /** 是否阻断（true = 不通过则抛错） */
        blocking: boolean;
    }>;
}
/**
 * Output Pipeline 配置 — 定义产出的后处理链
 *
 * 示例（微信公众号文章）:
 * ```typescript
 * {
 *   primaryFormat: "html",
 *   postProcessors: [
 *     { type: "format_converter", from: "markdown", to: "html" },
 *     { type: "metadata_injector", metadata: { title: "...", author: "..." } },
 *     { type: "platform_adapter", platform: "wechat", templatePath: "templates/wechat.html" },
 *     { type: "quality_checker", checks: [...] },
 *   ],
 * }
 * ```
 */
export interface OutputPipelineConfig {
    /** 主要输出格式 */
    primaryFormat: "markdown" | "html" | "json" | "plain";
    /** 后处理器链（按顺序执行） */
    postProcessors: OutputPostProcessor[];
}
/**
 * 维度权重覆盖 — 覆盖默认 GradingCriteria 中某维度的权重
 */
export interface DimensionWeightOverride {
    dimension: string;
    weight: number;
    description: string;
}
/**
 * 新增评估维度 — 部门特有的、默认 GradingCriteria 中不存在的维度
 *
 * 如种草笔记的 "emoji密度"、短视频的 "节奏感" 等。
 */
export interface ExtraDimension {
    id: string;
    name: string;
    description: string;
    weight: number;
    maxScore: number;
    scoringGuide: string;
}
/**
 * Quality Gate 配置 — 部门级别的质量门槛定义
 *
 * 作用域：
 * - passThreshold: 覆盖默认 75 分通过线
 * - excellenceThreshold: 覆盖默认 90 分优秀线
 * - overrideDimensions: 调整已有维度的权重
 * - extraDimensions: 新增部门特有维度
 */
export interface QualityGateConfig {
    /** 覆盖默认通过阈值（默认 75） */
    passThreshold?: number;
    /** 覆盖默认优秀阈值（默认 90） */
    excellenceThreshold?: number;
    /** 权重覆盖（调整默认维度的权重） */
    overrideDimensions?: DimensionWeightOverride[];
    /** 新增维度（部门特有） */
    extraDimensions?: ExtraDimension[];
}
/**
 * Department Config — 一个部门的完整配置剖面
 *
 * 设计原则：
 * - 这是一个纯配置接口，不含任何运行时逻辑
 * - 所有字段都是可选的聚合（除了身份字段）
 * - 通过组合而非继承实现不同部门的差异化
 *
 * 使用方式：
 * ```typescript
 * const articleDept = contentProductionDept.getConfig("article");
 * // articleDept 包含: 图文专用的 WriterPrompt + 验收目标 + 输出管道 + 质量门槛
 *
 * const harness = new LoopHarness(tools, llmProvider, {
 *   ...existingConfig,
 *   departmentConfig: articleDept,
 * });
 * ```
 */
export interface DepartmentConfig {
    /** 部门唯一标识（如 "content-production"） */
    departmentId: string;
    /** 部门显示名称（如 "内容产出部"） */
    departmentName: string;
    /** 配置版本号（语义化版本） */
    version: string;
    /** 此配置对应的内容格式 */
    contentType: ContentType;
    /** Agent 人格配置（Writer/Critic Prompt + 约束 + 风格指南） */
    agentProfile: AgentProfile;
    /** 部门专属的验收目标模板列表 */
    goalTemplates?: DepartmentGoalTemplate[];
    /** 输出管线配置（为空则跳过后处理） */
    outputPipeline?: OutputPipelineConfig;
    /** 该部门可用工具列表（工具注册表中必须存在） */
    toolSet?: string[];
    /** 部门专属质量门槛（为空则用默认 GradingCriteria） */
    qualityGate?: QualityGateConfig;
}
/**
 * Pipeline 处理结果 — OutputPipeline 执行后的产物
 *
 * 附加在 LoopModuleResult 或 HarnessExecutionResult 上，
 * 表示经过部门配置的后处理链之后的最终交付物。
 */
export interface ProcessedOutput {
    /** 原始内容（LoopModule 产出的 markdown） */
    rawContent: string;
    /** 处理后的内容（经过 pipeline 转换后的最终形式） */
    processedContent: string;
    /** 最终格式 */
    format: "markdown" | "html" | "json" | "plain";
    /** 目标平台（如果有 platform_adapter） */
    platform?: PlatformType;
    /** 产物文件路径列表 */
    outputFiles: string[];
    /** 各处理器执行记录 */
    processorLog: Array<{
        processorType: OutputPostProcessor["type"];
        success: boolean;
        durationMs: number;
        error?: string;
    }>;
}
//# sourceMappingURL=types.d.ts.map