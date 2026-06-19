/**
 * Content Production Department — 集成测试
 *
 * 验证 Phase A-E 的完整数据流：
 * DepartmentConfig → LoopHarness → GoalTemplate → OutputPipeline
 */

import { describe, it, expect } from "vitest";
import { ContentProductionDepartment } from "../src/index.js";
import type {
  ContentType,
  DepartmentConfig,
  AgentProfile,
  WriterConstraints,
  OutputPipelineConfig,
  QualityGateConfig,
} from "@aicos/loop-engine";

const dept = new ContentProductionDepartment();

describe("ContentProductionDepartment — 部门配置完整性", () => {

  // ============================================================
  // 1. 基础信息验证
  // ============================================================

  it("部门身份信息正确", () => {
    expect(ContentProductionDepartment.DEPARTMENT_ID).toBe("content-production");
    expect(ContentProductionDepartment.DEPARTMENT_NAME).toBe("内容产出部");
    expect(ContentProductionDepartment.VERSION).toBe("1.0.0");
  });

  it("支持全部 4 种内容格式", () => {
    expect(ContentProductionDepartment.SUPPORTED_TYPES).toContain("article");
    expect(ContentProductionDepartment.SUPPORTED_TYPES).toContain("seed");
    expect(ContentProductionDepartment.SUPPORTED_TYPES).toContain("short-video");
    expect(ContentProductionDepartment.SUPPORTED_TYPES).toContain("newsletter");
    expect(ContentProductionDepartment.SUPPORTED_TYPES.length).toBe(4);
  });

  // ============================================================
  // 2. getConfig() 对每种格式返回完整的 DepartmentConfig
  // ============================================================

  const testContentTypes: Array<{ type: ContentType; label: string }> = [
    { type: "article", label: "图文" },
    { type: "seed", label: "种草" },
    { type: "short-video", label: "短视频" },
    { type: "newsletter", label: "Newsletter" },
  ];

  for (const { type, label } of testContentTypes) {
    describe(`${label} (${type}) 格式`, () => {
      let config: DepartmentConfig;

      beforeAll(() => {
        config = dept.getConfig(type);
      });

      it(`返回非空 DepartmentConfig`, () => {
        expect(config).toBeDefined();
        expect(config.departmentId).toBe("content-production");
        expect(config.contentType).toBe(type);
      });

      it("包含完整的 AgentProfile", () => {
        const profile = config.agentProfile;
        expect(profile).toBeDefined();
        expect(profile.writerSystemPrompt).toBeDefined();
        expect(profile.writerSystemPrompt.length).toBeGreaterThan(100); // Prompt 不应太短
        expect(profile.writerConstraints).toBeDefined();
      });

      it("WriterConstraints 包含篇幅约束", () => {
        const constraints = config.agentProfile.writerConstraints;
        expect(constraints.lengthConstraint).toBeDefined();
        expect(constraints.lengthConstraint?.unit).toBe("chars");
        expect(constraints.lengthConstraint?.minLength).toBeGreaterThan(0);
        expect(constraints.lengthConstraint?.maxLength).toBeGreaterThan(
          constraints.lengthConstraint.minLength ?? 0
        );
      });

      it("WriterConstraints 包含禁止事项", () => {
        const prohibitions = config.agentProfile.writerConstraints.prohibitions;
        expect(prohibitions).toBeDefined();
        expect(Array.isArray(prohibitions)).toBe(true);
        expect(prohibitions!.length).toBeGreaterThanOrEqual(3);
      });

      it("WriterConstraints 包含必须元素", () => {
        const requirements = config.agentProfile.writerConstraints.requirements;
        expect(requirements).toBeDefined();
        expect(Array.isArray(requirements)).toBe(true);
        expect(requirements!.length).toBeGreaterThanOrEqual(2);
      });

      it("包含 Critic 评估维度", () => {
        const dimensions = config.agentProfile.criticDimensions;
        expect(dimensions).toBeDefined();
        expect(Array.isArray(dimensions)).toBe(true);
        expect(dimensions!.length).toBeGreaterThanOrEqual(4); // 每种格式至少 4 个维度
        // 每个维度应有 id, name, maxScore, scoringGuide
        for (const dim of dimensions!) {
          expect(dim.id).toBeDefined();
          expect(dim.name).toBeDefined();
          expect(dim.maxScore).toBeGreaterThan(0);
          expect(dim.scoringGuide).toBeDefined();
          expect(dim.scoringGuide.length).toBeGreaterThan(20);
        }
      });

      it("包含部门专属 GoalTemplate", () => {
        const templates = config.goalTemplates;
        expect(templates).toBeDefined();
        expect(Array.isArray(templates)).toBe(true);
        expect(templates!.length).toBeGreaterThanOrEqual(1);

        // 验证模板可以生成目标
        if (templates && templates.length > 0) {
          const goals = templates[0].generate("test-step-1", `写一篇关于AI的${label}`);
          expect(goals).toBeDefined();
          expect(goals.length).toBeGreaterThanOrEqual(2); // 每种格式至少 2 个验收目标
          // 每个 goal 应有 id, description, verifyBy, priority
          for (const goal of goals) {
            expect(goal.id).toBeDefined();
            expect(goal.description).toBeDefined();
            expect(goal.verifyBy).toBeDefined();
            expect(goal.verifyBy.length).toBeGreaterThanOrEqual(1);
            expect(["critical", "major", "minor"]).toContain(goal.priority);
          }
        }
      });

      it("包含 OutputPipeline 配置", () => {
        const pipeline = config.outputPipeline;
        expect(pipeline).toBeDefined();
        expect(pipeline!.primaryFormat).toBeDefined();
        expect(["markdown", "html", "json", "plain"]).toContain(pipeline!.primaryFormat);
        expect(pipeline!.postProcessors).toBeDefined();
        expect(pipeline!.postProcessors.length).toBeGreaterThanOrEqual(1);
      });

      it("包含 QualityGate 配置", () => {
        const gate = config.qualityGate;
        expect(gate).toBeDefined();
        expect(gate!.passThreshold).toBeGreaterThanOrEqual(60);
        expect(gate!.excellenceThreshold).toBeGreaterThan(gate!.passThreshold!);
      });

      it("包含工具集", () => {
        expect(config.toolSet).toBeDefined();
        expect(config.toolSet).toContain("web_search");
      });
    });
  }

  // ============================================================
  // 3. getAvailableTypes() 返回正确列表
  // ============================================================

  it("getAvailableTypes() 返回 4 种格式的描述", () => {
    const types = dept.getAvailableTypes();
    expect(types).toHaveLength(4);
    expect(types.map((t) => t.type)).toEqual(
      expect.arrayContaining(["article", "seed", "short-video", "newsletter"])
    );

    // 每种类型应有 label 和 description
    for (const t of types) {
      expect(t.label).toBeDefined();
      expect(t.description).toBeDefined();
      expect(t.description.length).toBeGreaterThan(5);
    }
  });

  // ============================================================
  // 4. 错误处理：不支持的内容格式
  // ============================================================

  it("传入不支持的内容格式时抛出错误", () => {
    expect(() => dept.getConfig("podcast" as ContentType)).toThrow(
      /不支持的内容格式/
    );
  });

  // ============================================================
  // 5. 各格式之间的关键差异验证
  // ============================================================

  it("4 种格式的 Writer Prompt 各不相同", () => {
    const articlePrompt = dept.getConfig("article").agentProfile.writerSystemPrompt;
    const seedPrompt = dept.getConfig("seed").agentProfile.writerSystemPrompt;
    const svPrompt = dept.getConfig("short-video").agentProfile.writerSystemPrompt;
    const nlPrompt = dept.getConfig("newsletter").agentProfile.writerSystemPrompt;

    // 4 个 prompt 应该各不相同
    const prompts = [articlePrompt, seedPrompt, svPrompt, nlPrompt];
    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(4);

    // 每个 prompt 应该足够长（不是占位符）
    for (const prompt of prompts) {
      expect(prompt.length).toBeGreaterThan(500);
    }
  });

  it("4 种格式的篇幅约束符合预期", () => {
    const article = dept.getConfig("article").agentProfile.writerConstraints.lengthConstraint!;
    const seed = dept.getConfig("seed").agentProfile.writerConstraints.lengthConstraint!;
    const sv = dept.getConfig("short-video").agentProfile.writerConstraints.lengthConstraint!;
    const nl = dept.getConfig("newsletter").agentProfile.writerConstraints.lengthConstraint!;

    // 图文 > Newsletter > 短视频 > 种草 (大致)
    expect(article.maxLength!).toBeGreaterThan(nl.maxLength!);
    expect(nl.minLength!).toBeGreaterThan(sv.minLength!);
    expect(sv.maxLength!).toBeGreaterThan(seed.maxLength!);
  });

  it("4 种格式的 tone 各不相同", () => {
    expect(dept.getConfig("article").agentProfile.writerConstraints.tone).toBe("professional");
    expect(dept.getConfig("seed").agentProfile.writerConstraints.tone).toBe("casual");
    expect(dept.getConfig("short-video").agentProfile.writerConstraints.tone).toBe("emotional");
    expect(dept.getConfig("newsletter").agentProfile.writerConstraints.tone).toBe("storytelling");
  });
});
