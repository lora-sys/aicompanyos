/**
 * AI Company OS — 内容产出部 (Content Production Department)
 *
 * 第一个部门实现，基于 ADR-005 部门制架构。
 *
 * 提供 4 种内容格式的完整配置剖面：
 * - article: 图文/长文（公众号/知乎）
 * - seed: 种草/短图文（小红书）
 * - short-video: 短视频脚本（抖音/TikTok）
 * - newsletter: Newsletter/周报（Substack）
 *
 * 使用方式：
 * ```typescript
 * import { ContentProductionDepartment } from "@aicos/content-production";
 *
 * const dept = new ContentProductionDepartment();
 * const config = dept.getConfig("article"); // 返回完整的 DepartmentConfig
 *
 * // 注入 LoopHarness
 * const harness = new LoopHarness(tools, llmProvider, {
 *   departmentConfig: config,
 * });
 * ```
 */

import type {
  ContentType,
  DepartmentConfig,
  AgentProfile,
  WriterConstraints,
  OutputPipelineConfig,
  QualityGateConfig,
} from "@aicos/loop-engine";
import { getCriticDimensions } from "./prompts/critic-dimensions.js";
import { getDepartmentGoalTemplates } from "./goals/index.js";
import { createDefaultOutputPipeline } from "./output/pipeline.js";
import { ARTICLE_WRITER_PROMPT } from "./prompts/writer-article.js";
import { SEED_WRITER_PROMPT } from "./prompts/writer-seed.js";
import { SHORT_VIDEO_WRITER_PROMPT } from "./prompts/writer-short-video.js";
import { NEWSLETTER_WRITER_PROMPT } from "./prompts/writer-newsletter.js";

// ============================================================
// Prompt 映射表
// ============================================================

/** 各格式的 Writer System Prompt */
const WRITER_PROMPTS: Record<ContentType, string> = {
  article: ARTICLE_WRITER_PROMPT,
  seed: SEED_WRITER_PROMPT,
  "short-video": SHORT_VIDEO_WRITER_PROMPT,
  newsletter: NEWSLETTER_WRITER_PROMPT,
};

// ============================================================
// 格式专属的 WriterConstraints
// ============================================================

/** 图文的篇幅和结构约束 */
const ARTICLE_CONSTRAINTS: WriterConstraints = {
  lengthConstraint: { minLength: 2000, maxLength: 3500, unit: "chars" },
  structureRequirement: {
    mustHaveSections: ["引言", "正文", "总结"],
    maxSectionLength: 500,
  },
  prohibitions: [
    "禁止抄袭或大段引用他人内容",
    "禁止使用第一人称超过3次",
    "禁止偏离用户指定的主题",
    "禁止标题党或夸大其词",
    "禁止发布未经验证的信息作为事实",
  ],
  requirements: [
    "必须包含至少1个数据或案例支撑观点",
    "必须有明确的行动号召(CTA)段落",
    "必须包含SEO关键词且密度在1.5%-3%之间",
  ],
  tone: "professional",
  targetAudience: "25-45岁对技术和商业感兴趣的职场人士",
};

/** 种草笔记的约束 */
const SEED_CONSTRAINTS: WriterConstraints = {
  lengthConstraint: { minLength: 300, maxLength: 800, unit: "chars" },
  structureRequirement: {
    mustHaveSections: ["标题", "正文", "标签"],
    maxSectionLength: 150,
  },
  prohibitions: [
    "禁止硬广腔调或营销号风格",
    "禁止说教式表达（'你应该''你必须'）",
    "禁止长篇大论（单段不超过4行）",
    "禁止堆砌形容词（'绝绝子''yyds'等过度使用）",
  ],
  requirements: [
    "必须包含至少5个emoji",
    "必须包含#话题#格式标签（5-10个）",
    "必须有明确的互动引导（@xxx或'评论区见'）",
    "首段必须有画面感描述（用于AI配图参考）",
  ],
  tone: "casual",
  targetAudience: "25-35岁一线城市追求生活品质的年轻女性为主",
};

