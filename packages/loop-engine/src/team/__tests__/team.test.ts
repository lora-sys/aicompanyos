/**
 * Team Architecture 单元测试
 *
 * 覆盖：TaskAnalyzer / TeamComposer / TeamManager / WorkerRegistry
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  TaskAnalyzer,
  TeamComposer,
  TeamManager,
  WorkerRegistry,
  globalWorkerRegistry,
  type TaskFeatures,
  type TeamCompositionRule,
  type WorkerRole,
  type TeamWorkerDef,
} from "../index.js";

// ============================================================
// TaskAnalyzer 测试
// ============================================================

describe("TaskAnalyzer", () => {
  const analyzer = new TaskAnalyzer();

  it("应正确提取技术文章特征", () => {
    const features = analyzer.analyze("写一篇关于 AI Agent 的深度技术文章，需要调研最新论文，做系统性对比分析和实战项目");
    expect(features.domain).toBe("tech");
    expect(features.needsResearch).toBe(true);
    expect(features.complexity).toBe("high"); // 含"深度"+"系统性"+"对比分析"+长文本 → score >= 4
    expect(features.length).toBe("long");
    // "深度"匹配 premium 关键词
    expect(["standard", "premium"]).toContain(features.qualityTier);
    expect(features.estimatedSteps).toBeGreaterThanOrEqual(3);
  });

  it("应正确提取种草笔记特征", () => {
    const features = analyzer.analyze("写一个小红书种草笔记推荐夏日护肤好物");
    expect(features.domain).toBe("lifestyle");
    expect(features.hasVisualContent).toBe(true);
    expect(features.needsResearch).toBe(false);
    expect(features.length).toBe("short");
  });

  it("应正确提取短视频脚本特征", () => {
    const features = analyzer.analyze("写一个抖音短视频脚本，需要设计画面和音效");
    expect(features.hasVisualContent).toBe(true);
    expect(features.domain).toBe("general"); // 无明确领域关键词
    expect(features.estimatedSteps).toBeGreaterThanOrEqual(3); // writer + critic + uiux
  });

  it("应处理空输入", () => {
    const features = analyzer.analyze("");
    expect(features.domain).toBe("general");
    expect(features.confidence).toBeGreaterThan(0);
  });

  it("应检测 premium 质量", () => {
    const features = analyzer.analyze("写一篇深度专业的行业白皮书，高质量产出");
    expect(features.qualityTier).toBe("premium");
  });

  it("应检测 draft 模式", () => {
    const features = analyzer.analyze("快速写一个简单的大纲");
    expect(features.qualityTier).toBe("draft");
    expect(features.complexity).toBe("low");
  });
});

// ============================================================
// TeamComposer 测试
// ============================================================

describe("TeamComposer", () => {
  // 测试规则集
  const TEST_RULES: TeamCompositionRule[] = [
    {
      id: "research-heavy",
      match: (f: TaskFeatures) => f.needsResearch && f.complexity === "high",
      team: [
        { role: "writer", priority: "essential" },
        { role: "researcher", priority: "essential" },
        { role: "critic", priority: "essential" },
        { role: "reviewer", priority: "optional" },
      ],
      reasoning: "高复杂度调研型任务",
      priority: 10,
    },
    {
      id: "visual-content",
      match: (f: TaskFeatures) => f.hasVisualContent,
      team: [
        { role: "writer", priority: "essential" },
        { role: "critic", priority: "essential" },
        { role: "uiux-designer", priority: "essential" },
      ],
      reasoning: "视觉内容任务",
      priority: 20,
    },
    {
      id: "quick-output",
      match: (f: TaskFeatures) => f.length === "short" && !f.needsResearch,
      team: [
        { role: "writer", priority: "essential", configOverride: { qualityThreshold: 70 } },
        { role: "critic", priority: "essential", configOverride: { qualityThreshold: 70 } },
      ],
      reasoning: "短内容快速出稿",
      priority: 30,
    },
    // 默认兜底
    {
      id: "default-pair",
      match: () => true,
      team: [
        { role: "writer", priority: "essential" },
        { role: "critic", priority: "essential" },
      ],
      reasoning: "默认 Writer+Critic 配对",
      priority: 999,
    },
  ];

  const composer = new TeamComposer(TEST_RULES);

  it("应匹配高复杂度调研规则（优先级最高）", () => {
    const features: TaskFeatures = {
      domain: "tech",
      needsResearch: true,
      hasVisualContent: false,
      length: "long",
      qualityTier: "standard",
      complexity: "high",
      estimatedSteps: 4,
      confidence: 0.9,
    };
    const workers = composer.compose(features);
    expect(workers).toHaveLength(4); // writer + researcher + critic + reviewer
    expect(workers.some((w) => w.role === "researcher")).toBe(true);
    expect(workers.some((w) => w.role === "reviewer")).toBe(true);
  });

  it("应匹配视觉内容规则", () => {
    const features: TaskFeatures = {
      domain: "lifestyle",
      needsResearch: false,
      hasVisualContent: true,
      length: "medium",
      qualityTier: "standard",
      complexity: "medium",
      estimatedSteps: 3,
      confidence: 0.85,
    };
    const workers = composer.compose(features);
    expect(workers).toHaveLength(3); // writer + critic + uiux-designer
    expect(workers.some((w: TeamWorkerDef) => w.role === "uiux-designer")).toBe(true);
  });

  it("应匹配快速出稿规则", () => {
    const features: TaskFeatures = {
      domain: "lifestyle",
      needsResearch: false,
      hasVisualContent: false,
      length: "short",
      qualityTier: "draft",
      complexity: "low",
      estimatedSteps: 2,
      confidence: 0.8,
    };
    const workers = composer.compose(features);
    expect(workers).toHaveLength(2);
    expect(workers[0].configOverride?.qualityThreshold).toBe(70);
  });

  it("兜底规则应在无其他规则命中时生效", () => {
    const features: TaskFeatures = {
      domain: "general",
      needsResearch: false,
      hasVisualContent: false,
      length: "medium",
      qualityTier: "standard",
      complexity: "medium",
      estimatedSteps: 2,
      confidence: 0.7,
    };
    const workers = composer.compose(features);
    expect(workers).toHaveLength(2); // writer + critic (默认)
    expect(workers[0].role).toBe("writer");
    expect(workers[1].role).toBe("critic");
  });

  it("dryRun 应返回命中的规则 ID", () => {
    const features: TaskFeatures = {
      domain: "tech",
      needsResearch: true,
      hasVisualContent: false,
      length: "long",
      qualityTier: "standard",
      complexity: "high",
      estimatedSteps: 4,
      confidence: 0.9,
    };
    expect(composer.dryRun(features)).toBe("research-heavy");
  });

  it("defsToWorkers 应生成正确的 IWorker 数组", () => {
    const defs = [{ role: "writer" as WorkerRole, priority: "essential" as const }];
    const workers = composer.defsToWorkers(defs, "test-task-123");
    expect(workers).toHaveLength(1);
    expect(workers[0].id).toContain("writer-");
    expect(workers[0].required).toBe(true);
  });

  it("没有兜底规则时应抛出异常", () => {
    const noFallbackRules: TeamCompositionRule[] = [
      {
        id: "only-special",
        match: () => false, // 永远不命中
        team: [{ role: "writer", priority: "essential" }],
        reasoning: "特殊规则",
        priority: 10,
      },
    ];
    const badComposer = new TeamComposer(noFallbackRules);
    const features: TaskFeatures = {
      domain: "general",
      needsResearch: false,
      hasVisualContent: false,
      length: "medium",
      qualityTier: "standard",
      complexity: "low",
      estimatedSteps: 2,
      confidence: 0.5,
    };
    expect(() => badComposer.compose(features)).toThrow();
  });
});

// ============================================================
// TeamManager 集成测试
// ============================================================

describe("TeamManager", () => {
  const RULES: TeamCompositionRule[] = [
    {
      id: "test-research",
      match: (f) => f.needsResearch,
      team: [
        { role: "writer", priority: "essential" },
        { role: "researcher", priority: "essential" },
        { role: "critic", priority: "essential" },
      ],
      reasoning: "需要调研",
      priority: 10,
    },
    {
      id: "test-default",
      match: () => true,
      team: [
        { role: "writer", priority: "essential" },
        { role: "critic", priority: "essential" },
      ],
      reasoning: "默认",
      priority: 999,
    },
  ];

  const manager = new TeamManager({ rules: RULES });

  it("composeTeam 应返回完整的 ITeam 对象", async () => {
    const team = await manager.composeTeam("写一篇关于 AI Agent 的深度调研文章", {
      departmentId: "test-dept",
      availableRoles: ["writer", "critic", "researcher"],
    });

    expect(team.id).toBeTruthy();
    expect(team.taskId).toBeTruthy();
    expect(team.workers.length).toBeGreaterThanOrEqual(2);
    expect(team.features.needsResearch).toBe(true);
    expect(team.matchedRuleId).toBe("test-research");
    expect(team.createdAt).toBeInstanceOf(Date);
    expect(team.goal).toContain("调研");
  });

  it("createWorkerFactories 应返回包含所有 agentType 的 Map", async () => {
    const team = await manager.composeTeam("写一篇文章", {
      departmentId: "test-dept",
      availableRoles: ["writer", "critic"],
    });
    const factories = manager.createWorkerFactories(team);

    expect(factories.size).toBeGreaterThanOrEqual(1);
    expect(factories.has("writer")).toBe(true);
    expect(factories.has("critic")).toBe(true);
  });

  it("用户偏好 preferFastMode 应降低质量要求", async () => {
    const team = await manager.composeTeam("快速写个简单大纲", {
      departmentId: "test-dept",
      availableRoles: ["writer", "critic"],
      userPreferences: { preferFastMode: true },
    });

    expect(team.features.qualityTier).toBe("draft");
    expect(team.features.complexity).toBe("low");
  });
});

// ============================================================
// WorkerRegistry 测试
// ============================================================

describe("WorkerRegistry", () => {
  beforeEach(() => {
    globalWorkerRegistry.clear();
  });

  it("应能注册和查询 Worker", () => {
    globalWorkerRegistry.register({
      id: "writer-primary",
      role: "writer",
      agentType: "writer",
      defaultFactory: (() => null as any),
      description: "主要写手",
    });

    expect(globalWorkerRegistry.size).toBe(1);
    expect(globalWorkerRegistry.hasRole("writer")).toBe(true);
    expect(globalWorkerRegistry.getWorkersByRole("writer")).toHaveLength(1);
    expect(globalWorkerRegistry.getByAgentType("writer")?.id).toBe("writer-primary");
  });

  it("重复注册应抛出异常", () => {
    globalWorkerRegistry.register({
      id: "dup-test",
      role: "writer",
      agentType: "writer",
      defaultFactory: (() => null as any),
    });

    expect(() => {
      globalWorkerRegistry.register({
        id: "dup-test",
        role: "writer",
        agentType: "writer",
        defaultFactory: (() => null as any),
      });
    }).toThrow();
  });

  it("clear 应清空所有注册", () => {
    globalWorkerRegistry.register({
      id: "to-clear",
      role: "critic",
      agentType: "critic",
      defaultFactory: (() => null as any),
    });
    expect(globalWorkerRegistry.size).toBe(1);

    globalWorkerRegistry.clear();
    expect(globalWorkerRegistry.size).toBe(0);
  });
});
