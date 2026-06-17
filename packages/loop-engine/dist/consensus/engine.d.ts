import type { LLMProvider } from "../interrogate/types.js";
import type { LoopContext, ExecutionPlan } from "../types.js";
import { type ConsensusResult, type ConsensusConfig } from "./types.js";
import type { IEvaluatorAgent, GradingCriteria } from "../loop-module/index.js";
import type { AgentExecutor } from "../orchestrator/types.js";
/**
 * 共识锁 - 多 Agent 投票审核机制
 */
export declare class ConsensusLock {
    private config;
    private writerReviewer?;
    private uiuxReviewer?;
    private llmProvider?;
    private criteria;
    constructor(config?: Partial<ConsensusConfig>);
    /**
     * 设置 Critic 审核 Agent (IEvaluatorAgent 接口)
     */
    setWriterReviewer(reviewer: IEvaluatorAgent): void;
    /**
     * 设置 GradingCriteria（IEvaluatorAgent.evaluate() 需要）
     */
    setCriteria(criteria: GradingCriteria): void;
    /**
     * 设置 UI-UX 审核 Agent
     */
    setUIUXReviewer(reviewer: AgentExecutor): void;
    /**
     * 设置 LLM Provider（用于无 Agent 时的降级审核）
     */
    setLLMProvider(provider: LLMProvider): void;
    /**
     * 执行共识流程
     */
    reachConsensus(params: {
        writerOutput: unknown;
        originalTask: string;
        plan: ExecutionPlan;
        context: LoopContext;
    }): Promise<ConsensusResult>;
    /**
     * 执行一轮投票
     */
    private conductRound;
    /**
     * 使用 LLM 进行投票（降级方案）
     */
    private llmVote;
    /**
     * 解析投票结果
     * 使用 LLMStructuredOutput 统一提取+验证
     */
    private parseVote;
    /**
     * 将 IEvaluatorAgent 的 GradingResult 转换为共识投票格式
     */
    private parseGradingVote;
    /**
     * 兜底解析：当 Zod schema 验证失败时，用正则从原始文本中提取 vote/score
     * 处理 LLM 返回非标准格式（如嵌套数组、markdown 混合等）
     */
    private fallbackParseVote;
    /**
     * 综合评估投票结果
     */
    private evaluateVotes;
}
//# sourceMappingURL=engine.d.ts.map