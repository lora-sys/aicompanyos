import { describe, it, expect } from "vitest";
import {
  evaluateStop,
  isSignificantImprovement,
  StopPolicy,
  DEFAULT_STOP_POLICY_CONFIG,
  type StopContext,
} from "../policy.js";
import type { GradingResult } from "../../loop-module/grading-criteria.js";
import type { CompletionCheckResult } from "../../completion-guard/types.js";

const baseEval = (score: number, opts?: Partial<GradingResult>): GradingResult => ({
  totalScore: score,
  weightedScore: score,
  passed: score >= 75,
  excellent: score >= 90,
  dimensionScores: [],
  reasoning: "",
  suggestions: [],
  round: 1,
  ...opts,
});

const baseCtx = (overrides?: Partial<StopContext>): StopContext => ({
  iteration: 1,
  evaluation: baseEval(70),
  bestScore: 70,
  lastScore: 70,
  stagnationCount: 0,
  guardResult: null,
  hasError: false,
  ...overrides,
});

describe("StopPolicy", () => {
  it("P0: any_goal_blocked → stop", () => {
    const guardResult: CompletionCheckResult = {
      checkedGoals: [],
      stopCondition: {
        reason: "any_goal_blocked",
        verifiedGoals: [],
        blockedGoals: [{ goalId: "g1", blocker: { category: "missing_dependency", description: "x" } }],
        pendingGoals: [],
      },
      evidences: [],
      progress: { total: 1, verified: 0, failed: 0, pending: 0, blocked: 1, progressPercent: 0, effortRemaining: 0 },
    };
    const decision = evaluateStop(baseCtx({ guardResult }), DEFAULT_STOP_POLICY_CONFIG);
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe("goals_blocked");
  });

  it("P0: all_goals_verified + quality not met → continue", () => {
    const guardResult: CompletionCheckResult = {
      checkedGoals: [],
      stopCondition: {
        reason: "all_goals_verified",
        verifiedGoals: [{ goalId: "g1", evidence: {} as any }],
        totalIterations: 1,
        totalDurationMs: 0,
      },
      evidences: [],
      progress: { total: 1, verified: 1, failed: 0, pending: 0, blocked: 0, progressPercent: 100, effortRemaining: 0 },
    };
    const decision = evaluateStop(
      baseCtx({ guardResult, evaluation: baseEval(70) }),
      { ...DEFAULT_STOP_POLICY_CONFIG, minQualityScore: 75 }
    );
    expect(decision.stop).toBe(false);
    expect(decision.reason).toBe("continue");
  });

  it("P0: all_goals_verified + quality met → stop", () => {
    const guardResult: CompletionCheckResult = {
      checkedGoals: [],
      stopCondition: {
        reason: "all_goals_verified",
        verifiedGoals: [{ goalId: "g1", evidence: {} as any }],
        totalIterations: 1,
        totalDurationMs: 0,
      },
      evidences: [],
      progress: { total: 1, verified: 1, failed: 0, pending: 0, blocked: 0, progressPercent: 100, effortRemaining: 0 },
    };
    const decision = evaluateStop(
      baseCtx({ guardResult, evaluation: baseEval(80) }),
      { ...DEFAULT_STOP_POLICY_CONFIG, minQualityScore: 75 }
    );
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe("goals_verified");
  });

  it("P1: excellent → stop", () => {
    const decision = evaluateStop(baseCtx({ evaluation: baseEval(92) }), DEFAULT_STOP_POLICY_CONFIG);
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe("excellent");
  });

  it("P1: passed → stop", () => {
    const decision = evaluateStop(baseCtx({ evaluation: baseEval(80) }), DEFAULT_STOP_POLICY_CONFIG);
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe("passed");
  });

  it("P2: 分数微降不超过阈值 → continue", () => {
    const decision = evaluateStop(
      baseCtx({ iteration: 2, evaluation: baseEval(72), lastScore: 75 }),
      DEFAULT_STOP_POLICY_CONFIG
    );
    expect(decision.stop).toBe(false);
  });

  it("P2: 分数下降超过阈值 → degradation stop", () => {
    const decision = evaluateStop(
      baseCtx({ iteration: 2, evaluation: baseEval(60), lastScore: 75 }),
      DEFAULT_STOP_POLICY_CONFIG
    );
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe("degradation");
  });

  it("P3: 停滞检测 → stagnation_pivot stop", () => {
    const decision = evaluateStop(
      baseCtx({ iteration: 3, stagnationCount: 2, evaluation: baseEval(70) }),
      DEFAULT_STOP_POLICY_CONFIG
    );
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe("stagnation_pivot");
  });

  it("P4: maxIterations → stop", () => {
    const decision = evaluateStop(
      baseCtx({ iteration: 5, evaluation: baseEval(60) }),
      { ...DEFAULT_STOP_POLICY_CONFIG, maxIterations: 5 }
    );
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe("max_iterations");
  });

  it("Class API works", () => {
    const policy = new StopPolicy({ maxIterations: 3 });
    expect(policy.getConfig().maxIterations).toBe(3);
    const decision = policy.evaluate(baseCtx({ iteration: 3, evaluation: baseEval(60) }));
    expect(decision.stop).toBe(true);
  });

  it("isSignificantImprovement: new best", () => {
    expect(isSignificantImprovement(85, 80, 80, 3)).toBe("new_best");
  });

  it("isSignificantImprovement: improved", () => {
    expect(isSignificantImprovement(85, 90, 80, 3)).toBe("improved");
  });

  it("isSignificantImprovement: stagnant", () => {
    expect(isSignificantImprovement(82, 90, 80, 3)).toBe("stagnant");
  });
});
