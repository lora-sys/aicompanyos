import type { LLMProvider } from "@aicos/loop-engine/types";
import type { IEvidenceReader } from "./types";
import type { ExtractedPatterns } from "./types";
export interface PatternExtractorConfig {
    /** 最大 LLM 调用次数，超过后使用规则引擎 fallback（默认 3） */
    maxLLMCalls?: number;
    /** 是否强制使用轻量级模式（跳过 LLM 分析，仅使用规则引擎） */
    lightweightMode?: boolean;
}
export declare class PatternExtractor {
    private llmProvider;
    private llmCallCount;
    private readonly maxLLMCalls;
    private lightweightMode;
    constructor(llmProvider: LLMProvider, config?: PatternExtractorConfig);
    /** 设置轻量级模式（跳过 LLM 分析，仅使用规则引擎） */
    setLightweightMode(enabled: boolean): void;
    extractPatterns(evidenceChain: IEvidenceReader): Promise<ExtractedPatterns>;
    private batchAnalyze;
    private ruleBasedExtract;
    private fallbackPreferenceAnalysis;
    private fallbackUXAnalysis;
    private callWithTimeout;
    private extractSuccessPatterns;
    private extractFailurePatterns;
    private fallbackToolAnalysis;
}
//# sourceMappingURL=pattern-extractor.d.ts.map