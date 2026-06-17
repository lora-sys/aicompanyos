/**
 * Loop Engineering Harness — 双层嵌套循环执行引擎
 *
 * 核心设计：
 * - LoopHarness 是 LoopModule 的 thin wrapper
 * - Inner Loop（Step 级）: 委托给 LoopModule.run() 执行 Writer → Critic 循环
 * - Outer Loop（Plan 级）: 全部 steps 完成 → Verify → 不达标 → Replan → 重新执行
 *
 * 关键原则：
 * - "物理层焊死"：Critic 的完整输出直接注入 Writer 的下一次输入
 * - 退化保护：重写后 score 反而下降则终止，保留最佳版本
 * - Evidence Chain：每轮迭代都记录到证据链
 *
 * v0.2.0 变更：移除 @deprecated 的 ExecutionOrchestrator fallback 路径。
 * Writer-Critic 反馈环统一走 LoopModule 主路径。
 * ExecutionOrchestrator 仅保留用于非 Writer step（如 ui-ux）的顺序执行。
 */
import type {
  LoopContext,
  ExecutionPlan,
  PlanStep,
} from "../types.js";
import type { LLMProvider } from "../interrogate/types.js";
import { ExecutionOrchestrator } from "../orchestrator/engine.js";
import type {
  StepExecutionResult,
  AgentExecutor,
  OrchestratorAgentContext,
} from "../orchestrator/types.js";
import type { ToolRegistry } from "../tool-registry/registry.js";
import {
  LoopModule,
  type LoopModuleResult,
  type LoopIteration,
  DEFAULT_WRITING_CRITERIA,
} from "../loop-module/index.js";
import type {
  IGeneratorAgent,
  IEvaluatorAgent,
  GradingCriteria,
} from "../loop-module/index.js";
import { getThresholdsForProfile, type ThresholdProfile } from "../config/thresholds.js";

// Critic 输出结构（用于 StepLoopIteration 和结果格式化）
interface CriticOutputData {
  overallScore: number;
  dimensions: Record<string, { score: number; comment: string }>;
  passed: boolean;
  suggestions: Array<{
    type: string;
    severity: string;
    location?: string;
    description: string;
    suggestion: string;
  }>;
  reasoning: string;
}

/** Writer 输出类型（兼容 LoopModule 的泛型输出） */
interface WriterOutput {
  content?: string;
  [key: string]: unknown;
}

// ============================================================
// 类型定义
// ============================================================

/** Inner Loop 配置 */
export interface LoopHarnessConfig {
  /** Inner Loop: 单步最大重写次数 */
  maxRewrites: number;
  /** Inner Loop: 质量阈值（Critic score >= 此值才通过） */
  qualityThreshold: number;
  /** Outer Loop: 全局最大 replan 次数 */
  maxReplans: number;
  /** 是否启用退化保护（score 下降则停止重写） */
  enableDegradationGuard: boolean;
}

/**
 * 动态 Few-shot 样例
 *
 * 从 Memory 历史数据提取的真实评估记录，
 * 用于补充 GradingCriteria 中的静态 examples。
 * 由 CLI 层通过 setDynamicExamples() 注入。
 */
export interface DynamicExample {
  /** 样例描述（如"任务要求写 Rust 异步编程，文章深入分析了 Pin vs async fn 的性能差异"） */
  description: string;
  /** 该产出获得的评分 */
  score: number;
  /** 评分理由（如"有深入的 trade-off 分析和生产级代码示例"） */
  reason: string;
}

/** Inner Loop 单步迭代结果 */
export interface StepLoopIteration {
  /** 迭代轮次 (1 = 首次执行, 2+ = 重写) */
  round: number;
  /** Writer 输出 */
  writerOutput: StepExecutionResult;
  /** Critic 审核结果 (可能为空，如果 Critic 执行失败) */
  criticOutput?: CriticOutputData;
  /** 是否通过质量门 */
  passed: "quality_met" | "max_rewrites" | "degradation" | "error" | "continue" | "stable_plateau";
  /** 终止原因 */
  reason: "quality_met" | "max_rewrites" | "degradation" | "error" | "continue" | "stable_plateau";
  /** 本轮耗时 ms */
  durationMs: number;
}

