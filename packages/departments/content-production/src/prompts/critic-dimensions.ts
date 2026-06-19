/**
 * 内容产出部 — Critic 评估维度定义
 *
 * 每种内容格式有专属的评估维度，
 * 覆盖默认 GradingCriteria 中的通用维度。
 *
 * 使用方式：
 * ```typescript
 * import { getCriticDimensions } from "@aicos/content-production";
 * const dims = getCriticDimensions("article"); // 返回图文专用的 CriticDimension[]
 * ```
 */

import type { CriticDimension } from "@aicos/loop-engine";

// ============================================================
// 1. 图文/长文 (Article) — 公众号/知乎
// ============================================================

/** 图文文章的 Critic 评估维度 */
export const ARTICLE_CRITIC_DIMENSIONS: CriticDimension[] = [
  {
    id: "article_depth",
    name: "内容深度与洞察力",
    description: "文章是否有独到观点、深度分析，而非表面罗列信息",
    maxScore: 20,
    excellenceThreshold: 17,
    scoringGuide:
      "20分: 有原创性洞察或框架，读者读后获得'原来如此'的认知升级\n" +
      "15-19分: 分析有层次，有数据/案例支撑，但缺乏突破性视角\n" +
      "10-14分: 信息准确但偏百科式罗列，缺少个人判断和深度挖掘\n" +
      "0-9分: 浅尝辄止，信息量不足或存在事实性错误",
  },
  {
    id: "article_structure",
    name: "结构逻辑与可读性",
    description: "文章结构是否清晰、逻辑是否连贯、阅读体验是否流畅",
    maxScore: 20,
    excellenceThreshold: 17,
    scoringGuide:
      "20分: 结构精妙，起承转合自然，读者能顺畅跟随作者思路\n" +
      "15-19分: 结构清晰，章节划分合理，有小瑕疵但不影响理解\n" +
      "10-14分: 有基本结构但逻辑跳跃或段落衔接生硬\n" +
      "0-9分: 结构混乱，读者难以把握文章脉络",
  },
  {
    id: "article_seo",
    name: "SEO 与关键词布局",
    description: "关键词分布是否合理、是否符合搜索引擎优化原则",
    maxScore: 15,
    excellenceThreshold: 12,
    scoringGuide:
      "15分: 关键词自然融入标题/首段/小标题/正文，密度1.5%-3%\n" +
      "11-14分: 主要关键词覆盖良好，但有少量遗漏或密度略偏\n" +
      "6-10分: 关键词存在但布局不合理（如堆砌在一段中）\n" +
      "0-5分: 几乎无关键词意识或明显关键词堆砌",
  },
  {
    id: "article_language",
    name: "语言表达质量",
    description: "文字是否准确、简洁、有感染力，避免冗余和语病",
    maxScore: 20,
    excellenceThreshold: 17,
    scoringGuide:
      "20分: 语言精准有力，金句频出，几乎无可删减的冗余\n" +
      "15-19分: 表达清晰流畅，偶有可优化的表述\n" +
      "10-14分: 基本通顺但存在啰嗦/口语化过度/术语不当\n" +
      "0-9分: 语病多、表意不清或大量填充性文字",
  },
  {
    id: "article_cta",
    name: "行动号召 (CTA)",
    description: "结尾是否有明确的引导读者行动（关注/点赞/评论/转发）",
    maxScore: 10,
    excellenceThreshold: 8,
    scoringGuide:
      "10分: CTA 自然有力，与文章主题高度相关，有明确行动指引\n" +
      "7-9分: 有CTA但略显生硬或不够具体\n" +
      "4-6分: CTA模糊或缺失\n" +
      "0-3分: 无任何互动引导",
  },
  {
    id: "article_topic_accuracy",
    name: "主题契合度",
    description: "内容是否紧密围绕用户指定的主题，有无偏题或跑题",
    maxScore: 15,
    excellenceThreshold: 12,
    scoringGuide:
      "15分: 完全围绕核心主题展开，每个段落都服务于主旨\n" +
      "11-14分: 核心主题明确，有少量边缘内容但不影响整体\n" +
      "6-10分: 存在明显的偏题段落或无关扩展\n" +
      "0-5分: 严重偏题或完全偏离任务要求",
  },
];

// ============================================================
// 2. 种草/短图文 (Seed) — 小红书
// ============================================================

