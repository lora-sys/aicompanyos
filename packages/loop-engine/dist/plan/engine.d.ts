import type { LLMProvider } from "../interrogate/types.js";
import type { PlanGenerationInput, PlanGenerationResult } from "./types.js";
/**
 * 规划引擎 - 根据拷问结果生成执行计划
 */
export declare class PlanEngine {
    private llmProvider;
    constructor(llmProvider: LLMProvider);
    /**
     * 根据拷问结果生成执行计划
     */
    generatePlan(input: PlanGenerationInput): Promise<PlanGenerationResult>;
    /**
     * 调用 LLM 生成 JSON 格式计划
     * 使用 LLMStructuredOutput 统一提取+验证
     */
    private callLLMForPlan;
    /**
     * 后处理：去重合并连续相同 agentType 的步骤
     * 将连续的、agentType 相同的步骤合并为单个步骤，合并 description 和 toolsNeeded
     */
    private deduplicateConsecutiveSteps;
}
//# sourceMappingURL=engine.d.ts.map