import { describe, it, expect } from "vitest";
import {
  DEFAULT_WRITING_CRITERIA,
  formatCriteriaForEvaluator,
  formatCriteriaForGenerator,
  type GradingCriteria,
  type GradingResult,
  type GradingDimension,
} from "../src/loop-module/grading-criteria.js";

// ============================================================
// 辅助函数：模拟 GradingResult 的计算逻辑
// ============================================================

/**
 * 根据 GradingCriteria 和各维度原始分数计算 GradingResult
 * 模拟 Evaluator 的评分计算过程
 */
function calculateGradingResult(
  criteria: GradingCriteria,
  rawScores: Record<string, number>,
  comments: Record<string, string> = {},
  round: number = 1
): GradingResult {
  const dimensionScores = criteria.dimensions.map((dim) => {
    const rawScore = rawScores[dim.id] ?? 0;
    const weightedScore = (rawScore / dim.maxScore) * dim.weight * 100;
    return {
      dimensionId: dim.id,
      dimensionName: dim.name,
      rawScore,
      maxScore: dim.maxScore,
      weightedScore: Math.round(weightedScore * 100) / 100,
      comment: comments[dim.id] ?? "",
    };
  });

  // 加权总分 = 各维度加权分数之和
  const weightedScore = dimensionScores.reduce((sum, d) => sum + d.weightedScore, 0);

  // 总分（简化为加权总分，实际可能使用不同计算方式）
  const totalScore = Math.round(weightedScore * 100) / 100;

  return {
    totalScore,
    weightedScore,
    passed: totalScore >= criteria.passThreshold,
    excellent: totalScore >= criteria.excellenceThreshold,
    dimensionScores,
    reasoning: "模拟评估结果",
    suggestions: [],
    round,
  };
}

// ============================================================
// 测试套件
// ============================================================

