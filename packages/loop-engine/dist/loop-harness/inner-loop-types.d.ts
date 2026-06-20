/**
 * IInnerLoopEngine — Inner Loop 统一接口
 *
 * 这是 LoopHarness 内部 Writer→Critic 迭代循环的抽象 seam。
 * 两种实现：
 * - LegacyInnerLoopDriver: 原有 LoopModule 手搓循环（向后兼容）
 * - PiAgentInnerLoopDriver: 基于 pi-agent-core 的 agentLoop 驱动
 *
 * 设计原则：
 * - 接口小且深：LoopHarness 只需调用 run()，不关心内部是手搓还是 agentLoop
 * - 结果统一：两种 driver 返回相同的 InnerLoopResult，下游代码无感知
 * - 可替换：未来新增 driver 只需实现此接口
 */
import type { GradingCriteria, GradingResult } from "../loop-module/grading-criteria.js";
import type { PlanStep } from "../types.js";
import type { DepartmentConfig } from "../department/types.js";
import type { AcceptanceGoal, CompletionGuardConfig } from "../completion-guard/types.js";
/** 单次迭代结果 */
export interface InnerLoopIteration<TOutput = unknown> {
    /** 迭代轮次 (1-based) */
    round: number;
    /** 生成器的产出 */
    output: TOutput;
    /** 评估结果 */
    evaluation: GradingResult;
    /** 终止原因 */
    stopReason: InnerLoopStopReason;
    /** 本轮耗时 ms */
    durationMs: number;
}
/** Inner Loop 停止原因 */
export type InnerLoopStopReason = "continue" | "excellent" | "passed" | "max_iterations" | "degradation" | "stagnation_pivot" | "goals_verified" | "goals_blocked" | "effort_exceeded" | "error";
/** Inner Loop 完整执行结果 */
export interface InnerLoopResult<TOutput = unknown> {
    /** 所有迭代记录 */
    iterations: InnerLoopIteration<TOutput>[];
    /** 最终使用的产出（最佳版本） */
    bestOutput: TOutput | null;
    /** 最终评分 */
    finalScore: number;
    /** 最终是否通过 */
    passed: boolean;
    /** 最终是否优秀 */
    excellent: boolean;
    /** 总迭代次数 */
    totalIterations: number;
    /** 总耗时 ms */
    totalDurationMs: number;
    /** 目标完成度快照 */
    goalSnapshot?: Array<{
        goalId: string;
        status: "pending" | "verifying" | "verified" | "failed" | "blocked" | "skipped";
    }>;
    /** 结构化停止条件 */
    stopCondition?: import("../completion-guard/types.js").StopCondition;
    /** 完成进度 */
    completionProgress?: {
        totalGoals: number;
        verifiedGoals: number;
        progressPercent: number;
    };
}
/** Inner Loop 公共配置 — 两种 driver 共享 */
export interface InnerLoopConfig {
    /** 最大迭代次数（安全阀） */
    maxIterations: number;
    /** 是否启用退化保护 */
    enableDegradationGuard: boolean;
    /** 连续多少轮无改善触发停止 */
    stagnationThreshold: number;
    /** 评估标准 */
    criteria: GradingCriteria;
    /** 是否启用 CompletionGuard */
    enableCompletionGuard?: boolean;
    /** 验收目标列表 */
    acceptanceCriteria?: AcceptanceGoal[];
    /** CompletionGuard 配置 */
    completionGuardConfig?: Partial<CompletionGuardConfig>;
    /** 最低质量分数（门控） */
    minQualityScore?: number;
    /** LLM Provider 包装函数 */
    llmProviderFn?: (prompt: string) => Promise<string>;
    /** 部门配置 */
    departmentConfig?: DepartmentConfig;
    onIterationStart?: (iteration: number, stepId: string) => void;
    onWriterOutput?: (content: string, iteration: number) => void;
    onCriticResult?: (score: number, passed: boolean, suggestions: string[], iteration: number) => void;
    onGoalProgress?: (verified: number, total: number, stopCondition: string) => void;
}
/**
 * Inner Loop 引擎接口
 *
 * LoopHarness 通过此接口与具体 driver 解耦。
 * 每个 driver 负责自己的 Writer→Critic 迭代逻辑，
 * 但必须返回统一的 InnerLoopResult。
 */
export interface IInnerLoopEngine {
    /**
     * 执行 Inner Loop
     *
     * @param step 当前 PlanStep
     * @param taskInput 任务描述（用于评估的 topic accuracy 检测）
     * @returns 统一的 InnerLoopResult
     */
    run(step: PlanStep, taskInput: string): Promise<InnerLoopResult>;
    /**
     * 设置 pi-agent-core 事件转发回调（仅 PiAgentInnerLoopDriver 使用）
     * Legacy driver 可以空实现。
     */
    setEventForwarder?(forwarder: (event: unknown) => void): void;
}
//# sourceMappingURL=inner-loop-types.d.ts.map