/** 短视频脚本的约束 */
const SHORT_VIDEO_CONSTRAINTS: WriterConstraints = {
  lengthConstraint: { minLength: 500, maxLength: 1000, unit: "chars" },
  structureRequirement: {
    mustHaveSections: ["钩子", "场景", "反转", "CTA"],
    maxSectionLength: 200,
  },
  prohibitions: [
    "禁止书面语表达（如'综上所述''由此可见'）",
    "禁止复杂句式（单句不超过15个字）",
    "禁止被动语态",
    "禁止学术腔或说教口吻",
    "禁止没有画面感的纯文字叙述",
  ],
  requirements: [
    "必须使用[场景N]标记系统（至少3个场景）",
    "每个场景必须包含[画面][音效][字幕][口播]标记",
    "开头3秒必须是强钩子（悬念/冲突/反常识）",
    "总时长估算必须在30-120秒区间内",
    "结尾必须有明确的CTA（关注/点赞/评论/购买）",
  ],
  tone: "emotional",
  targetAudience: "18-35岁短视频平台活跃用户，注意力持续时间短",
};

/** Newsletter 的约束 */
const NEWSLETTER_CONSTRAINTS: WriterConstraints = {
  lengthConstraint: { minLength: 800, maxLength: 2000, unit: "chars" },
  structureRequirement: {
    mustHaveSections: ["问候", "主题", "板块", "推荐", "署名"],
    maxSectionLength: 400,
  },
  prohibitions: [
    "禁止垃圾邮件触发词（免费/中奖/!!!/urgent/限时）",
    "禁止点击党标题",
    "禁止过度格式化（大量加粗/颜色/emoji轰炸）",
    "禁止企业公关腔或模板化表达",
  ],
  requirements: [
    "必须包含unsubscribe链接占位符{{UNSUBSCRIBE_LINK}}",
    "必须有P.S.段落（阅读率最高的位置）",
    "必须有转发/分享引导",
    "Subject Line必须独立提供（不在正文中）",
  ],
  tone: "storytelling",
  targetAudience: "已订阅邮件列表的对该领域感兴趣的专业人士",
};

/** 各格式的 WriterConstraints 映射 */
const CONSTRAINTS_MAP: Record<ContentType, WriterConstraints> = {
  article: ARTICLE_CONSTRAINTS,
  seed: SEED_CONSTRAINTS,
  "short-video": SHORT_VIDEO_CONSTRAINTS,
  newsletter: NEWSLETTER_CONSTRAINTS,
};

// ============================================================
// 格式专属的 QualityGate
// ============================================================

/** 各格式的质量门槛配置 */
const QUALITY_GATES: Record<ContentType, QualityGateConfig> = {
  article: {
    passThreshold: 75,
    excellenceThreshold: 90,
  },
  seed: {
    passThreshold: 70,
    excellenceThreshold: 85,
    extraDimensions: [
      {
        id: "seed_emoji_density_score",
        name: "Emoji 密度评分",
        description: "Emoji 数量是否在合理范围(5-15个)且位置恰当",
        weight: 5,
        maxScore: 20,
        scoringGuide:
          "20分: Emoji 8-12个，每个增强表达不显多余\n" +
          "15-19分: Emoji 5-7或13-15个，基本恰当\n" +
          "10-14分: Emoji ＜5或＞15个\n" +
          "0-9分: 无Emoji或严重滥用",
      },
    ],
  },
  "short-video": {
    passThreshold: 72,
    excellenceThreshold: 88,
  },
  newsletter: {
    passThreshold: 73,
    excellenceThreshold: 87,
    extraDimensions: [
      {
        id: "nl_spam_safety_score",
        name: "垃圾邮件安全评分",
        description: "是否完全避免垃圾邮件触发词和可疑格式",
        weight: 5,
        maxScore: 15,
        scoringGuide:
          "15分: 零触发词，格式完美\n" +
          "11-14分: 1-2个轻微风险词\n" +
          "6-10分: 明显触发风险\n" +
          "0-5分: 多个高风险词",
      },
    ],
  },
};

// ============================================================
// ContentProductionDepartment 主类
// ============================================================