describe("GradingCriteria", () => {
  // ----------------------------------------------------------
  // 1. DEFAULT_WRITING_CRITERIA 结构验证
  // ----------------------------------------------------------
  describe("DEFAULT_WRITING_CRITERIA 结构", () => {
    it("应包含 5 个评估维度", () => {
      expect(DEFAULT_WRITING_CRITERIA.dimensions).toHaveLength(5);
    });

    it("所有维度权重之和应为 1.0", () => {
      const totalWeight = DEFAULT_WRITING_CRITERIA.dimensions.reduce(
        (sum, dim) => sum + dim.weight,
        0
      );
      expect(totalWeight).toBeCloseTo(1.0, 10); // 允许极小浮点误差
    });

    it("应包含正确的维度 ID", () => {
      const ids = DEFAULT_WRITING_CRITERIA.dimensions.map((d) => d.id);
      expect(ids).toContain("topic_accuracy");
      expect(ids).toContain("technical_depth");
      expect(ids).toContain("code_quality");
      expect(ids).toContain("readability");
      expect(ids).toContain("originality");
    });
  });

  // ----------------------------------------------------------
  // 2. 权重值精确验证
  // ----------------------------------------------------------
  describe("权重验证", () => {
    it("topicAccuracy 权重应为 0.25", () => {
      const dim = DEFAULT_WRITING_CRITERIA.dimensions.find(
        (d) => d.id === "topic_accuracy"
      );
      expect(dim?.weight).toBe(0.25);
    });

    it("technicalDepth 权重应为 0.25", () => {
      const dim = DEFAULT_WRITING_CRITERIA.dimensions.find(
        (d) => d.id === "technical_depth"
      );
      expect(dim?.weight).toBe(0.25);
    });

    it("codeQuality 权重应为 0.20", () => {
      const dim = DEFAULT_WRITING_CRITERIA.dimensions.find(
        (d) => d.id === "code_quality"
      );
      expect(dim?.weight).toBe(0.2);
    });

    it("readability 权重应为 0.15", () => {
      const dim = DEFAULT_WRITING_CRITERIA.dimensions.find(
        (d) => d.id === "readability"
      );
      expect(dim?.weight).toBe(0.15);
    });

    it("originality 权重应为 0.15", () => {
      const dim = DEFAULT_WRITING_CRITERIA.dimensions.find(
        (d) => d.id === "originality"
      );
      expect(dim?.weight).toBe(0.15);
    });
  });

  // ----------------------------------------------------------
  // 3. 阈值验证
  // ----------------------------------------------------------
  describe("passThreshold 和 excellenceThreshold", () => {
    it("通过阈值应为 75", () => {
      expect(DEFAULT_WRITING_CRITERIA.passThreshold).toBe(75);
    });

    it("优秀阈值应为 90", () => {
      expect(DEFAULT_WRITING_CRITERIA.excellenceThreshold).toBe(90);
    });

    it("优秀阈值应大于通过阈值", () => {
      expect(DEFAULT_WRITING_CRITERIA.excellenceThreshold).toBeGreaterThan(
        DEFAULT_WRITING_CRITERIA.passThreshold
      );
    });

    it("阈值应在合理范围内 (0-100)", () => {
      expect(DEFAULT_WRITING_CRITERIA.passThreshold).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_WRITING_CRITERIA.passThreshold).toBeLessThanOrEqual(100);
      expect(DEFAULT_WRITING_CRITERIA.excellenceThreshold).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_WRITING_CRITERIA.excellenceThreshold).toBeLessThanOrEqual(100);
    });
  });

  // ----------------------------------------------------------
  // 4. formatCriteriaForEvaluator 测试
  // ----------------------------------------------------------
  describe("formatCriteriaForEvaluator", () => {
    it("应包含标准名称和版本号", () => {
      const prompt = formatCriteriaForEvaluator(DEFAULT_WRITING_CRITERIA);
      expect(prompt).toContain(DEFAULT_WRITING_CRITERIA.name);
      expect(prompt).toContain(DEFAULT_WRITING_CRITERIA.version);
    });

    it("应包含所有维度名称", () => {
      const prompt = formatCriteriaForEvaluator(DEFAULT_WRITING_CRITERIA);
      for (const dim of DEFAULT_WRITING_CRITERIA.dimensions) {
        expect(prompt).toContain(dim.name);
      }
    });

    it("应包含评分范围信息（通过线、优秀线）", () => {
      const prompt = formatCriteriaForEvaluator(DEFAULT_WRITING_CRITERIA);
      expect(prompt).toContain(`>= ${DEFAULT_WRITING_CRITERIA.passThreshold}`);
      expect(prompt).toContain(`>= ${DEFAULT_WRITING_CRITERIA.excellenceThreshold}`);
    });

    it("应包含每个维度的权重信息", () => {
      const prompt = formatCriteriaForEvaluator(DEFAULT_WRITING_CRITERIA);
      for (const dim of DEFAULT_WRITING_CRITERIA.dimensions) {
        // 检查是否包含权重百分比，如 "25%", "20%" 等
        expect(prompt).toContain(`${(dim.weight * 100).toFixed(0)}%`);
      }
    });

    it("应包含维度的 ID 标识符", () => {
      const prompt = formatCriteriaForEvaluator(DEFAULT_WRITING_CRITERIA);
      for (const dim of DEFAULT_WRITING_CRITERIA.dimensions) {
        expect(prompt).toContain(`ID: ${dim.id}`);
      }
    });

    it("应包含输出格式要求（JSON 格式说明）", () => {
      const prompt = formatCriteriaForEvaluator(DEFAULT_WRITING_CRITERIA);
      expect(prompt).toContain("JSON");
      expect(prompt).toContain("totalScore");
      expect(prompt).toContain("dimensionScores");
      expect(prompt).toContain("suggestions");
    });

    it("应包含 few-shot 示例（对于有 examples 的维度）", () => {
      const prompt = formatCriteriaForEvaluator(DEFAULT_WRITING_CRITERIA);
      // topic_accuracy 有 examples
      expect(prompt).toContain("参考样例");
      // originality 也有 examples
      expect(prompt).toContain("参考样例");
    });
  });

  // ----------------------------------------------------------
  // 5. formatCriteriaForGenerator 测试
  // ----------------------------------------------------------
  describe("formatCriteriaForGenerator", () => {
    it("应包含优化指引标题", () => {
      const prompt = formatCriteriaForGenerator(DEFAULT_WRITING_CRITERIA);
      expect(prompt).toContain("写作质量标准");
    });

    it("应包含所有维度的优化指引（而非评分规则）", () => {
      const prompt = formatCriteriaForGenerator(DEFAULT_WRITING_CRITERIA);
      for (const dim of DEFAULT_WRITING_CRITERIA.dimensions) {
        // 包含维度名称
        expect(prompt).toContain(dim.name);
        // 包含该维度的 guidance 内容
        expect(prompt).toContain(dim.guidance);
      }
    });

    it("不应包含评分标准的详细规则（如 18-20 分档）", () => {
      const prompt = formatCriteriaForGenerator(DEFAULT_WRITING_CRITERIA);
      // Generator prompt 不应包含 Evaluator 的评分标准
      // 检查某个具体的评分档位不存在
      expect(prompt).not.toContain("18-20:");
      expect(prompt).not.toContain("评分标准");
    });

    it("应包含目标分数指引（通过线和优秀线）", () => {
      const prompt = formatCriteriaForGenerator(DEFAULT_WRITING_CRITERIA);
      expect(prompt).toContain(`>= ${DEFAULT_WRITING_CRITERIA.passThreshold}`);
      expect(prompt).toContain(`>= ${DEFAULT_WRITING_CRITERIA.excellenceThreshold}`);
      expect(prompt).toContain("通过");
      expect(prompt).toContain("优秀");
    });

    it("应包含 Generator Guidance 标记", () => {
      const prompt = formatCriteriaForGenerator(DEFAULT_WRITING_CRITERIA);
      for (const dim of DEFAULT_WRITING_CRITERIA.dimensions) {
        expect(prompt).toContain("Generator Guidance");
      }
    });
  });

  // ----------------------------------------------------------
  // 6. GradingResult 计算测试
  // ----------------------------------------------------------
  describe("GradingResult 计算", () => {
    it("totalScore 应为各维度 rawScore 的加权和", () => {
      // 构造一个已知的测试用例
      const rawScores = {
        topic_accuracy: 16,     // 16/20 * 0.25 * 100 = 20
        technical_depth: 16,    // 16/20 * 0.25 * 100 = 20
        code_quality: 14,       // 14/20 * 0.2  * 100 = 14
        readability: 12,        // 12/20 * 0.15 * 100 = 9
        originality: 12,        // 12/20 * 0.15 * 100 = 9
      };
      // 预期总分: 20 + 20 + 14 + 9 + 9 = 72

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);
      expect(result.totalScore).toBeCloseTo(72, 1);
    });

    it("passed 应在 totalScore >= passThreshold 时为 true", () => {
      // 刚好达到通过线: 75 分
      const rawScores = {
        topic_accuracy: 17,     // 17/20 * 0.25 * 100 = 21.25
        technical_depth: 17,    // 17/20 * 0.25 * 100 = 21.25
        code_quality: 15,       // 15/20 * 0.2  * 100 = 15
        readability: 13,        // 13/20 * 0.15 * 100 = 9.75
        originality: 13,        // 13/20 * 0.15 * 100 = 9.75
      };
      // 总分约: 77

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);
      expect(result.passed).toBe(true);
    });

    it("passed 应在 totalScore < passThreshold 时为 false", () => {
      // 明显低于通过线
      const rawScores = {
        topic_accuracy: 10,
        technical_depth: 10,
        code_quality: 8,
        readability: 8,
        originality: 8,
      };

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);
      expect(result.passed).toBe(false);
    });

    it("excellent 应在 totalScore >= excellenceThreshold 时为 true", () => {
      // 高分场景
      const rawScores = {
        topic_accuracy: 19,
        technical_depth: 19,
        code_quality: 18,
        readability: 17,
        originality: 17,
      };

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);
      expect(result.excellent).toBe(true);
    });

    it("excellent 应在 totalScore < excellenceThreshold 时为 false", () => {
      // 中等分数
      const rawScores = {
        topic_accuracy: 14,
        technical_depth: 14,
        code_quality: 12,
        readability: 11,
        originality: 11,
      };

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);
      expect(result.excellent).toBe(false);
    });

    it("weightedScore 应正确反映每个维度的贡献", () => {
      const rawScores = {
        topic_accuracy: 20,  // 满分: 20/20 * 0.25 * 100 = 25
        technical_depth: 0,  // 零分: 0
        code_quality: 0,
        readability: 0,
        originality: 0,
      };

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);
      // 只有 topic_accuracy 有分，其权重为 0.25，满分时 weightedScore 为 25
      const topicDim = result.dimensionScores.find(
        (d) => d.dimensionId === "topic_accuracy"
      );
      expect(topicDim?.weightedScore).toBeCloseTo(25, 1);
      expect(result.totalScore).toBeCloseTo(25, 1);
    });

    it("dimensionScores 应包含所有维度的详细信息", () => {
      const rawScores = {
        topic_accuracy: 15,
        technical_depth: 15,
        code_quality: 12,
        readability: 10,
        originality: 10,
      };

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);

      expect(result.dimensionScores).toHaveLength(5);
      for (const ds of result.dimensionScores) {
        expect(ds).toHaveProperty("dimensionId");
        expect(ds).toHaveProperty("dimensionName");
        expect(ds).toHaveProperty("rawScore");
        expect(ds).toHaveProperty("maxScore");
        expect(ds).toHaveProperty("weightedScore");
        expect(ds).toHaveProperty("comment");
        expect(ds.maxScore).toBe(20); // 所有维度满分都是 20
      }
    });
  });

  // ----------------------------------------------------------
  // 7. 边界条件测试
  // ----------------------------------------------------------
  describe("边界条件", () => {
    it("全零分场景: totalScore=0, passed=false, excellent=false", () => {
      const rawScores = {
        topic_accuracy: 0,
        technical_depth: 0,
        code_quality: 0,
        readability: 0,
        originality: 0,
      };

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);

      expect(result.totalScore).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.excellent).toBe(false);
    });

    it("全满分场景: totalScore=100, passed=true, excellent=true", () => {
      const rawScores = {
        topic_accuracy: 20,
        technical_depth: 20,
        code_quality: 20,
        readability: 20,
        originality: 20,
      };

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);

      expect(result.totalScore).toBeCloseTo(100, 1);
      expect(result.passed).toBe(true);
      expect(result.excellent).toBe(true);
    });

    it("刚好通过线边界: totalScore ≈ 75 时 passed=true", () => {
      // 精心构造一个接近 75 分的场景
      const rawScores = {
        topic_accuracy: 16,     // 16/20 * 0.25 * 100 = 20
        technical_depth: 16,    // 16/20 * 0.25 * 100 = 20
        code_quality: 15,       // 15/20 * 0.2  * 100 = 15
        readability: 13,        // 13/20 * 0.15 * 100 = 9.75
        originality: 14,        // 14/20 * 0.15 * 100 = 10.5
      };
      // 总分: 20 + 20 + 15 + 9.75 + 10.5 = 75.25

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);

      expect(result.totalScore).toBeGreaterThanOrEqual(75);
      expect(result.passed).toBe(true);
      expect(result.excellent).toBe(false); // 未达优秀线
    });

    it("刚好低于通过线: totalScore 略小于 75 时 passed=false", () => {
      const rawScores = {
        topic_accuracy: 15,     // 15/20 * 0.25 * 100 = 18.75
        technical_depth: 15,    // 15/20 * 0.25 * 100 = 18.75
        code_quality: 14,       // 14/20 * 0.2  * 100 = 14
        readability: 12,        // 12/20 * 0.15 * 100 = 9
        originality: 13,        // 13/20 * 0.15 * 100 = 9.75
      };
      // 总分: 18.75 + 18.75 + 14 + 9 + 9.75 = 70.25

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);

      expect(result.totalScore).toBeLessThan(75);
      expect(result.passed).toBe(false);
    });

    it("刚好优秀线边界: totalScore ≈ 90 时 excellent=true", () => {
      const rawScores = {
        topic_accuracy: 19,     // 19/20 * 0.25 * 100 = 23.75
        technical_depth: 19,    // 19/20 * 0.25 * 100 = 23.75
        code_quality: 18,       // 18/20 * 0.2  * 100 = 18
        readability: 17,        // 17/20 * 0.15 * 100 = 12.75
        originality: 17,        // 17/20 * 0.15 * 100 = 12.75
      };
      // 总分: 23.75 + 23.75 + 18 + 12.75 + 12.75 = 91

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);

      expect(result.totalScore).toBeGreaterThanOrEqual(90);
      expect(result.excellent).toBe(true);
      expect(result.passed).toBe(true); // 优秀必然通过
    });

    it("刚好低于优秀线: totalScore 略小于 90 时 excellent=false 但 passed=true", () => {
      const rawScores = {
        topic_accuracy: 18,     // 18/20 * 0.25 * 100 = 22.5
        technical_depth: 17,    // 17/20 * 0.25 * 100 = 21.25
        code_quality: 17,       // 17/20 * 0.2  * 100 = 17
        readability: 16,        // 16/20 * 0.15 * 100 = 12
        originality: 16,        // 16/20 * 0.15 * 100 = 12
      };
      // 总分: 22.5 + 21.25 + 17 + 12 + 12 = 84.75

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);

      expect(result.totalScore).toBeLessThan(90);
      expect(result.excellent).toBe(false);
      expect(result.passed).toBe(true); // 通过但未优秀
    });

    it("单维度极端高分不影响其他维度判断", () => {
      // 只有一个维度满分，其他为零
      const rawScores = {
        topic_accuracy: 20,  // 满分
        technical_depth: 0,
        code_quality: 0,
        readability: 0,
        originality: 0,
      };

      const result = calculateGradingResult(DEFAULT_WRITING_CRITERIA, rawScores);

      // topic_accuracy 贡献 25 分，未达通过线
      expect(result.totalScore).toBeCloseTo(25, 1);
      expect(result.passed).toBe(false);

      // 检查其他维度确实为零分
      const zeroDims = result.dimensionScores.filter(
        (d) => d.dimensionId !== "topic_accuracy"
      );
      for (const dim of zeroDims) {
        expect(dim.rawScore).toBe(0);
        expect(dim.weightedScore).toBe(0);
      }
    });
  });
});
