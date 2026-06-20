/**
 * TaskAnalyzer — 任务特征提取器
 *
 * 基于**规则引擎**从 taskInput 文本中提取结构化的 TaskFeatures。
 * 不依赖 LLM 调用，保证低延迟和高确定性。
 *
 * 未来增强路径：
 * - 规则置信度 < 阈值时调用 LLM 做增强分析
 * - 支持从历史数据学习新的特征规则
 *
 * 文件位置：packages/loop-engine/src/team/task-analyzer.ts
 */

import type { TaskFeatures, ContentDomain } from "./types.js";
import type { LLMProvider } from "../interrogate/types.js";
import { retryWithBackoff } from "../utils/retry.js";

// ============================================================
// 特征提取规则
// ============================================================

interface FeatureRule<T = unknown> {
  key: string;
  pattern: RegExp;
  extractor: (match: RegExpMatchArray, input: string) => T;
  description: string;
}

/** 二元特征规则（布尔值） */
interface BinaryFeatureRule extends FeatureRule<boolean> {}

/** 枚举特征规则 */
interface EnumFeatureRule<T extends string> extends FeatureRule<T> {}

// ============================================================
// 预置规则集
// ============================================================

/** 需要调研的关键词 */
const RESEARCH_KEYWORDS =
  /调研|研究|数据|论文|报告|分析|查找|搜集|资料|文献|统计|对比|最新|趋势|市场|竞品/i;

/** 视觉内容关键词 */
const VISUAL_KEYWORDS =
  /小红书|卡片|配图|设计|视觉|种草|图片|插画|封面|排版|UI|界面|配色|风格|美学/i;

/** 技术领域关键词 */
const TECH_KEYWORDS =
  /技术|编程|AI|代码|架构|API|框架|库|语言|算法|数据结构|系统|后端|前端|DevOps|云原生|微服务/i;

/** 生活领域关键词 */
const LIFESTYLE_KEYWORDS =
  /生活|穿搭|美食|旅行|护肤|美妆|家居|健身|摄影|宠物|亲子|情感|人际关系|日常/i;

/** 金融领域关键词 */
const FINANCE_KEYWORDS =
  /金融|投资|股票|基金|理财|保险|创业|商业|营收|增长|融资|估值|财报|经济/i;

/** 教育领域关键词 */
const EDUCATION_KEYWORDS =
  /教育|学习|教程|课程|培训|考试|知识|技能|方法|入门|指南|原理|基础|进阶/i;

/** 高质量关键词 */
const PREMIUM_KEYWORDS =
  /深度|专业|权威|详细|全面|完整|精品|高质量|顶级|专家|资深|行业|白皮书/i;

/** 快速/草稿模式关键词 */
const DRAFT_KEYWORDS =
  /快速|简单|简要|草稿|大纲|初稿|速览|简介|概览|短/i;

/** 高复杂度指示词 */
const HIGH_COMPLEXITY_KEYWORDS =
  /深度|系列|专题|完整体系|全方位|多角度|系统性|综合|对比分析|案例研究|实战项目/i;

/** 低复杂度指示词 */
const LOW_COMPLEXITY_KEYWORDS =
  /简单| brief |简短|一句话|快速|小白|入门|基础|简介|概要/i;

// ============================================================
// TaskAnalyzer 实现
// ============================================================

/**
 * 任务特征提取器
 *
 * 使用方式：
 * ```typescript
 * const analyzer = new TaskAnalyzer();
 * const features = analyzer.analyze("写一篇关于 AI Agent 的深度技术文章");
 * // features.needsResearch === true
 * // features.domain === "tech"
 * // features.complexity === "high"
 * ```
 */
export class TaskAnalyzer {
  private customRules: Array<FeatureRule> = [];

  /**
   * 添加自定义特征规则
   */
  addCustomRule(rule: FeatureRule): void {
    this.customRules.push(rule);
  }

  /**
   * 从 taskInput 中提取任务特征
   *
   * @param input 用户的原始任务输入
   * @returns 结构化的任务特征
   */
  analyze(input: string): TaskFeatures {
    const normalizedInput = input.trim();

    return {
      // === 内容特征 ===
      domain: this.detectDomain(normalizedInput),
      needsResearch: RESEARCH_KEYWORDS.test(normalizedInput),
      hasVisualContent: VISUAL_KEYWORDS.test(normalizedInput),

      // === 篇幅估计 ===
      length: this.estimateLength(normalizedInput),

      // === 质量要求 ===
      qualityTier: this.detectQualityTier(normalizedInput),

      // === 复杂度 ===
      complexity: this.assessComplexity(normalizedInput),
      estimatedSteps: this.estimateSteps(normalizedInput),

      // === 元数据 ===
      confidence: this.calculateConfidence(normalizedInput),
      matchedRuleIds: this.getMatchedRuleIds(normalizedInput),
    };
  }

  // ============================================================
  // 私有方法：特征检测
  // ============================================================