/**
 * 内容产出部 — AI Company OS 的第一个部门
 *
 * 职责：根据选定的内容格式，生成完整的 DepartmentConfig，
 * 包含 Agent 人格、评估维度、验收目标、输出管线、质量门槛。
 *
 * 设计原则：先做深再做广 — 第一个部门的抽象必须能正确支撑
 * 未来 R&D / Operations 等部门的扩展，而不是为图文写死逻辑。
 */
export class ContentProductionDepartment {
  /** 部门标识 */
  static readonly DEPARTMENT_ID = "content-production";
  /** 部门名称 */
  static readonly DEPARTMENT_NAME = "内容产出部";
  /** 当前版本 */
  static readonly VERSION = "1.0.0";

  /** 支持的所有内容格式 */
  static readonly SUPPORTED_TYPES: readonly ContentType[] = [
    "article",
    "seed",
    "short-video",
    "newsletter",
  ];

  // ============================================================
  // 核心 API: 获取部门配置
  // ============================================================

  /**
   * 根据内容格式获取完整的部门配置
   *
   * @param contentType 内容格式类型
   * @returns 完整的 DepartmentConfig，可直接注入 LoopHarness
   */
  getConfig(contentType: ContentType): DepartmentConfig {
    if (!ContentProductionDepartment.SUPPORTED_TYPES.includes(contentType)) {
      throw new Error(
        `[ContentProductionDepartment] 不支持的内容格式: "${contentType}"。` +
        `支持的类型: ${ContentProductionDepartment.SUPPORTED_TYPES.join(", ")}`
      );
    }

    return {
      // === 身份 ===
      departmentId: ContentProductionDepartment.DEPARTMENT_ID,
      departmentName: ContentProductionDepartment.DEPARTMENT_NAME,
      version: ContentProductionDepartment.VERSION,
      contentType,

      // === Agent Profile ===
      agentProfile: this.buildAgentProfile(contentType),

      // === Goal Template (Phase C: 部门专属验收目标) ===
      goalTemplates: getDepartmentGoalTemplates(contentType),

      // === Output Pipeline (Phase D: 平台适配输出管线) ===
      outputPipeline: createDefaultOutputPipeline(contentType),

      // === Tool Set ===
      toolSet: ["web_search", "file_write"],

      // === Quality Gate ===
      qualityGate: QUALITY_GATES[contentType],
    };
  }

  /**
   * 获取所有可用的内容格式列表（用于 CLI 层展示选项）
   */
  getAvailableTypes(): Array<{ type: ContentType; label: string; description: string }> {
    return [
      {
        type: "article",
        label: "图文/长文",
        description: "公众号/知乎深度文章 (2000-3500字)",
      },
      {
        type: "seed",
        label: "种草/短图文",
        description: "小红书种草笔记 (300-800字)",
      },
      {
        type: "short-video",
        label: "短视频脚本",
        description: "抖音/TikTok 分镜脚本 (30-120秒)",
      },
      {
        type: "newsletter",
        label: "Newsletter/周报",
        description: "Substack/邮件通讯 (800-2000字)",
      },
    ];
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 构建指定格式的 AgentProfile
   */
  private buildAgentProfile(contentType: ContentType): AgentProfile {
    return {
      writerSystemPrompt: WRITER_PROMPTS[contentType],
      writerConstraints: CONSTRAINTS_MAP[contentType],
      criticDimensions: getCriticDimensions(contentType),
    };
  }
}

// ============================================================
// 便捷导出
// ============================================================

/** 默认实例（单例模式，避免重复创建） */
export const contentProductionDept = new ContentProductionDepartment();

// Output Pipeline 导出（供 LoopHarness 动态导入使用）
export { OutputPipeline, createDefaultOutputPipeline } from "./output/pipeline.js";
export type { PipelineContext } from "./output/pipeline.js";

// Memory 初始化导出
export { initDepartmentMemory } from "./memory-init.js";
export type { MemoryInitResult } from "./memory-init.js";

// Team（动态团队）导出
export {
  ContentTeamManager,
  CONTENT_TEAM_RULES,
  createContentWorkerRegistrations,
  registerContentWorkers,
} from "./team/index.js";
export type {
  ContentWorkerConfig,
  ContentTeamConfig,
  ContentTeamContext,
} from "./team/index.js";
