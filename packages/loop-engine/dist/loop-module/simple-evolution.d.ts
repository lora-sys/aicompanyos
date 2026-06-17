/**
 * SimpleEvolutionAgent — 轻量级自进化分析器
 *
 * 分析迭代历史中的评分趋势，给出战略建议：
 * - refine: 分数在上升，继续当前方向
 * - pivot: 分数停滞或下降，建议换方向
 * - accept: 已达优秀线
 *
 * 这是 IEvolutionAgent 的一个简单实现，
 * 更复杂的版本可以使用 LLM 分析或模式识别。
 */
import type { IEvolutionAgent, GradingResult, StrategicDecision } from "../loop-module/index.js";
export declare class SimpleEvolutionAgent implements IEvolutionAgent {
    analyze(history: GradingResult[]): Promise<{
        decision: StrategicDecision;
        reason: string;
        patternInsights?: string[];
    }>;
    /** 分析各维度趋势 */
    private analyzeDimensionTrends;
}
//# sourceMappingURL=simple-evolution.d.ts.map