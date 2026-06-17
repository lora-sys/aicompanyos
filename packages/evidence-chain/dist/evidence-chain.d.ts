import type { TraceEntry, EvidenceChainMeta } from "./types.js";
import { StepTraceRecorder, DecisionTraceRecorder, ToolCallTraceRecorder, SnapshotRecorder, ReasoningTraceRecorder } from "./trace-recorders.js";
export declare class EvidenceChain {
    private entries;
    private meta;
    readonly steps: StepTraceRecorder;
    readonly decisions: DecisionTraceRecorder;
    readonly toolCalls: ToolCallTraceRecorder;
    readonly snapshots: SnapshotRecorder;
    readonly reasoning: ReasoningTraceRecorder;
    constructor(chainId: string, taskId: string, taskInput: string);
    append(entry: TraceEntry): void;
    getMeta(): EvidenceChainMeta;
    getEntries(): TraceEntry[];
    getEntriesByType<T extends TraceEntry["type"]>(type: T): Extract<TraceEntry, {
        type: T;
    }>[];
    getEntriesInRange(start: Date, end: Date): TraceEntry[];
    exportToJSONL(): string;
    static importFromJSONL(jsonl: string): EvidenceChain;
    saveToFile(filePath: string): Promise<void>;
    static loadFromFile(filePath: string): Promise<EvidenceChain>;
    end(): void;
    replay(callback: (entry: TraceEntry) => void): void;
}
//# sourceMappingURL=evidence-chain.d.ts.map