/**
 * 集成测试套件 4: GoalTemplateRegistry 模板匹配
 *
 * 验证：自动模板根据 step 描述正确生成验收目标
 * - 代码实现类 → tsc + file_exists + lint
 * - 文章写作类 → file_exists + has_content
 * - UI 类 → tsc + ui_file_exists
 * - 通用 Writer 兜底 → output_exists
 */

import { describe, it, expect } from "vitest";
import { GoalTemplateRegistry } from "../src/completion-guard/goal-templates.js";

describe("集成测试 4: GoalTemplateRegistry 自动模板匹配", () => {
  let registry: GoalTemplateRegistry;

  beforeEach(() => {
    registry = new GoalTemplateRegistry();
  });

  it("代码实现类 step 应生成 tsc + file 目标", () => {
    const goals = registry.generateGoals(
      "step-impl",
      "writer",
      "实现用户认证模块，包含登录和注册功能"
    );

    // 代码模板应至少生成 tsc_clean 和 file_exists
    expect(goals.length).toBeGreaterThanOrEqual(2);
    const ids = goals.map((g) => g.id);
    expect(ids.some((id) => id.includes("tsc"))).toBe(true);
    expect(ids.some((id) => id.includes("file"))).toBe(true);

    // 所有目标都应有关联的 verifyBy
    for (const goal of goals) {
      expect(goal.verifyBy.length).toBeGreaterThan(0);
      expect(goal.stepId).toBe("step-impl");
      expect(goal.priority).toBeDefined();
    }
  });

  it("文章写作类 step 应生成文件存在目标", () => {
    const goals = registry.generateGoals(
      "step-article",
      "writer",
      "写一篇关于 Loop Engineering 的技术博客文章"
    );

    expect(goals.length).toBeGreaterThanOrEqual(1);

    // 文章模板生成的目标是 md 文件存在性检查
    const fileGoal = goals.find((g) =>
      g.verifyBy.some((v) =>
        v.type === "file_exists" && typeof (v as any).path === "string"
      )
    );
    expect(fileGoal).toBeDefined();
    if (fileGoal) {
      expect(fileGoal.id).toContain("file_exists");
    }
  });

  it("UI/前端类 step 应生成 tsc 和 UI 组件文件目标", () => {
    const goals = registry.generateGoals(
      "step-ui",
      "writer",
      "创建 React 登录页面组件"
    );

    // UI 模板应至少生成 2 个目标: tsc_clean + ui_file_exists
    expect(goals.length).toBeGreaterThanOrEqual(2);
    const ids = goals.map((g) => g.id);
    expect(ids.some((id) => id.includes("tsc"))).toBe(true);
    expect(ids.some((id) => id.includes("ui") || id.includes("file"))).toBe(true);
  });

  it("critic 类 step 不生成目标（非产出型）", () => {
    const goals = registry.generateGoals(
      "step-critic",
      "critic",
      "评估代码质量并给出改进建议"
    );

    // critic 类型不匹配任何 writer 模板 → 返回空
    expect(goals.length).toBe(0);
  });

  it("通用 Writer 兜底模板对未识别的 writer step 生成分基础目标", () => {
    const goals = registry.generateGoals(
      "step-generic",
      "writer",
      "做一些不明确的事情"
    );

    // 至少有兜底的 output_exists 目标
    expect(goals.length).toBeGreaterThanOrEqual(1);
    expect(goals[0].verifyBy[0].type).toBe("file_exists");
  });

  it("自定义模板优先级高于内置模板", () => {
    // 注册一个自定义模板（会插入到队列头部，优先匹配）
    registry.registerTemplate({
      match: {
        agentType: "writer",
        keywords: ["特殊任务"],
      },
      generate: (stepId) => [
        {
          id: `${stepId}_custom`,
          stepId,
          description: "自定义验收目标",
          verifyBy: [{ type: "command", command: "custom-check" }],
          priority: "critical" as const,
          required: true,
        },
      ],
    });

    const goals = registry.generateGoals(
      "step-special",
      "writer",
      "执行特殊任务的步骤"
    );

    // 自定义模板应该先匹配，返回自定义目标
    expect(goals.length).toBe(1);
    expect(goals[0].id).toBe("step-special_custom");
    expect(goals[0].description).toBe("自定义验收目标");
  });
});
