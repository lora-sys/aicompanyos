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
// ============================================================
// 预置规则集
// ============================================================
/** 需要调研的关键词 */
const RESEARCH_KEYWORDS = /调研|研究|数据|论文|报告|分析|查找|搜集|资料|文献|统计|对比|最新|趋势|市场|竞品/i;
/** 视觉内容关键词 */
const VISUAL_KEYWORDS = /小红书|卡片|配图|设计|视觉|种草|图片|插画|封面|排版|UI|界面|配色|风格|美学/i;
/** 技术领域关键词 */
const TECH_KEYWORDS = /技术|编程|AI|代码|架构|API|框架|库|语言|算法|数据结构|系统|后端|前端|DevOps|云原生|微服务/i;
/** 生活领域关键词 */
const LIFESTYLE_KEYWORDS = /生活|穿搭|美食|旅行|护肤|美妆|家居|健身|摄影|宠物|亲子|情感|人际关系|日常/i;
/** 金融领域关键词 */
const FINANCE_KEYWORDS = /金融|投资|股票|基金|理财|保险|创业|商业|营收|增长|融资|估值|财报|经济/i;
/** 教育领域关键词 */
const EDUCATION_KEYWORDS = /教育|学习|教程|课程|培训|考试|知识|技能|方法|入门|指南|原理|基础|进阶/i;
/** 高质量关键词 */
const PREMIUM_KEYWORDS = /深度|专业|权威|详细|全面|完整|精品|高质量|顶级|专家|资深|行业|白皮书/i;
/** 快速/草稿模式关键词 */
const DRAFT_KEYWORDS = /快速|简单|简要|草稿|大纲|初稿|速览|简介|概览|短/i;
/** 高复杂度指示词 */
const HIGH_COMPLEXITY_KEYWORDS = /深度|系列|专题|完整体系|全方位|多角度|系统性|综合|对比分析|案例研究|实战项目/i;
/** 低复杂度指示词 */
const LOW_COMPLEXITY_KEYWORDS = /简单| brief |简短|一句话|快速|小白|入门|基础|简介|概要/i;
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
    customRules = [];
    /**
     * 添加自定义特征规则
     */
    addCustomRule(rule) {
        this.customRules.push(rule);
    }
    /**
     * 从 taskInput 中提取任务特征
     *
     * @param input 用户的原始任务输入
     * @returns 结构化的任务特征
     */
    analyze(input) {
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
    detectDomain(input) {
        if (TECH_KEYWORDS.test(input))
            return "tech";
        if (LIFESTYLE_KEYWORDS.test(input))
            return "lifestyle";
        if (FINANCE_KEYWORDS.test(input))
            return "finance";
        if (EDUCATION_KEYWORDS.test(input))
            return "education";
        return "general";
    }
    /** 估计内容长度 */
    estimateLength(input) {
        const charCount = input.length;
        // 显式长度指示词优先
        if (/长文|深度|详细|完整|2000|3000|3500/.test(input))
            return "long";
        if (/短|简短|brief|300|500|800/.test(input))
            return "short";
        // 基于输入文本长度推断
        if (charCount > 100)
            return "long";
        if (charCount > 30)
            return "medium";
        return "short";
    }
    /** 检测质量档次 */
    detectQualityTier(input) {
        if (PREMIUM_KEYWORDS.test(input))
            return "premium";
        if (DRAFT_KEYWORDS.test(input))
            return "draft";
        return "standard";
    }
    /** 评估复杂度 */
    assessComplexity(input) {
        if (HIGH_COMPLEXITY_KEYWORDS.test(input))
            return "high";
        if (LOW_COMPLEXITY_KEYWORDS.test(input))
            return "low";
        // 综合判断：多个特征同时出现 → 高复杂度
        let score = 0;
        if (RESEARCH_KEYWORDS.test(input))
            score += 2;
        if (VISUAL_KEYWORDS.test(input))
            score += 1;
        if (PREMIUM_KEYWORDS.test(input))
            score += 2;
        if (input.length > 50)
            score += 1;
        if (score >= 4)
            return "high";
        if (score >= 2)
            return "medium";
        return "low";
    }
    /** 估算需要的 Step 数 */
    estimateSteps(input) {
        // 直接从输入文本计算，不调用 analyze() 避免无限递归
        let steps = 2; // 基础：Writer + Critic
        if (RESEARCH_KEYWORDS.test(input))
            steps += 1;
        if (VISUAL_KEYWORDS.test(input))
            steps += 1;
        if (PREMIUM_KEYWORDS.test(input))
            steps += 1;
        if (HIGH_COMPLEXITY_KEYWORDS.test(input))
            steps += 1;
        return Math.min(steps, 6); // 上限 6 个 Step
    }
    /** 计算特征提取置信度 */
    calculateConfidence(_input) {
        // 规则引擎的置信度基于命中的关键词数量
        // 简化版：固定高置信度（因为规则都是人工精心设计的）
        return 0.85;
    }
    /** 获取命中的规则 ID 列表（用于调试） */
    getMatchedRuleIds(input) {
        const ids = [];
        if (RESEARCH_KEYWORDS.test(input))
            ids.push("needs-research");
        if (VISUAL_KEYWORDS.test(input))
            ids.push("visual-content");
        if (PREMIUM_KEYWORDS.test(input))
            ids.push("premium-quality");
        if (HIGH_COMPLEXITY_KEYWORDS.test(input))
            ids.push("high-complexity");
        return ids;
    }
}
//# sourceMappingURL=task-analyzer.js.map