/**
 * 集成测试套件 1: CompletionGuard + LoopModule
 *
 * 验证：LoopModule.run() 中 CompletionGuard 正确驱动目标停止条件
 * - 目标全通过 → all_goals_verified → 交付
 * - 部分失败 → 继续迭代（不因分数通过而提前停止）
 * - maxEffort 耗尽 → max_effort_exceeded → 停止并汇报剩余
 */

import { describe, it, expect } from "vitest";
import { CompletionGuard } from "../src/completion-guard/guard.js";
import type {
  AcceptanceGoal,
  VerificationContext,
} from "../src/completion-guard/types.js";

// ============================================================
// Mock 工具
// ============================================================

/** 创建总是返回指定结果的 mock pipeline */
function createMockPipeline(passMap: Record<string, boolean>) {
  return {
    async execute(method: unknown): Promise<any> {
      const m = method as { type: string; command?: string };
      const passed = passMap[m.type] ?? (passMap[m.command ?? ""] ?? false);
      return {
        goalId: "test-goal",
        method: m.type,
        timestamp: new Date().toISOString(),
        passed,
        evidence: { type: "command", command: m.command ?? `mock-${m.type}`, exitCode: passed ? 0 : 1, stdout: "", stderr: "" },
        durationMs: 5,
      };
    },
    async executeParallel() { return []; },
  };
}

const ctx: VerificationContext = { projectRoot: "/tmp/test" };

