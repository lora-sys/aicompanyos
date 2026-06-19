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
     *
     * v0.4.0: 增加重试逻辑（最多 2 次）+ 兜底默认计划
     * 解决 LLM 瞬态返回空计划导致整个流程失败的问题。
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
    /**
     * ★ 兜底默认计划生成器
     *
     * 当 LLM 连续多次无法生成有效计划时，使用此方法确保流程不中断。
     * 生成一个标准的 Writer + Critic 两步计划。
     */
    private generateFallbackPlan;
}
//# sourceMappingURL=engine.d.ts.map