/** 种草笔记的 Critic 评估维度 */
export const SEED_CRITIC_DIMENSIONS: CriticDimension[] = [
  {
    id: "seed_attractiveness",
    name: "吸引力与点击欲望",
    description: "标题和首图描述是否能瞬间抓住注意力，激发点击/阅读欲望",
    maxScore: 25,
    excellenceThreshold: 21,
    scoringGuide:
      "25分: 标题有强烈好奇心缺口或情绪共鸣，首图描述让人想立刻看全文\n" +
      "18-24分: 标题吸引人，首图描述清晰，有一定吸引力\n" +
      "12-17分: 标题普通但能传达内容，吸引力一般\n" +
      "0-11分: 标题平淡无奇，无法激发任何点击冲动",
  },
  {
    id: "seed_authenticity",
    name: "真实感与信任度",
    description: "内容是否像真人分享而非广告，能否建立读者信任",
    maxScore: 25,
    excellenceThreshold: 21,
    scoringGuide:
      "25分: 读起来像朋友真心推荐，有细节/感受/小缺点增加可信度\n" +
      "18-24分: 整体真实感强，偶有稍显刻意的表达\n" +
      "12-17分: 有真实元素但广告痕迹较明显\n" +
      "0-11分: 明显的广告腔/营销号风格，毫无真实感",
  },
  {
    id: "seed_emoji_usage",
    name: "Emoji 使用恰当性",
    description: "Emoji 是否丰富且使用得当，增强视觉节奏和情感表达",
    maxScore: 15,
    excellenceThreshold: 12,
    scoringGuide:
      "15分: Emoji ≥5个，每个位置恰到好处，增强情感表达不显多余\n" +
      "11-14分: Emoji 数量达标但个别位置略显牵强\n" +
      "6-10分: Emoji 过少(＜5个)或过多导致视觉杂乱\n" +
      "0-5分: 几乎无Emoji或滥用导致阅读障碍",
  },
  {
    id: "seed_conversion",
    name: "转化潜力",
    description: "内容是否有效引导读者产生购买/关注/咨询等目标行为",
    maxScore: 20,
    excellenceThreshold: 16,
    scoringGuide:
      "20分: 种草逻辑完整（痛点→产品→效果→行动），转化路径清晰\n" +
      "15-19分: 种草要素齐全但某环节稍弱\n" +
      "9-14分: 有推荐意图但缺乏说服力或CTA不明确\n" +
      "0-8分: 纯分享无转化意识或硬推销引起反感",
  },
  {
    id: "seed_format_compliance",
    name: "平台格式规范",
    description: "是否符合小红书的格式要求（标签/段落长度/话题标签）",
    maxScore: 15,
    excellenceThreshold: 12,
    scoringGuide:
      "15分: #话题标签# 格式正确(5-10个)，每段≤4行，CTA位置恰当\n" +
      "11-14分: 格式基本合规，有小瑕疵\n" +
      "6-10分: 存在明显的格式违规（如过长段落/标签缺失）\n" +
      "0-5分: 完全不符合小红书格式规范",
  },
];

// ============================================================
// 3. 短视频脚本 (Short Video) — 抖音/TikTok
// ============================================================

/** 短视频脚本的 Critic 评估维度 */
export const SHORT_VIDEO_CRITIC_DIMENSIONS: CriticDimension[] = [
  {
    id: "sv_hook",
    name: "黄金3秒钩子强度",
    description: "开头3秒是否能抓住观众注意力，防止划走",
    maxScore: 25,
    excellenceThreshold: 21,
    scoringGuide:
      "25分: 钩子极具冲击力（悬念/冲突/反常识），观众必看下去\n" +
      "18-24分: 钩子有效，能留住大部分观众\n" +
      "12-17分: 钩子一般，可能流失部分观众\n" +
      "0-11分: 开头平淡无奇，高概率被划走",
  },
  {
    id: "sv_rhythm",
    name: "节奏感与口语化程度",
    description: "脚本节奏是否紧凑，语言是否适合口播（非书面语）",
    maxScore: 25,
    excellenceThreshold: 21,
    scoringGuide:
      "25分: 节奏紧凑，每5秒一个信息点，纯口语化，朗朗上口\n" +
      "18-24分: 节奏良好，基本口语化，个别处稍显书面\n" +
      "12-17分: 节奏有松散处，混入较多书面表达\n" +
      "0-11分: 节奏拖沓或大量书面语不适合口播",
  },
  {
    id: "sv_scene_design",
    name: "场景设计完整性",
    description: "场景标记是否完整（画面/音效/字幕/口播），是否具象可拍摄",
    maxScore: 20,
    excellenceThreshold: 16,
    scoringGuide:
      "20分: 所有场景标记完整且具象，导演可直接按脚本拍摄\n" +
      "15-19分: 标记基本完整，少数场景描述需补充\n" +
      "9-14分: 标记不完整或有抽象描述难以执行\n" +
      "0-8分: 缺少关键标记或描述过于抽象",
  },
  {
    id: "sv_completion_drive",
    name: "完播率驱动设计",
    description: "脚本是否通过悬念/反转/情绪曲线驱动观众看完",
    maxScore: 20,
    excellenceThreshold: 16,
    scoringGuide:
      "20分: 悬念层层递进，反转出人意料，情绪曲线精心设计\n" +
      "15-19分: 有基本的完播设计（悬念/反转）\n" +
      "9-14分: 平铺直叙，缺乏完播驱动力\n" +
      "0-8分: 无任何完播设计考虑",
  },
  {
    id: "sv_cta",
    name: "结尾 CTA",
    description: "结尾是否有明确的关注/点赞/评论/购买引导",
    maxScore: 10,
    excellenceThreshold: 8,
    scoringGuide:
      "10分: CTA 与内容自然衔接，有明确的行动指引和理由\n" +
      "7-9分: 有CTA但略显突兀\n" +
      "4-6分: CTA模糊或缺失\n" +
      "0-3分: 无任何结尾互动引导",
  },
];

