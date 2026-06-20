import type { ArtifactManager, WorkerRole } from "@aicos/loop-engine";
import type { MemoryManager } from "@aicos/memory";
import type { EvolutionAgent, CriticSummary } from "@aicos/evolution";
export interface EvolutionCoordinatorDeps {
    artifactManager: ArtifactManager;
    memoryManager: MemoryManager;
    evolutionAgent: EvolutionAgent | null;
    onStream: (content: string) => void;
    getTaskId: () => string;
    getTaskInput: () => string;
    getLoopContext: () => {
        consensusRound?: number;
        retryCount?: number;
    } | null;
    getLoopStartTime: () => number;
    getUserModificationCount: () => number;
    getCollectedDecisions: () => Array<{
        agentType: WorkerRole | string;
        decisionPoint: string;
        finalChoice: string;
        confidence: number;
        outputReasoning?: string;
    }>;
    getCollectedToolCalls: () => Array<{
        toolName: string;
        success: boolean;
        duration?: number;
    }>;
    getCollectedVerifications: () => Array<{
        goalId: string;
        verified: boolean;
        evidence?: string;
    }>;
    persistUserPreferences: () => Promise<void>;
}
/**
 * 进化阶段协调器
 *
 * 封装 EvolutionAgent 调用、证据链构造、结果渲染，
 * 将进化分析从 AICOSApp 中剥离。
 */
export declare class EvolutionCoordinator {
    private deps;
    constructor(deps: EvolutionCoordinatorDeps);
    run(params: {
        lastCriticSummary?: CriticSummary;
        lastGuardSummary?: {
            totalGoals: number;
            verifiedGoals: number;
        };
    }): Promise<void>;
    private buildEvidenceReader;
    private buildTaskMetrics;
}
//# sourceMappingURL=evolution-coordinator.d.ts.map