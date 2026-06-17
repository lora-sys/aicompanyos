// 异常检测器 - 检测是否需要触发深度进化
import type { TaskMetrics, EvolutionSignal, AnomalyDetectorConfig } from "./types";

// 默认配置
const DEFAULT_CONFIG: AnomalyDetectorConfig = {
  consensusFailureThreshold: 0.6, // 共识失败率阈值（60%）
  replanFrequencyThreshold: 2, // Replan 频率阈值
  maxRounds: 10, // 最大轮次上限
};

// 历史记录条目
interface HistoryEntry {
  taskId: string;
  metrics: TaskMetrics;
}

export class AnomalyDetector {
  private config: AnomalyDetectorConfig;
  private history: HistoryEntry[] = [];

  constructor(config?: Partial<AnomalyDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // 记录一次任务的指标
  recordMetrics(taskId: string, metrics: TaskMetrics): void {
    // 更新已有任务或新增
    const existingIndex = this.history.findIndex((h) => h.taskId === taskId);
    if (existingIndex >= 0) {
      this.history[existingIndex] = { taskId, metrics };
    } else {
      this.history.push({ taskId, metrics });
    }
  }

  // 检测是否需要深度进化，返回触发的信号列表
  detect(taskId: string): EvolutionSignal[] {
    const signals: EvolutionSignal[] = [];
    const recentTasks = this.getRecentTasks(10); // 最近 10 个任务

    if (recentTasks.length < 1) return signals;

    // 1. 共识失败率检测
    const consensusSignal = this.detectConsensusFailure(recentTasks);
    if (consensusSignal.triggered) signals.push(consensusSignal);

    // 2. Replan 频率检测
    const replanSignal = this.detectReplanFrequency(recentTasks);
    if (replanSignal.triggered) signals.push(replanSignal);

    // 3. 用户手动修改检测
    const userModSignal = this.detectUserModification(recentTasks);
    if (userModSignal.triggered) signals.push(userModSignal);

    return signals;
  }

  // 获取历史统计
  getStats(): { totalTasks: number; avgConsensusRate: number; avgReplanCount: number } {
    const total = this.history.length;
    if (total === 0) {
      return { totalTasks: 0, avgConsensusRate: 0, avgReplanCount: 0 };
    }

    const totalRounds = this.history.reduce((sum, h) => sum + h.metrics.consensusRounds, 0);
    const totalReplans = this.history.reduce((sum, h) => sum + h.metrics.replanCount, 0);

    // 共识通过率：consensusPassed 为 true 的比例
    const passedCount = this.history.filter((h) => h.metrics.consensusPassed).length;

    return {
      totalTasks: total,
      avgConsensusRate: total > 0 ? passedCount / total : 0,
      avgReplanCount: total > 0 ? totalReplans / total : 0,
    };
  }

  // === 私有方法 ===

  // 获取最近的 N 个任务
  private getRecentTasks(count: number): HistoryEntry[] {
    return this.history.slice(-count);
  }

  // 检测共识失败率
  private detectConsensusFailure(recentTasks: HistoryEntry[]): EvolutionSignal {
    // 计算需要多轮共识的任务比例（consensusRounds > 1 表示有争议）
    const contestedTasks = recentTasks.filter((t) => t.metrics.consensusRounds > 1).length;
    const failureRate = contestedTasks / recentTasks.length;

    return {
      type: "consensus_failure_rate",
      value: Math.round(failureRate * 100) / 100,
      threshold: this.config.consensusFailureThreshold,
      triggered: failureRate >= this.config.consensusFailureThreshold,
    };
  }

  // 检测 Replan 频率
  private detectReplanFrequency(recentTasks: HistoryEntry[]): EvolutionSignal {
    // 检查是否有任务的 replanCount 超过阈值
    const maxReplan = Math.max(...recentTasks.map((t) => t.metrics.replanCount), 0);
    const avgReplan =
      recentTasks.reduce((sum, t) => sum + t.metrics.replanCount, 0) / recentTasks.length;

    // 使用最大值和平均值的综合判断
    const triggered = maxReplan >= this.config.replanFrequencyThreshold || avgReplan >= 1.5;

    return {
      type: "replan_frequency",
      value: Math.round(avgReplan * 100) / 100,
      threshold: this.config.replanFrequencyThreshold,
      triggered,
    };
  }

  // 检测用户手动修改
  private detectUserModification(recentTasks: HistoryEntry[]): EvolutionSignal {
    // 统计用户修改次数
    const tasksWithMods = recentTasks.filter(
      (t) => t.metrics.userModifications != null && t.metrics.userModifications! > 0,
    );
    const totalMods = tasksWithMods.reduce(
      (sum, t) => sum + (t.metrics.userModifications ?? 0),
      0,
    );
    const avgMods = recentTasks.length > 0 ? totalMods / recentTasks.length : 0;

    // 如果平均每任务修改超过 1 次，则触发
    return {
      type: "user_modification",
      value: Math.round(avgMods * 100) / 100,
      threshold: 1.0,
      triggered: avgMods >= 1.0,
    };
  }
}
