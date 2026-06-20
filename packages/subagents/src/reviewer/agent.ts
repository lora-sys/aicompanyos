// ReviewerAgent — 最终审查角色
// 职责：检查内容是否符合目标平台规范、品牌一致性、法律风险，给出通过/修改意见

import type { AgentExecutor, LLMProvider, PlanStep, StandardAgentContext, ToolRegistry } from "@aicos/loop-engine/types";
import type { ReviewerOutput, ReviewDimension, ReviewSuggestion } from "./types.js";

// 审查系统提示词
const REVIEWER_SYSTEM_PROMPT = `你是一名严格且专业的最终审查员。
你的职责是在内容发布前进行最终把关，从以下三个核心维度进行审查：

1. 平台规范合规性 (platformCompliance)
   - 内容格式是否符合目标平台要求（字数、排版、标签等）
   - 是否遵守平台内容政策（无违禁词、无敏感信息）
   - 评分标准：0-100，低于 70 为不通过

2. 品牌一致性 (brandConsistency)
   - 语气风格是否与品牌调性一致
   - 核心信息是否准确传达
   - 视觉描述（如有）是否与品牌视觉规范一致
   - 评分标准：0-100，低于 70 为不通过

3. 法律风险 (legalRisk)
   - 是否存在版权侵权风险（引用未标注、图片未授权等）
   - 是否存在虚假宣传或误导性表述
   - 是否涉及隐私泄露或个人信息违规
   - 评分标准：0-100，低于 60 为不通过（法律风险容忍度更低）

输出要求：
- 必须返回合法的 JSON 格式
- 每个维度必须有 name、score、passed、comment
- suggestions 数组中每项包含 dimension、priority、description、action
- reasoning 字段给出整体审查结论
- 任何维度不通过则整体 passed=false`;

export class ReviewerAgent implements AgentExecutor {
  static readonly AGENT_TYPE = "reviewer";
  static readonly SYSTEM_PROMPT = REVIEWER_SYSTEM_PROMPT;

  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    if (!llm) {
      throw new Error("ReviewerAgent 构造失败：llmProvider 参数不能为空");
    }
    this.llm = llm;
  }

  // 实现 AgentExecutor 接口
  async execute(params: {
    step: PlanStep;
    tools: ToolRegistry;
    context: StandardAgentContext;
    previousOutputs: Record<string, { content: string }>;
  }): Promise<{ content: string; role: string }> {
    const { step, context, previousOutputs } = params;

    // 收集上游产物作为审查上下文
    const upstreamParts: string[] = [];
    const deps = step.dependsOn ?? [];
    for (const depId of deps) {
      const dep = previousOutputs[depId];
      if (dep?.content) {
        upstreamParts.push(`## 上游产物 (${depId})\n${dep.content.slice(0, 3000)}`);
      }
    }

    // 构建审查 prompt
    const prompt = this.buildReviewPrompt(step, context, upstreamParts);

    // 调用 LLM 生成审查报告
    const response = await this.llm.chat([
      { role: "system", content: REVIEWER_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);

    // 解析并返回
    const reviewResult = this.parseReviewResponse(response);

    // 返回结构化审查报告文本
    const content = this.formatReviewReport(reviewResult);
    return { content, role: "reviewer" };
  }

  // 构建审查提示词
  private buildReviewPrompt(
    step: PlanStep,
    context: StandardAgentContext,
    upstreamParts: string[]
  ): string {
    const parts: string[] = [];

    parts.push(`## 审查任务`);
    parts.push(`任务描述: ${step.description}`);
    parts.push(`原始需求: ${context.taskInput}`);

    if (context.interrogationResults && Object.keys(context.interrogationResults).length > 0) {
      parts.push(`\n## 用户补充信息`);
      for (const [key, value] of Object.entries(context.interrogationResults)) {
        parts.push(`- ${key}: ${value}`);
      }
    }

    if (upstreamParts.length > 0) {
      parts.push(`\n## 待审查内容`);
      parts.push(upstreamParts.join("\n\n"));
    }

    parts.push(`\n请从平台规范合规性、品牌一致性、法律风险三个维度进行审查，返回包含 score、passed、dimensions、suggestions、reasoning 的 JSON。`);

    return parts.join("\n");
  }

  // 解析审查响应
  private parseReviewResponse(response: string): ReviewerOutput {
    try {
      // 提取 JSON（处理可能的 markdown 包裹）
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("响应中未找到有效 JSON");
      }

      const parsed = JSON.parse(jsonMatch[0]) as Partial<ReviewerOutput>;

      const score = parsed.score ?? 60;
      const dimensions = parsed.dimensions ?? this.getDefaultDimensions();
      const suggestions = parsed.suggestions ?? [];

      // 任何维度不通过则整体不通过
      const anyDimensionFailed = dimensions.some((d) => !d.passed);

      return {
        score,
        passed: !anyDimensionFailed && score >= 70,
        dimensions,
        suggestions,
        reasoning:
          parsed.reasoning ??
          (score >= 70 ? "内容基本符合要求，有少量改进空间" : "内容未通过审查，需要修改"),
      };
    } catch (error) {
      console.error("解析审查响应失败:", error);
      // 返回安全的默认值（不通过）
      return {
        score: 50,
        passed: false,
        dimensions: this.getDefaultDimensions(),
        suggestions: [
          {
            dimension: "general",
            priority: "high",
            description: "无法解析审查结果",
            action: "请手动检查内容或重试审查",
          },
        ],
        reasoning: "LLM 响应解析失败，默认判定为不通过。",
      };
    }
  }

  // 默认维度评分
  private getDefaultDimensions(): ReviewDimension[] {
    return [
      { name: "platformCompliance", score: 50, passed: false, comment: "无法评估平台规范合规性" },
      { name: "brandConsistency", score: 50, passed: false, comment: "无法评估品牌一致性" },
      { name: "legalRisk", score: 50, passed: false, comment: "无法评估法律风险" },
    ];
  }

  // 格式化审查报告为可读文本
  private formatReviewReport(result: ReviewerOutput): string {
    const lines: string[] = [];
    const status = result.passed ? "✅ 通过" : "❌ 未通过";

    lines.push(`# 审查报告 ${status}`);
    lines.push(``);
    lines.push(`**总体评分**: ${result.score}/100`);
    lines.push(`**审查结论**: ${status}`);
    lines.push(``);

    lines.push(`## 维度评分`);
    for (const dim of result.dimensions) {
      const dimStatus = dim.passed ? "✅" : "❌";
      lines.push(`- **${dim.name}**: ${dim.score}/100 ${dimStatus} — ${dim.comment}`);
    }

    if (result.suggestions.length > 0) {
      lines.push(``);
      lines.push(`## 修改建议`);
      for (const s of result.suggestions) {
        const priorityLabel = { high: "🔴", medium: "🟡", low: "🟢" }[s.priority] ?? "⚪";
        lines.push(`- ${priorityLabel} **[${s.dimension}]** ${s.description}`);
        lines.push(`  → ${s.action}`);
      }
    }

    lines.push(``);
    lines.push(`## 综合意见`);
    lines.push(result.reasoning);

    return lines.join("\n");
  }
}