/** Inner Loop 完整结果（单个 Step 的所有迭代） */
export interface StepLoopResult {
  /** Step ID */
  stepId: string;
  /** 所有迭代记录 */
  iterations: StepLoopIteration[];
  /** 最终使用的输出（最佳版本） */
  finalOutput: StepExecutionResult;
  /** 最终 Critic 评分 */
  finalScore: number;
  /** 是否最终通过 */
  passed: boolean;
  /** 总耗时 ms */
  totalDurationMs: number;
}

/** Harness 完整执行结果 */
export interface HarnessExecutionResult {
  /** 所有 Step 的执行结果 */
  stepResults: StepLoopResult[];
  /** 所有步骤的最终输出 */
  finalOutputs: Record<string, unknown>;
  /** 是否全部通过 */
  allPassed: boolean;
  /** 总迭代次数（含重写） */
  totalIterations: number;
  /** 总耗时 ms */
  totalDurationMs: number;
}

const DEFAULT_CONFIG: LoopHarnessConfig = {
  maxRewrites: 3,
  qualityThreshold: 85,
  maxReplans: 2,
  enableDegradationGuard: true,
};

// ============================================================
// LoopHarness 核心
// ============================================================

/**
 * Loop Engineering Harness
 *
 * 包装 LoopModule，在 Step 级别实现 Writer-Critic 反馈环。
 * 每个 Writer step 执行后自动触发 Critic 审核，
 * 如果评分不达标则用 Critic 的完整反馈注入 Writer 重写。
 *
 * 所有 Writer-Critic 配对 step 均通过 LoopModule.run() 执行，
 * 非 Writer step（如 ui-ux）仍通过 ExecutionOrchestrator 顺序执行。
 */
export class LoopHarness {
  private loopModule: LoopModule<PlanStep, PlanStep, WriterOutput> | null = null;
  private orchestrator: ExecutionOrchestrator; // 用于非 Writer step 的顺序执行
  private config: LoopHarnessConfig;
  private llmProvider: LLMProvider;
  private toolRegistry: ToolRegistry;

  // 存储注册的 Agent 工厂（延迟创建 LoopModule）
  private writerFactory?: (ctx: any) => IGeneratorAgent<PlanStep, WriterOutput>;
  private criticFactory?: (ctx: any) => IEvaluatorAgent;
  private criteria: GradingCriteria | undefined;
  // 当前任务的阈值档位（从 ExecutionPlan.taskProfile 读取）
  private currentProfile?: ThresholdProfile;
  // 动态 Few-shot 样例（从 Memory 历史数据提取，由 CLI 层注入）
  private dynamicExamples?: DynamicExample[];

  constructor(
    toolRegistry: ToolRegistry,
    llmProvider: LLMProvider,
    config?: Partial<LoopHarnessConfig>
  ) {
    this.toolRegistry = toolRegistry;
    this.llmProvider = llmProvider;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.orchestrator = new ExecutionOrchestrator(toolRegistry);
  }

  /** 获取当前配置（只读） */
  getConfig(): Readonly<LoopHarnessConfig> {
    return this.config;
  }

  /**
   * 注册 Agent 工厂
   *
   * writer / critic 类型注册为 IGeneratorAgent / IEvaluatorAgent 工厂 → LoopModule 主路径
   * 其他类型（如 ui-ux）注册为 AgentExecutor 工厂 → ExecutionOrchestrator 顺序执行
   */
  registerAgent(
    agentType: string,
    factory: (ctx: OrchestratorAgentContext) => AgentExecutor | IGeneratorAgent<any, any> | IEvaluatorAgent
  ): void {
    if (agentType === "writer") {
      this.writerFactory = factory as (ctx: any) => IGeneratorAgent<PlanStep, WriterOutput>;
    } else if (agentType === "critic") {
      this.criticFactory = factory as (ctx: any) => IEvaluatorAgent;
    } else {
      // 其他 agent 类型（如 ui-ux）→ orchestrator
      this.orchestrator.registerAgent(agentType, factory as (ctx: OrchestratorAgentContext) => AgentExecutor);
    }
  }

