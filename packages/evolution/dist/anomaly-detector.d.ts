import type { TaskMetrics, EvolutionSignal, AnomalyDetectorConfig } from "./types.js";
export declare class AnomalyDetector {
    private config;
    private history;
    constructor(config?: Partial<AnomalyDetectorConfig>);
    recordMetrics(taskId: string, metrics: TaskMetrics): void;
    detect(taskId: string): EvolutionSignal[];
    getStats(): {
        totalTasks: number;
        avgConsensusRate: number;
        avgReplanCount: number;
    };
    private getRecentTasks;
    private detectConsensusFailure;
    private detectReplanFrequency;
    private detectUserModification;
    private loadHistory;
    private persistHistory;
}
//# sourceMappingURL=anomaly-detector.d.ts.map