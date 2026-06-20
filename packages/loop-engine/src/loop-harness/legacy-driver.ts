/**
 * LegacyInnerLoopDriver — 基于 LoopModule 的 Inner Loop 实现
 *
 * 将现有 LoopModule 适配为 IInnerLoopEngine 接口。
 * 这是向后兼容的 driver，使用手搓 Writer→Critic 循环。
 */

import { LoopModule, type LoopModuleResult, type LoopIteration } from "../loop-module/index.js";
import type { IGeneratorAgent, IEvaluatorAgent, GradingCriteria } from "../loop-module/index.js";
import type { PlanStep } from "../types.js";
import type {
  IInnerLoopEngine,
  InnerLoopConfig,
  InnerLoopResult,
  InnerLoopIteration,
  InnerLoopStopReason,
} from "./inner-loop-types.js";

export interface LegacyDriverDeps {
  writerFactory: (ctx: { taskId: string; taskInput: string; tools: import("../tool-registry/registry.js").ToolRegistry; llmProvider: import("../interrogate/types.js").LLMProvider }) => IGeneratorAgent<PlanStep, unknown>;
  criticFactory: (ctx: { taskId: string; taskInput: string; tools: import("../tool-registry/registry.js").ToolRegistry; llmProvider: import("../interrogate/types.js").LLMProvider }) => IEvaluatorAgent;
  toolRegistry: import("../tool-registry/registry.js").ToolRegistry;
  llmProvider: import("../interrogate/types.js").LLMProvider;
}

export class LegacyInnerLoopDriver implements IInnerLoopEngine {
  private deps: LegacyDriverDeps;
  private config: InnerLoopConfig;
  private loopModule: LoopModule<PlanStep, PlanStep, unknown> | null = null;

  constructor(deps: LegacyDriverDeps, config: InnerLoopConfig) {
    this.deps = deps;
    this.config = config;
  }

  async run(step: PlanStep, taskInput: string): Promise<InnerLoopResult> {
    // ★ P0 防漂移：用增强后的 taskInput 覆盖 step.description
    // taskInput 包含 [ORIGINAL_USER_TASK] 标记，确保 Writer 能看到用户原始意图
    const enhancedStep: PlanStep = {
      ...step,
      description: taskInput || step.description,
    };
    const module = this.getOrCreateLoopModule(enhancedStep);
    const moduleResult = await module.run(enhancedStep);
    return this.convertResult(moduleResult);
  }

  setEventForwarder(): void {
    // Legacy driver 不支持事件转发，空实现
  }

  private getOrCreateLoopModule(step: PlanStep): LoopModule<PlanStep, PlanStep, unknown> {
    if (this.loopModule) return this.loopModule;

    const ctx = {
      taskId: step.stepId,
      taskInput: step.description,
      tools: this.deps.toolRegistry,
      llmProvider: this.deps.llmProvider,
    };

    const generator = this.deps.writerFactory(ctx);
    const evaluator = this.deps.criticFactory(ctx);

    this.loopModule = new LoopModule<PlanStep, PlanStep, unknown>({
      planner: { plan: async (input: PlanStep) => input },
      generator,
      evaluator,
      criteria: this.config.criteria,
      config: {
        maxIterations: this.config.maxIterations,
        enableDegradationGuard: this.config.enableDegradationGuard,
        enableEvolution: true,
        stagnationThreshold: this.config.stagnationThreshold,
        useContextReset: true,
        enableCompletionGuard: this.config.enableCompletionGuard,
        acceptanceCriteria: this.config.acceptanceCriteria,
        completionGuardConfig: this.config.completionGuardConfig,
        llmProviderFn: this.config.llmProviderFn,
      },
    });

    return this.loopModule;
  }

  private convertResult(moduleResult: LoopModuleResult<unknown>): InnerLoopResult {
    const iterations: InnerLoopIteration[] = moduleResult.iterations.map((iter) => ({
      round: iter.round,
      output: iter.output,
      evaluation: iter.evaluation,
      stopReason: iter.stopReason as InnerLoopStopReason,
      durationMs: iter.durationMs,
    }));

    return {
      iterations,
      bestOutput: moduleResult.bestOutput,
      finalScore: moduleResult.finalScore,
      passed: moduleResult.passed,
      excellent: moduleResult.excellent,
      totalIterations: moduleResult.totalIterations,
      totalDurationMs: moduleResult.totalDurationMs,
      goalSnapshot: moduleResult.goalSnapshot,
      stopCondition: moduleResult.stopCondition,
      completionProgress: moduleResult.completionProgress,
    };
  }
}