  /** 检测内容领域 */
  private detectDomain(input: string): ContentDomain {
    if (TECH_KEYWORDS.test(input)) return "tech";
    if (LIFESTYLE_KEYWORDS.test(input)) return "lifestyle";
    if (FINANCE_KEYWORDS.test(input)) return "finance";
    if (EDUCATION_KEYWORDS.test(input)) return "education";
    return "general";
  }

  /** 估计内容长度 */
  private estimateLength(input: string): TaskFeatures["length"] {
    const charCount = input.length;

    // 显式长度指示词优先
    if (/长文|深度|详细|完整|2000|3000|3500/.test(input)) return "long";
    if (/短|简短|brief|300|500|800/.test(input)) return "short";

    // 基于输入文本长度推断
    if (charCount > 100) return "long";
    if (charCount > 30) return "medium";
    return "short";
  }

  /** 检测质量档次 */
  private detectQualityTier(input: string): TaskFeatures["qualityTier"] {
    if (PREMIUM_KEYWORDS.test(input)) return "premium";
    if (DRAFT_KEYWORDS.test(input)) return "draft";
    return "standard";
  }

  /** 评估复杂度 */
  private assessComplexity(input: string): TaskFeatures["complexity"] {
    if (HIGH_COMPLEXITY_KEYWORDS.test(input)) return "high";
    if (LOW_COMPLEXITY_KEYWORDS.test(input)) return "low";

    // 综合判断：多个特征同时出现 → 高复杂度
    let score = 0;
    if (RESEARCH_KEYWORDS.test(input)) score += 2;
    if (VISUAL_KEYWORDS.test(input)) score += 1;
    if (PREMIUM_KEYWORDS.test(input)) score += 2;
    if (input.length > 50) score += 1;

    if (score >= 4) return "high";
    if (score >= 2) return "medium";
    return "low";
  }

  /** 估算需要的 Step 数 */
  private estimateSteps(input: string): number {
    // 直接从输入文本计算，不调用 analyze() 避免无限递归
    let steps = 2; // 基础：Writer + Critic

    if (RESEARCH_KEYWORDS.test(input)) steps += 1;
    if (VISUAL_KEYWORDS.test(input)) steps += 1;
    if (PREMIUM_KEYWORDS.test(input)) steps += 1;
    if (HIGH_COMPLEXITY_KEYWORDS.test(input)) steps += 1;

    return Math.min(steps, 6); // 上限 6 个 Step
  }

  /** 计算特征提取置信度
   *
   * 基于命中的关键词覆盖率和输入长度动态计算：
   * - 命中规则越多，置信度越高
   * - 输入过短（<15字）时置信度降低
   * - 返回 0.3 ~ 0.95 的动态值
   */
  private calculateConfidence(input: string): number {
    let hits = 0;
    const totalRules = 7; // 总规则数（domain + research + visual + length + quality + complexity + steps）

    // 计算命中规则数
    if (this.detectDomain(input) !== "general") hits++;
    if (RESEARCH_KEYWORDS.test(input)) hits++;
    if (VISUAL_KEYWORDS.test(input)) hits++;
    if (input.length > 30) hits++; // 长度规则有足够文本
    if (PREMIUM_KEYWORDS.test(input) || DRAFT_KEYWORDS.test(input)) hits++;
    if (HIGH_COMPLEXITY_KEYWORDS.test(input) || LOW_COMPLEXITY_KEYWORDS.test(input)) hits++;
    if (input.length >= 15) hits++; // 输入长度足够

    // 基础置信度：命中规则数 / 总规则数
    let confidence = hits / totalRules;

    // 输入过短惩罚
    if (input.length < 15) confidence *= 0.5;
    else if (input.length < 30) confidence *= 0.8;

    // 限制范围 [0.3, 0.95]
    return Math.max(0.3, Math.min(0.95, confidence));
  }

  /** 获取命中的规则 ID 列表（用于调试） */
  private getMatchedRuleIds(input: string): string[] {
    const ids: string[] = [];
    if (RESEARCH_KEYWORDS.test(input)) ids.push("needs-research");
    if (VISUAL_KEYWORDS.test(input)) ids.push("visual-content");
    if (PREMIUM_KEYWORDS.test(input)) ids.push("premium-quality");
    if (HIGH_COMPLEXITY_KEYWORDS.test(input)) ids.push("high-complexity");
    return ids;
  }

  // ============================================================
  // 混合模式：规则引擎 + LLM 兆底
  // ============================================================

