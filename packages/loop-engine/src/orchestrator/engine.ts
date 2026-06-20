import type { LoopContext, ExecutionPlan, PlanStep, WorkerRole } from "../types.js";
import { ToolRegistry } from "../tool-registry/registry.js";
import type {
  StepExecutionResult,
  OrchestratorConfig,
  AgentExecutor,
} from "./types.js";

// 默认配置
const DEFAULT_CONFIG: OrchestratorConfig = {
  maxConcurrentSteps: 1, // MVP 串行模式
  timeoutPerStep: 5 * 60 * 1000, // 每步默认 5 分钟超时
};

/**
 * 执行编排器 - 按 Plan 步骤顺序驱动 Agent 执行
 *
 * @deprecated ExecutionOrchestrator 已被 LoopModule 替代。
 * 新代码应使用 LoopModule（基于 IPlannerAgent/IGeneratorAgent/IEvaluatorAgent 接口）。
 * 此类保留仅用于向后兼容，将在后续版本移除。
 */
export class ExecutionOrchestrator {
  private toolRegistry: ToolRegistry;
  private config: OrchestratorConfig;
  private agentFactories: Map<
    string,
    (context: import("./types.js").OrchestratorAgentContext) => AgentExecutor
  > = new Map();

  constructor(toolRegistry: ToolRegistry, config?: Partial<OrchestratorConfig>) {
    this.toolRegistry = toolRegistry;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 注册一个 Agent 工厂函数
   */
  registerAgent(
    agentType: WorkerRole | string,
    factory: (ctx: import("./types.js").OrchestratorAgentContext) => AgentExecutor
  ): void {
    this.agentFactories.set(agentType, factory);
  }

  /**
   * 执行完整计划
   */
  async executePlan(
    plan: ExecutionPlan,
    context: LoopContext,
    agentContext?: import("./types.js").OrchestratorAgentContext
  ): Promise<{
    results: StepExecutionResult[];
    finalOutputs: Record<string, unknown>;
  }> {
    const results: StepExecutionResult[] = [];
    const finalOutputs: Record<string, unknown> = {};

    for (const step of plan.steps) {
      const result = await this.executeStep(step, context, finalOutputs, agentContext);
      results.push(result);

      if (!result.success) {
        // 当前步骤失败，终止后续步骤
        break;
      }

      // 收集成功输出
      finalOutputs[result.stepId] = result.output;
    }

    return { results, finalOutputs };
  }

  /**
   * 执行单个步骤
   */
  async executeStep(
    step: PlanStep,
    context: LoopContext,
    previousOutputs: Record<string, unknown>,
    agentContext?: import("./types.js").OrchestratorAgentContext
  ): Promise<StepExecutionResult> {
    const startTime = Date.now();

    // 获取对应 Agent 的执行器
    const factory = this.agentFactories.get(step.agentType);
    if (!factory) {
      return {
        stepId: step.stepId,
        agentType: step.agentType,
        success: false,
        output: null,
        error: `未注册 Agent 类型: ${step.agentType}`,
        durationMs: Date.now() - startTime,
      };
    }

    // 构建执行器实例
    const executor = agentContext ? factory(agentContext) : factory({
      taskId: context.taskId,
      evidenceChain: {} as import("./types.js").EvidenceChainRef,
      memoryManager: {} as import("./types.js").MemoryManagerRef,
    });

    try {
      // 带超时控制的执行
      const output = await Promise.race([
        executor.execute({
          step,
          tools: this.toolRegistry,
          context,
          previousOutputs: previousOutputs as Record<string, { content: string }>,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`步骤 "${step.stepId}" 执行超时`)), this.config.timeoutPerStep)
        ),
      ]);

      return {
        stepId: step.stepId,
        agentType: step.agentType,
        success: true,
        output,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        stepId: step.stepId,
        agentType: step.agentType,
        success: false,
        output: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }
}

// 重新导出关键类型
export type { AgentExecutor, OrchestratorAgentContext, EvidenceChainRef, MemoryManagerRef } from "./types.js";
