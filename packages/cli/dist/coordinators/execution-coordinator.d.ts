import type { ArtifactManager, HarnessExecutionResult, LoopContext, LoopHarness } from "@aicos/loop-engine";
import type { MemoryManager } from "@aicos/memory";
export interface ExecutionCoordinatorDeps {
    artifactManager: ArtifactManager;
    memoryManager: MemoryManager;
    loopHarness: LoopHarness;
    onLog: (level: "info" | "warn" | "error", source: string, message: string) => void;
    onStream: (content: string) => void;
    getTaskId: () => string;
    getTaskInput: () => string;
    getLoopContext: () => LoopContext | null;
    injectMemoryExamples: (plan: import("@aicos/loop-engine").ExecutionPlan) => Promise<void>;
    getCollectedVerifications: () => Array<{
        goalId: string;
        verified: boolean;
        evidence?: string;
    }>;
}
export interface CriticSummary {
    totalScore: number;
    passed: boolean;
    excellent: boolean;
    dimensionScores: Array<{
        dimensionId: string;
        dimensionName: string;
        rawScore: number;
        maxScore: number;
        comment?: string;
    }>;
    reasoning?: string;
}
export interface ExecutionCoordinatorResult {
    harnessResult: HarnessExecutionResult;
    criticSummary?: CriticSummary;
    guardSummary?: {
        totalGoals: number;
        verifiedGoals: number;
    };
}
/**
 * 执行阶段协调器
 *
 * 封装 LoopHarness 调用、产物持久化、后处理管线，
 * 并生成供进化阶段使用的 Critic/Guard 摘要。
 */
export declare class ExecutionCoordinator {
    private deps;
    constructor(deps: ExecutionCoordinatorDeps);
    run(plan: import("@aicos/loop-engine").ExecutionPlan): Promise<ExecutionCoordinatorResult>;
    private extractSummaries;
    private persistOutputsToDisk;
    private extractContentFromOutput;
    private runArtifactPipeline;
}
//# sourceMappingURL=execution-coordinator.d.ts.map