  /**
   * 设置评估标准（GradingCriteria）
   *
   * 必须在使用前调用此方法设置标准。
   * 如果不设置，将使用 DEFAULT_WRITING_CRITERIA。
   */
  setCriteria(criteria: GradingCriteria): void {
    this.criteria = criteria;
  }

  /**
   * 设置动态 Few-shot 样例 (v0.2.0)
   *
   * 由 CLI 层从 Memory 历史数据中提取同类型任务的高/低分评估记录，
   * 注入到 GradingCriteria 中作为额外的校准样例（追加在静态 examples 之后）。
   *
   * @param examples 动态样例数组，每个包含 description / score / reason
   */
  setDynamicExamples(examples: DynamicExample[]): void {
    this.dynamicExamples = examples;
  }

  /**
   * 检查是否可以使用 LoopModule 主路径
   */
  private canUseLoopModule(): boolean {
    return !!this.writerFactory && !!this.criticFactory;
  }

  /**
   * 延迟创建/获取 LoopModule 实例
   */
  private getOrCreateLoopModule(step: PlanStep): LoopModule<PlanStep, PlanStep, WriterOutput> {
    if (this.loopModule) {
      return this.loopModule;
    }

    if (!this.writerFactory || !this.criticFactory) {
      throw new Error("LoopHarness: 无法创建 LoopModule — 未注册 writer 或 critic agent。请先调用 registerAgent('writer', ...) 和 registerAgent('critic', ...)");
    }

    const ctx = {
      taskId: step.stepId,
      taskInput: step.description,
      tools: this.toolRegistry,
      llmProvider: this.llmProvider,
    };

    const generator = this.writerFactory(ctx);
    const evaluator = this.criticFactory(ctx);

    this.loopModule = new LoopModule<PlanStep, PlanStep, WriterOutput>({
      planner: {
        plan: async (input: PlanStep) => input, // Identity planner: 直接返回 step 作为计划
      },
      generator,
      evaluator,
      criteria: this.buildProfileAwareCriteria(),
      config: {
        maxIterations: this.config.maxRewrites + 1, // +1 因为首次执行也算一轮
        enableDegradationGuard: this.config.enableDegradationGuard,
        enableEvolution: true, // v0.2.0: 启用 SimpleEvolutionAgent 参与Inner Loop决策
        stagnationThreshold: 1, // 连续 1 轮无改善就触发
        useContextReset: true,
      },
    });

    return this.loopModule;
  }

  /**
   * 构建感知任务档位的 GradingCriteria
   *
   * v0.2.0:
   * - 根据 TaskProfile 覆盖阈值（passThreshold / excellenceThreshold）
   * - 将动态 Few-shot 样例（从 Memory 历史提取）追加到各维度的 examples 中
   * - 保留用户通过 setCriteria() 设置的自定义标准或 DEFAULT_WRITING_CRITERIA 的维度定义
   */
  private buildProfileAwareCriteria(): GradingCriteria {
    const base = this.criteria ?? DEFAULT_WRITING_CRITERIA;

    // 1. 应用 TaskProfile 阈值覆盖
    let result: GradingCriteria = base;
    if (this.currentProfile) {
      result = {
        ...base,
        passThreshold: this.currentProfile.evaluatorPass,
        excellenceThreshold: this.currentProfile.excellenceStop,
      };
    }

    // 2. 追加动态 Memory 样例到各维度
    if (this.dynamicExamples && this.dynamicExamples.length > 0) {
      result = {
        ...result,
        dimensions: result.dimensions.map((dim) => ({
          ...dim,
          examples: [
            ...(dim.examples ?? []),
            ...this.dynamicExamples!.map((ex) => ({
              description: ex.description,
              score: ex.score,
              reason: ex.reason,
            })),
          ],
        })),
      };
    }

    return result;
  }

  // ============================================================
  // 主入口：带循环的 Plan 执行
  // ============================================================

