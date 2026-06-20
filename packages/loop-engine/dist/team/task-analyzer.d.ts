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
import type { LLMProvider } from "../interrogate/types.js";
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
    /** 计算特征提取置信度
     *
     * 基于命中的关键词覆盖率和输入长度动态计算：
     * - 命中规则越多，置信度越高
     * - 输入过短（<15字）时置信度降低
     * - 返回 0.3 ~ 0.95 的动态值
     */
    private calculateConfidence;
    /** 获取命中的规则 ID 列表（用于调试） */
    private getMatchedRuleIds;
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
    analyzeWithFallback(input: string, llmProvider?: LLMProvider): Promise<TaskFeatures>;
    /**
     * LLM 增强分析 — 调用 LLM 提取规则和难以捕捉的特征
     */
    private llmEnhance;
}
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
export declare function findSimilarCases(cases: CaseRef[], features: TaskFeatures, topK?: number): Array<{
    case: CaseRef;
    similarity: number;
}>;
export {};
//# sourceMappingURL=task-analyzer.d.ts.map