// ============================================================
// 4. Newsletter / 周报
// ============================================================

/** Newsletter 的 Critic 评估维度 */
export const NEWSLETTER_CRITIC_DIMENSIONS: CriticDimension[] = [
  {
    id: "nl_open_rate",
    name: "打开率要素（标题+预览文本）",
    description: "Subject Line 和 Preview Text 是否能有效提升邮件打开率",
    maxScore: 20,
    excellenceThreshold: 16,
    scoringGuide:
      "20分: 标题有强烈的好奇心/价值/个性化元素，预览文本完美互补\n" +
      "15-19分: 标题吸引人，预览文本尚可\n" +
      "9-14分: 标题普通，预览文本未发挥作用\n" +
      "0-8分: 标题毫无吸引力或触发垃圾邮件过滤",
  },
  {
    id: "nl_readability",
    name: "可读性与信噪比",
    description: "内容是否易读、信息密度高、无废话",
    maxScore: 20,
    excellenceThreshold: 16,
    scoringGuide:
      "20分: 每句话都有价值，无一句废话，排版舒适易扫读\n" +
      "15-19分: 整体易读，偶有可删减的内容\n" +
      "9-14分: 存在冗余段落或信息密度偏低\n" +
      "0-8分: 大量填充内容或排版混乱",
  },
  {
    id: "nl_value_density",
    name: "价值密度",
    description: "读者花费时间阅读后获得的实际价值（洞察/工具/资源）",
    maxScore: 25,
    excellenceThreshold: 21,
    scoringGuide:
      "25分: 读完获得多个可立即使用的洞察/工具/方法论\n" +
      "18-24分: 有明确价值但数量或深度有限\n" +
      "12-17分: 有一定价值但偏泛泛而谈\n" +
      "0-11分: 缺乏实质价值，读后感觉浪费时间",
  },
  {
    id: "nl_personal_voice",
    name: "个人化声音",
    description: "是否像真人在写信而非企业公关稿",
    maxScore: 20,
    excellenceThreshold: 16,
    scoringGuide:
      "20分: 强烈的个人风格，读者感觉在和真人对话\n" +
      "15-19分: 有个人色彩但偶尔显得正式\n" +
      "9-14分: 个人感较弱，接近通用模板\n" +
      "0-8分: 完全的企业公关腔或AI生成感",
  },
  {
    id: "nl_spam_safety",
    name: "垃圾邮件安全",
    description: "是否避免了一切垃圾邮件触发词和可疑格式",
    maxScore: 15,
    excellenceThreshold: 12,
    scoringGuide:
      "15分: 完全安全，零触发词，格式规范\n" +
      "11-14分: 基本安全，有1-2个轻微风险词\n" +
      "6-10分: 存在明显的垃圾邮件触发风险\n" +
      "0-5分: 多个高风险触发词或可疑格式",
  },
];

// ============================================================
// 5. 工厂函数
// ============================================================

/** 所有支持的内容格式类型 */
export type ContentType = import("@aicos/loop-engine").ContentType;

/** 根据 ContentType 获取对应的 Critic 评估维度 */
export function getCriticDimensions(contentType: ContentType): CriticDimension[] {
  switch (contentType) {
    case "article":
      return ARTICLE_CRITIC_DIMENSIONS;
    case "seed":
      return SEED_CRITIC_DIMENSIONS;
    case "short-video":
      return SHORT_VIDEO_CRITIC_DIMENSIONS;
    case "newsletter":
      return NEWSLETTER_CRITIC_DIMENSIONS;
    default:
      // 兜底：返回空数组（使用默认 GradingCriteria）
      console.warn(`[ContentProduction] 未知的 contentType: "${contentType}", 使用默认评估维度`);
      return [];
  }
}
