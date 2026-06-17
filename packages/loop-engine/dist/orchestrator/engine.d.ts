import type { LoopContext, ExecutionPlan, PlanStep } from "../types.js";
import { ToolRegistry } from "../tool-registry/registry.js";
import type { StepExecutionResult, OrchestratorConfig, AgentExecutor } from "./types.js";
/**
 * 执行编排器 - 按 Plan 步骤顺序驱动 Agent 执行
 *
 * @deprecated ExecutionOrchestrator 已被 LoopModule 替代。
 * 新代码应使用 LoopModule（基于 IPlannerAgent/IGeneratorAgent/IEvaluatorAgent 接口）。
 * 此类保留仅用于向后兼容，将在后续版本移除。
 */
export declare class ExecutionOrchestrator {
    private toolRegistry;
    private config;
    private agentFactories;
    constructor(toolRegistry: ToolRegistry, config?: Partial<OrchestratorConfig>);
    /**
     * 注册一个 Agent 工厂函数
     */
    registerAgent(agentType: string, factory: (ctx: import("./types.js").OrchestratorAgentContext) => AgentExecutor): void;
    /**
     * 执行完整计划
     */
    executePlan(plan: ExecutionPlan, context: LoopContext, agentContext?: import("./types.js").OrchestratorAgentContext): Promise<{
        results: StepExecutionResult[];
        finalOutputs: Record<string, unknown>;
    }>;
    /**
     * 执行单个步骤
     */
    executeStep(step: PlanStep, context: LoopContext, previousOutputs: Record<string, unknown>, agentContext?: import("./types.js").OrchestratorAgentContext): Promise<StepExecutionResult>;
}
export type { AgentExecutor, OrchestratorAgentContext, EvidenceChainRef, MemoryManagerRef } from "./types.js";
//# sourceMappingURL=engine.d.ts.map