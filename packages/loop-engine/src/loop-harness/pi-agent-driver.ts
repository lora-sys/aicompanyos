/**
 * PiAgentInnerLoopDriver — 基于 pi-agent-core 的 Inner Loop 实现
 *
 * 将 PiAgentLoopEngine 适配为 IInnerLoopEngine 接口。
 * 使用 pi-agent-core 的 agentLoop 驱动 Writer→Critic 迭代。
 */

import {
  PiAgentLoopEngine,
  type IPiWriterAgent,
  type IPiCriticAgent,
} from "../pi-agent-adapter.js";
import type { IGeneratorAgent, IEvaluatorAgent, GradingCriteria } from "../loop-module/index.js";
import type { PlanStep } from "../types.js";
import type {
  IInnerLoopEngine,
  InnerLoopConfig,
  InnerLoopResult,
  InnerLoopIteration,
  InnerLoopStopReason,
} from "./inner-loop-types.js";
import type { Model } from "@earendil-works/pi-ai";

export interface PiAgentDriverDeps {
  writerFactory: (ctx: { taskId: string; taskInput: string; tools: import("../tool-registry/registry.js").ToolRegistry; llmProvider: import("../interrogate/types.js").LLMProvider }) => IGeneratorAgent<PlanStep, unknown>;
  criticFactory: (ctx: { taskId: string; taskInput: string; tools: import("../tool-registry/registry.js").ToolRegistry; llmProvider: import("../interrogate/types.js").LLMProvider }) => IEvaluatorAgent;
  toolRegistry: import("../tool-registry/registry.js").ToolRegistry;
  llmProvider: import("../interrogate/types.js").LLMProvider;
  /** pi-ai Model（启用 agentLoop 驱动时需要） */
  model?: Model<any>;
}

export class PiAgentInnerLoopDriver implements IInnerLoopEngine {
  private deps: PiAgentDriverDeps;
  private config: InnerLoopConfig;
  private engine: PiAgentLoopEngine<PlanStep, unknown> | null = null;

  constructor(deps: PiAgentDriverDeps, config: InnerLoopConfig) {
    this.deps = deps;
    this.config = config;
  }

  async run(step: PlanStep, taskInput: string): Promise<InnerLoopResult> {
    const engine = this.getOrCreateEngine(step);
    const piResult = await engine.run(step, taskInput);
    return this.convertResult(piResult);
  }

  setEventForwarder(forwarder: (event: unknown) => void): void {
    if (this.engine) {
      this.engine.onEvent(forwarder as (event: import("@earendil-works/pi-agent-core").AgentEvent) => void);
    }
    // 缓存 forwarder，后续创建 engine 时连接
    this._pendingForwarder = forwarder;
  }

  private _pendingForwarder: ((event: unknown) => void) | null = null;

  private getOrCreateEngine(step: PlanStep): PiAgentLoopEngine<PlanStep, unknown> {
    if (this.engine) return this.engine;

    const ctx = {
      taskId: step.stepId,
      taskInput: step.description,
      tools: this.deps.toolRegistry,
      llmProvider: this.deps.llmProvider,
    };

    const writer = this.deps.writerFactory(ctx);
    const critic = this.deps.criticFactory(ctx);

    // 适配器包装
    const piWriter: IPiWriterAgent<PlanStep, unknown> = {
      generate: (plan, feedback) => writer.generate(plan, feedback),
    };
    const piCritic: IPiCriticAgent<unknown> = {
      evaluate: (output, criteria, originalTask) => critic.evaluate(output as any, criteria, originalTask),
    };

    this.engine = new PiAgentLoopEngine<PlanStep, unknown>({
      writer: piWriter,
      critic: piCritic,
      criteria: this.config.criteria,
      config: {
        maxIterations: this.config.maxIterations,
        enableDegradationGuard: this.config.enableDegradationGuard,
        stagnationThreshold: this.config.stagnationThreshold,
        departmentConfig: this.config.departmentConfig,
        enableCompletionGuard: this.config.enableCompletionGuard,
        acceptanceCriteria: this.config.acceptanceCriteria,
        completionGuardConfig: this.config.completionGuardConfig,
        minQualityScore: this.config.minQualityScore,
        llmProviderFn: this.config.llmProviderFn,
        model: this.deps.model,
        onIterationStart: (iter) => this.config.onIterationStart?.(iter, step.stepId),
        onWriterOutput: (content, iter) => this.config.onWriterOutput?.(content, iter),
        onCriticResult: (score, passed, suggestions, iter) => this.config.onCriticResult?.(score, passed, suggestions, iter),
        onGoalProgress: (verified, total, reason) => this.config.onGoalProgress?.(verified, total, reason),
      },
    });

    // 连接事件转发器
    if (this._pendingForwarder) {
      this.engine.onEvent(this._pendingForwarder as (event: import("@earendil-works/pi-agent-core").AgentEvent) => void);
    }

    return this.engine;
  }

  private convertResult(piResult: import("../pi-agent-adapter.js").PiAgentLoopResult<unknown>): InnerLoopResult {
    const iterations: InnerLoopIteration[] = piResult.iterations.map((iter) => ({
      round: iter.iteration,
      output: iter.output,
      evaluation: iter.evaluation,
      stopReason: iter.stopReason as InnerLoopStopReason,
      durationMs: iter.durationMs,
    }));

    return {
      iterations,
      bestOutput: piResult.bestOutput,
      finalScore: piResult.finalScore,
      passed: piResult.passed,
      excellent: piResult.excellent,
      totalIterations: piResult.totalIterations,
      totalDurationMs: piResult.totalDurationMs,
      goalSnapshot: piResult.goalSnapshot as InnerLoopResult["goalSnapshot"],
      stopCondition: piResult.stopCondition,
      completionProgress: piResult.completionProgress,
    };
  }
}