  /**
   * 执行完整计划（带 Inner Loop）
   *
   * 对每个 Writer step（有后续 Critic step 配对）：
   *   → 使用 LoopModule.run() 执行 Generator → Evaluator 循环
   *
   * 非 Writer step（如 ui-ux）：
   *   → 通过 ExecutionOrchestrator 顺序执行
   */
  async executeWithLoop(
    plan: ExecutionPlan,
    context: LoopContext,
    agentContext?: OrchestratorAgentContext
  ): Promise<HarnessExecutionResult> {
    const startTime = Date.now();
    const stepResults: StepLoopResult[] = [];
    const finalOutputs: Record<string, unknown> = {};
    let totalIterations = 0;

    // v0.2.0: 读取任务类型档位，用于阈值自适应选择
    this.currentProfile = getThresholdsForProfile(plan.taskProfile);
    if (plan.taskProfile) {
      console.log(`[LoopHarness] 使用任务档位: ${plan.taskProfile} (${this.currentProfile.label})`);
      console.log(`[LoopHarness] 阈值配置: pass=${this.currentProfile.evaluatorPass}, excellence=${this.currentProfile.excellenceStop}`);
    }

    // 按 step 顺序执行，对 Writer step 启动 Inner Loop
    for (const step of plan.steps) {
      if (step.agentType === "writer") {
        const criticStep = this.findFollowingCriticStep(plan, step);

        if (criticStep) {
          // Writer + Critic 配对 → LoopModule 主路径
          if (!this.canUseLoopModule()) {
            throw new Error(
              `[LoopHarness] Step "${step.stepId}" 需要 Writer-Critic 反馈环，` +
              `但未注册 writer 或 critic agent。` +
              `请调用 registerAgent('writer', ...) 和 registerAgent('critic', ...)。`
            );
          }

          const loopResult = await this.executeWithLoopModule(step, context, finalOutputs, agentContext);
          stepResults.push(loopResult);
          totalIterations += loopResult.iterations.length;

          // 收集最终输出
          if (loopResult.finalOutput.success) {
            finalOutputs[loopResult.finalOutput.stepId] = loopResult.finalOutput.output;
            // 同时写入 critic step 的位置（后续 step 可能引用）
            finalOutputs[criticStep.stepId] = {
              content: typeof loopResult.finalOutput.output === "object"
                ? (loopResult.finalOutput.output as Record<string, unknown>).content ?? ""
                : String(loopResult.finalOutput.output),
              criticScore: loopResult.finalScore,
              iterations: loopResult.iterations.length,
            };
          }

          console.log(
            `[LoopHarness] Step "${step.stepId}" 完成: ` +
            `${loopResult.iterations.length} 轮迭代, ` +
            `最终 score=${loopResult.finalScore}/100, ` +
            `passed=${loopResult.passed}` +
            (loopResult.iterations.length > 1 ? ` (经过 ${loopResult.iterations.length - 1} 次重写)` : "")
          );
        } else {
          // Writer step 无 Critic 配对 → 顺序执行一次
          const result = await this.orchestrator.executeStep(
            step, context, finalOutputs, agentContext
          );
          stepResults.push({
            stepId: step.stepId,
            iterations: [{
              round: 1,
              writerOutput: result,
              passed: result.success ? "quality_met" : "error",
              reason: result.success ? "quality_met" : "error",
              durationMs: result.durationMs,
            }],
            finalOutput: result,
            finalScore: 0,
            passed: result.success,
            totalDurationMs: result.durationMs,
          });
          if (result.success) {
            finalOutputs[result.stepId] = result.output;
          }
        }
      } else {
        // 非 Writer step（如 ui-ux）→ 顺序执行
        const result = await this.orchestrator.executeStep(
          step, context, finalOutputs, agentContext
        );
        if (result.success) {
          finalOutputs[result.stepId] = result.output;
        }
      }
    }

    const allPassed = stepResults.every((r) => r.passed);

    return {
      stepResults,
      finalOutputs,
      allPassed,
      totalIterations,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ============================================================
  // LoopModule 主路径
  // ============================================================

  /**
   * 使用 LoopModule 执行 Writer → Critic 反馈循环
   *
   * 流程：
   * 1. 创建/复用 LoopModule 实例
   * 2. 调用 loopModule.run(step) （含 SimpleEvolutionAgent 战略决策）
   * 3. 将 LoopModuleResult 转换为 StepLoopResult 格式
   */
  private async executeWithLoopModule(
    writerStep: PlanStep,
    _context: LoopContext,
    _previousOutputs: Record<string, unknown>,
    _agentContext?: OrchestratorAgentContext
  ): Promise<StepLoopResult> {
    const stepStartTime = Date.now();

    console.log(`[LoopHarness] Step "${writerStep.stepId}" 使用 LoopModule 执行`);

    // 获取或创建 LoopModule
    const loopModule = this.getOrCreateLoopModule(writerStep);

    // 执行循环（含 Evolution 决策）
    const moduleResult = await loopModule.run(writerStep);

    // 转换结果格式
    return this.convertToStepLoopResult(moduleResult, writerStep.stepId, stepStartTime);
  }

  /**
   * 将 LoopModuleResult 转换为 StepLoopResult
   */
  private convertToStepLoopResult(
    moduleResult: LoopModuleResult<WriterOutput>,
    stepId: string,
    stepStartTime: number
  ): StepLoopResult {
    // 转换迭代记录
    const iterations: StepLoopIteration[] = moduleResult.iterations.map((iter) => {
      // 从 GradingResult 构建 CriticOutputData
      const criticOutput: CriticOutputData = {
        overallScore: iter.evaluation.totalScore,
        dimensions: Object.fromEntries(
          iter.evaluation.dimensionScores.map((ds) => [
            ds.dimensionId,
            { score: ds.rawScore, comment: ds.comment },
          ])
        ),
        passed: iter.evaluation.passed,
        suggestions: iter.evaluation.suggestions.map((s) => ({
          type: s.dimensionId,
          severity: s.severity,
          description: s.description,
          suggestion: s.suggestion,
        })),
        reasoning: iter.evaluation.reasoning,
      };

      // 从 output 构建 StepExecutionResult
      const writerOutput: StepExecutionResult = {
        stepId,
        agentType: "writer",
        success: iter.stopReason !== "error",
        output: iter.output ?? {},
        durationMs: iter.durationMs,
      };

      // 映射 stopReason → reason/passed
      const reasonMap: Record<LoopIteration["stopReason"], StepLoopIteration["reason"]> = {
        excellent: "quality_met",
        passed: "quality_met",
        max_iterations: "max_rewrites",
        degradation: "degradation",
        stagnation_pivot: "stable_plateau",
        error: "error",
      };

      const reason = reasonMap[iter.stopReason] ?? "continue";

      return {
        round: iter.round,
        writerOutput,
        criticOutput,
        passed: reason,
        reason,
        durationMs: iter.durationMs,
      };
    });

    // 构建最终输出
    const bestOutputRaw = moduleResult.bestOutput;
    const finalOutput: StepExecutionResult = {
      stepId,
      agentType: "writer",
      success: moduleResult.passed,
      output: bestOutputRaw ?? {},
      durationMs: moduleResult.totalDurationMs,
    };

    return {
      stepId,
      iterations,
      finalOutput,
      finalScore: moduleResult.finalScore,
      passed: moduleResult.passed,
      totalDurationMs: Date.now() - stepStartTime,
    };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 查找 Writer step 后紧跟的 Critic step
   */
  private findFollowingCriticStep(
    plan: ExecutionPlan,
    writerStep: PlanStep
  ): PlanStep | null {
    const writerIdx = plan.steps.findIndex((s) => s.stepId === writerStep.stepId);
    if (writerIdx === -1) return null;

    // 在 writer step 之后找第一个 critic step
    for (let i = writerIdx + 1; i < plan.steps.length; i++) {
      if (plan.steps[i].agentType === "critic") {
        return plan.steps[i];
      }
    }
    return null;
  }
}