describe("集成测试 1: CompletionGuard 停止条件驱动", () => {

  it("场景 A: 全部 goal 通过 → all_goals_verified 停止", async () => {
    const goals: AcceptanceGoal[] = [
      { id: "g1", stepId: "s1", description: "G1", verifyBy: [{ type: "command", command: "true" }], priority: "critical", required: true },
      { id: "g2", stepId: "s1", description: "G2", verifyBy: [{ type: "file_exists", path: "package.json" }], priority: "major", required: false },
      { id: "g3", stepId: "s1", description: "G3", verifyBy: [{ type: "content_match", target: "package.json", pattern: /name/ }], priority: "minor", required: false },
    ];
    // 所有验证方法都返回 passed
    const guard = new CompletionGuard(goals, {}, undefined, createMockPipeline({
      command: true, file_exists: true, content_match: true,
    }));

    const result = await guard.check(undefined, ctx);

    expect(result.stopCondition).not.toBeNull();
    expect(result.stopCondition!.reason).toBe("all_goals_verified");
    expect(result.progress.verified).toBe(3);
    expect(result.progress.progressPercent).toBe(100);
  });

  it("场景 B: 部分 goal 失败 → null (继续迭代)，多轮后全部通过", async () => {
    let roundNumber = 0;
    const trackedPipeline = {
      async execute(method: unknown): Promise<any> {
        const m = method as { type: string; command?: string };
        // Round 1: g-fail fails, g-pass passes
        // Round 2+: g-fail also passes
        if (m.command === "fail-me" && roundNumber === 0) {
          return {
            goalId: "g-fail",
            method: "command",
            timestamp: new Date().toISOString(),
            passed: false,
            evidence: { type: "command", command: "fail-me", exitCode: 1, stdout: "", stderr: "failed" },
            durationMs: 5,
          };
        }
        return {
          goalId: m.command === "pass-me" ? "g-pass" : "g-fail",
          method: "command",
          timestamp: new Date().toISOString(),
          passed: true,
          evidence: { type: "command", command: m.command ?? "", exitCode: 0, stdout: "", stderr: "" },
          durationMs: 5,
        };
      },
      async executeParallel() { return []; },
    };

    const goals: AcceptanceGoal[] = [
      { id: "g-pass", stepId: "s1", description: "Always pass", verifyBy: [{ type: "command", command: "pass-me" }], priority: "critical", required: true },
      { id: "g-fail", stepId: "s1", description: "Fail then pass", verifyBy: [{ type: "command", command: "fail-me" }], priority: "major", required: false },
    ];
    const guard = new CompletionGuard(goals, { maxRetriesPerGoal: 3 }, undefined, trackedPipeline);

    // Round 1: g-pass verified, g-fail failed
    roundNumber = 0;
    const r1 = await guard.check(undefined, ctx);
    roundNumber++;
    expect(r1.stopCondition).toBeNull(); // 还有未完成的目标
    expect(r1.progress.verified).toBe(1);
    expect(r1.progress.failed).toBe(1);

    // Round 2: g-fail retry → passes
    const r2 = await guard.check(undefined, ctx);
    expect(r2.stopCondition!.reason).toBe("all_goals_verified");
    expect(r2.progress.verified).toBe(2);
  });

  it("场景 C: maxEffort 耗尽 → max_effort_exceeded 停止", async () => {
    const goals: AcceptanceGoal[] = [
      { id: "g-hard", stepId: "s1", description: "Always fails", verifyBy: [{ type: "command", command: "always-fail" }], priority: "critical", required: true },
    ];
    const guard = new CompletionGuard(
      goals,
      { maxEffort: 6, maxRetriesPerGoal: 10 }, // critical weight=3, 2 rounds = 6 effort
      undefined,
      createMockPipeline({ command: false })
    );

    // Round 1: effort += 3 (critical), total=3 < 6 → continue
    const r1 = await guard.check(undefined, ctx);
    expect(r1.stopCondition).toBeNull();

    // Round 2: effort += 3, total=6 >= 6 → max_effort_exceeded
    const r2 = await guard.check(undefined, ctx);
    expect(r2.stopCondition).not.toBeNull();
    expect(r2.stopCondition!.reason).toBe("max_effort_exceeded");

    const sc = r2.stopCondition as any;
    expect(sc.remainingGoals).toHaveLength(1);
    expect(sc.effortSpent).toBeGreaterThanOrEqual(sc.maxEffort);
  });

  it("场景 D: effort 权重计算 — critical > major > minor", async () => {
    const goals: AcceptanceGoal[] = [
      { id: "gc", stepId: "s1", description: "Critical", verifyBy: [{ type: "command", command: "c" }], priority: "critical", required: true },
      { id: "gm", stepId: "s1", description: "Major", verifyBy: [{ type: "command", command: "m" }], priority: "major", required: false },
      { id: "gi", stepId: "s1", description: "Minor", verifyBy: [{ type: "command", command: "i" }], priority: "minor", required: false },
    ];

    let roundCount = 0;
    const guard = new CompletionGuard(goals, { maxEffort: 5 }, undefined, createMockPipeline({ command: false }));

    // Round 1: effort = 3(critical) + 2(major) + 1(minor) = 6 > maxEffort(5)
    await guard.check(undefined, ctx);

    const progress = guard.getProgress();
    // effortRemaining should be negative or zero since we exceeded
    expect(guard.getEffortSpent()).toBe(6); // 3 + 2 + 1
  });

  it("场景 E: resetGoals 后重新验证", async () => {
    let callCount = 0;
    const pipeline = {
      async execute(): Promise<any> {
        callCount++;
        return {
          goalId: "g1",
          method: "command",
          timestamp: new Date().toISOString(),
          passed: callCount % 2 === 1, // odd rounds pass, even fail
          evidence: { type: "command", command: "", exitCode: 0, stdout: "", stderr: "" },
          durationMs: 5,
        };
      },
      async executeParallel() { return []; },
    };

    const goals: AcceptanceGoal[] = [
      { id: "g1", stepId: "s1", description: "G1", verifyBy: [{ type: "command", command: "x" }], priority: "critical", required: true },
    ];
    const guard = new CompletionGuard(goals, {}, undefined, pipeline);

    // Round 1: callCount=1, passed=true → verified
    const r1 = await guard.check(undefined, ctx);
    expect(r1.stopCondition!.reason).toBe("all_goals_verified");

    // Reset
    guard.resetGoals(["g1"]);
    expect(guard.getProgress().verified).toBe(0);

    // Round 2 (after reset): callCount=2, passed=false → failed
    const r2 = await guard.check(undefined, ctx);
    expect(r2.stopCondition).toBeNull(); // not all verified
    expect(r2.progress.failed).toBe(1);
  });
});
