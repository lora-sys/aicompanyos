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

export class SimpleEvolutionAgent implements IEvolutionAgent {
  async analyze(history: GradingResult[]): Promise<{
    decision: StrategicDecision;
    reason: string;
    patternInsights?: string[];
  }> {
    if (history.length < 2) {
      return { decision: "refine", reason: "数据不足，默认继续精炼" };
    }

    const scores = history.map((h) => h.totalScore);
    const last = scores[scores.length - 1];
    const prev = scores[scores.length - 2];
    const first = scores[0];
    const delta = last - prev;
    const totalImprovement = last - first;

    // 检测模式
    const insights: string[] = [];

    // 模式1: 持续上升
    if (scores.every((s, i) => i === 0 || s >= scores[i - 1])) {
      insights.push("分数持续上升趋势");
    }

    // 模式2: 震荡
    const oscillations = scores.filter((s, i) => i > 0 && ((s > prev && scores[i - 2] < s) || (s < prev && scores[i - 2] > s))).length;
    if (oscillations >= Math.min(2, scores.length / 2)) {
      insights.push("分数震荡模式 — Generator 在不同方向间摇摆");
    }

    // 模式3: 平台期
    const plateauCount = scores.filter((s, i) => i > 0 && Math.abs(s - scores[i - 1]) <= 3).length;
    if (plateauCount >= 2) {
      insights.push(`进入平台期 — 最近 ${plateauCount} 轮分数变化 < 3`);
    }

    // 模式4: 维度分析
    if (history.length >= 3) {
      const dimTrends = this.analyzeDimensionTrends(history);
      for (const [dim, trend] of Object.entries(dimTrends)) {
        if (trend === "declining") {
          insights.push(`维度 "${dim}" 持续下降，需要重点关注`);
        }
      }
    }

    // 决策逻辑
    let decision: StrategicDecision;
    let reason: string;

    if (last >= 90) {
      decision = "accept";
      reason = `已达到优秀水平 (${last}/100)，无需继续迭代`;
    } else if (delta >= 5) {
      decision = "refine";
      reason = `本轮提升明显 (+${delta}分)，建议继续沿当前方向精炼`;
    } else if (delta <= -5) {
      decision = "pivot";
      reason = `本轮分数下降 (${delta}分)，建议转向新方向`;
    } else if (totalImprovement <= 0 && history.length >= 3) {
      decision = "pivot";
      reason = `${history.length} 轮迭代后总改善仅 ${totalImprovement}分，当前策略可能无效`;
    } else {
      decision = "refine";
      reason = `小幅波动 (${delta >= 0 ? "+" : ""}${delta}分)，建议继续微调`;
    }

    return { decision, reason, patternInsights: insights };
  }

  /** 分析各维度趋势 */
  private analyzeDimensionTrends(
    history: GradingResult[]
  ): Record<string, "improving" | "declining" | "stable"> {
    const trends: Record<string, "improving" | "declining" | "stable"> = {};
    const recent = history.slice(-3);

    for (const dim of recent[0]?.dimensionScores ?? []) {
      const scores = recent.map((h) =>
        h.dimensionScores.find((d) => d.dimensionId === dim.dimensionId)?.rawScore ?? 0
      );
      if (scores.every((s, i) => i === 0 || s >= scores[i - 1] + 1)) {
        trends[dim.dimensionId] = "improving";
      } else if (scores.every((s, i) => i === 0 || s <= scores[i - 1] - 1)) {
        trends[dim.dimensionId] = "declining";
      } else {
        trends[dim.dimensionId] = "stable";
      }
    }

    return trends;
  }
}
