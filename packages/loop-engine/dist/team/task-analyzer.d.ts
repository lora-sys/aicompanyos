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
import type { TaskFeatures } from "./types.js";
interface FeatureRule<T = unknown> {
    key: string;
    pattern: RegExp;
    extractor: (match: RegExpMatchArray, input: string) => T;
    description: string;
}
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
export declare class TaskAnalyzer {
    private customRules;
    /**
     * 添加自定义特征规则
     */
    addCustomRule(rule: FeatureRule): void;
    /**
     * 从 taskInput 中提取任务特征
     *
     * @param input 用户的原始任务输入
     * @returns 结构化的任务特征
     */
    analyze(input: string): TaskFeatures;
    /** 检测内容领域 */
    private detectDomain;
    /** 估计内容长度 */
    private estimateLength;
    /** 检测质量档次 */
    private detectQualityTier;
    /** 评估复杂度 */
    private assessComplexity;
    /** 估算需要的 Step 数 */
    private estimateSteps;
    /** 计算特征提取置信度 */
    private calculateConfidence;
    /** 获取命中的规则 ID 列表（用于调试） */
    private getMatchedRuleIds;
}
export {};
//# sourceMappingURL=task-analyzer.d.ts.map