  /**
   * 混合模式分析：规则引擎优先 + 低置信度时 LLM 兆底
   *
   * 流程：
   * 1. 规则引擎提取特征
   * 2. 置信度 < 0.6 且有 LLM Provider → 调用 LLM 补充分析
   * 3. LLM 调用失败时降级回规则引擎结果
   *
   * @param input 用户任务输入
   * @param llmProvider 可选的 LLM Provider
   * @returns 结构化的任务特征
   */
  async analyzeWithFallback(
    input: string,
    llmProvider?: LLMProvider,
  ): Promise<TaskFeatures> {
    // Step 1: 规则引擎提取
    const ruleFeatures = this.analyze(input);

    // Step 2: 置信度足够，直接返回
    if (ruleFeatures.confidence >= 0.6 || !llmProvider) {
      return ruleFeatures;
    }

    // Step 3: 低置信度 + 有 LLM → 调用 LLM 补充分析
    console.log(`[TaskAnalyzer] 置信度偏低 (${ruleFeatures.confidence.toFixed(2)})，调用 LLM 补充分析`);

    try {
      const llmFeatures = await retryWithBackoff(
        () => this.llmEnhance(input, ruleFeatures, llmProvider),
        { maxAttempts: 2, baseDelayMs: 1000 },
      );

      // 合并 LLM 结果到规则引擎结果上
      return {
        ...ruleFeatures,
        domain: llmFeatures.domain ?? ruleFeatures.domain,
        complexity: llmFeatures.complexity ?? ruleFeatures.complexity,
        confidence: Math.max(ruleFeatures.confidence, 0.75), // LLM 增强后提升置信度
        matchedRuleIds: [
          ...(ruleFeatures.matchedRuleIds ?? []),
          "llm-enhanced",
        ],
      };
    } catch (e) {
      console.warn(`[TaskAnalyzer] LLM 增强失败，降级回规则引擎结果: ${e instanceof Error ? e.message : e}`);
      return ruleFeatures;
    }
  }

  /**
   * LLM 增强分析 — 调用 LLM 提取规则和难以捕捉的特征
   */
  private async llmEnhance(
    input: string,
    ruleFeatures: TaskFeatures,
    llmProvider: LLMProvider,
  ): Promise<{ domain?: ContentDomain; complexity?: TaskFeatures["complexity"] }> {
    const prompt = `你是一个任务分析器。请分析以下用户任务，提取特征。

用户任务: "${input}"

规则引擎已识别的特征:
- 领域: ${ruleFeatures.domain}
- 复杂度: ${ruleFeatures.complexity}
- 需要调研: ${ruleFeatures.needsResearch}
- 质量档次: ${ruleFeatures.qualityTier}

请用 JSON 格式返回你的判断（只返回 JSON，不要其他文字）:
{
  "domain": "tech|lifestyle|finance|education|general",
  "complexity": "high|medium|low",
  "reasoning": "简要说明你的判断依据"
}`;

    const response = await llmProvider.chat([
      { role: "system", content: "你是一个精确的任务分析器，只返回 JSON 格式结果。" },
      { role: "user", content: prompt },
    ]);

    try {
      const parsed = JSON.parse(response.trim());
      return {
        domain: parsed.domain as ContentDomain,
        complexity: parsed.complexity as TaskFeatures["complexity"],
      };
    } catch {
      console.warn("[TaskAnalyzer] LLM 返回非法 JSON，忽略增强结果");
      return {};
    }
  }
}

// ============================================================
// 成功案例匹配工具（静态方法）
// ============================================================

/** 简化版任务特征向量（与 SuccessCase.taskFeatures 兼容） */
interface FeatureVector {
  domain: string;
  complexity: string;
  needsResearch: boolean;
  qualityTier: string;
  confidence: number;
}

/** 成功案例引用（与 memory 包的 SuccessCase 兼容） */
interface CaseRef {
  taskFeatures: FeatureVector;
  score: number;
  contentType: string;
  [key: string]: unknown;
}

/**
 * 基于特征向量的余笛相似度匹配成功案例
 *
 * 将类别特征编码为数值向量，计算余笛相似度，
 * 返回相似度超过阈值的案例按评分降序排列。
 *
 * @param cases 成功案例库
 * @param features 当前任务特征
 * @param topK 返回前 K 个匹配
 * @returns 匹配的案例及其相似度分数
 */
export function findSimilarCases(
  cases: CaseRef[],
  features: TaskFeatures,
  topK: number = 3,
): Array<{ case: CaseRef; similarity: number }> {
  if (!cases || cases.length === 0) return [];

  const queryVec = encodeFeatures(features);

  const scored = cases.map((c) => {
    const caseVec = encodeFeatures(c.taskFeatures);
    const similarity = cosineSimilarity(queryVec, caseVec);
    return { case: c, similarity };
  });

  // 按相似度降序，过滤低分，取前 K 个
  return scored
    .filter((s) => s.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/** 将特征编码为数值向量 */
function encodeFeatures(f: FeatureVector): number[] {
  const domainMap: Record<string, number> = {
    tech: 1, lifestyle: 2, finance: 3, education: 4, general: 0,
  };
  const complexityMap: Record<string, number> = {
    high: 3, medium: 2, low: 1,
  };
  const qualityMap: Record<string, number> = {
    premium: 3, standard: 2, draft: 1,
  };

  return [
    domainMap[f.domain] ?? 0,
    complexityMap[f.complexity] ?? 1,
    f.needsResearch ? 1 : 0,
    qualityMap[f.qualityTier] ?? 1,
    f.confidence,
  ];
}

/** 计算余笛相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
