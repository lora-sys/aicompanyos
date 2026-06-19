import { z } from "zod";
import { createLLMParser, FallbackStrategy, } from "../utils/llm-structured-output.js";
// 生成唯一 ID
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
// Zod Schema: 原始 LLM 返回的计划结构（宽松，允许缺失字段）
// 支持两种格式：{ id, steps: [...] } 或 [{ stepId, ... }]（纯数组）
const rawPlanStepSchema = z.object({
    stepId: z.string().optional(),
    agentType: z.string().optional(),
    description: z.string().optional(),
    expectedOutput: z.string().optional(),
    toolsNeeded: z.array(z.unknown()).optional(),
});
const rawPlanSchema = z.union([
    z.object({
        id: z.string().optional(),
        steps: z.array(rawPlanStepSchema).optional().default([]),
    }),
    // LLM 有时返回纯步骤数组而非包装对象
    z.array(rawPlanStepSchema),
]);
// 解析器实例：计划解析失败应抛异常（计划是核心流程，不能静默降级）
const planParser = createLLMParser({
    schema: rawPlanSchema,
    fallback: { id: generateId(), steps: [] },
    strategy: FallbackStrategy.THROW,
    logPrefix: "PlanEngine.callLLMForPlan",
});
// System Prompt：执行规划师角色
const PLAN_SYSTEM_PROMPT = `你是一位专业的执行规划师。你的任务是根据用户需求和已收集的上下文信息，生成精简高效的执行计划。

你必须严格返回 JSON 格式的 ExecutionPlan，包含以下结构：
{
  "id": "计划ID",
  "steps": [
    {
      "stepId": "步骤ID",
      "agentType": "writer|critic|ui-ux",
      "description": "步骤描述",
      "expectedOutput": "预期产出",
      "toolsNeeded": ["工具1", "工具2"]
    }
  ]
}

**★ 主题保真原则（最高优先级 — 违反将导致产出不可用）：**
- 每个步骤的 description 必须紧密围绕用户的原始任务展开
- 禁止在描述中引入与原始任务无关的技术领域、产品或概念
- 如果原始任务是"推荐 Cursor IDE"，description 就不能写"AI Agent 架构设计"
- Writer 步骤的 description 必须包含原始任务的核心关键词
- 你生成的计划是 Writer 的执行指令，如果计划偏题，Writer 的产出必然偏题

**步骤数量约束：**
- 总步骤数严格控制在 4-6 步以内（含所有 agent 类型）
- 对于内容创作类任务（博客、文档、文章），建议采用「分段写作+中间审核」模式：
  writer(大纲/引言) → critic(初稿审核) → writer(正文核心) → critic(终稿审核) → writer(总结收尾)
- 宁可合并也不要拆分过多步骤

**Writer 步骤差异化要求：**
- 如果计划包含多个 writer 步骤，每个 writer 的 description 必须明确区分职责分工
- 示例差异化的描述："撰写引言和架构概览" vs "编写核心代码示例和实现细节" vs "撰写总结、最佳实践和实战建议"
- 禁止出现多个 description 相同或高度相似的 writer 步骤

**Critic 步骤位置要求：**
- critic 审查步骤应在第一个 writer 产出后立即插入（作为第 2 或第 3 步）
- 如果有多个 writer 阶段，每个阶段后都应有 critic 审核
- 不要将 critic 放在所有 writer 步骤的最后面——早审查早修正

**UI-UX 步骤位置要求：**
- 如果需要 ui-ux 设计验证步骤，应放在计划的最后一步作为最终验证

规则：
1. 每个步骤必须包含 agentType、description、expectedOutput、toolsNeeded 四个字段
2. agentType 只能是 writer、critic 或 ui-ux
3. 计划至少包含一个步骤
4. 步骤之间要有逻辑顺序关系
5. 只返回 JSON，不要包含其他文字`;
/**
 * 规划引擎 - 根据拷问结果生成执行计划
 */
export class PlanEngine {
    llmProvider;
    constructor(llmProvider) {
        this.llmProvider = llmProvider;
    }
    /**
     * 根据拷问结果生成执行计划
     */
    async generatePlan(input) {
        const plan = await this.callLLMForPlan(input);
        // 验证计划结构
        if (!plan.steps || plan.steps.length === 0) {
            throw new Error("生成的计划无效：至少需要包含一个步骤");
        }
        // 验证每个步骤的必要字段
        for (const step of plan.steps) {
            if (!step.stepId || !step.agentType || !step.description || !step.expectedOutput || !Array.isArray(step.toolsNeeded)) {
                throw new Error(`步骤 ${step.stepId ?? "(未知)"} 缺少必要字段`);
            }
        }
        // 后处理：去重合并连续相同 agentType 的步骤
        plan.steps = this.deduplicateConsecutiveSteps(plan.steps);
        return { plan, reasoning: "" };
    }
    /**
     * 调用 LLM 生成 JSON 格式计划
     * 使用 LLMStructuredOutput 统一提取+验证
     */
    async callLLMForPlan(input) {
        // 构造上下文文本（拷问结果）
        const contextText = Object.entries(input.interrogationResults)
            .map(([dimension, answer]) => `[${dimension}] ${answer}`)
            .join("\n");
        const userPrompt = `## 原始任务
${input.taskInput}

## 已收集的上下文信息
${contextText || "（无额外上下文）"}

## 可用的 Agent 列表
${input.availableAgents.join(", ")}

## 可用的工具列表
${input.availableTools.join(", ")}

请根据以上信息，生成一个合理的执行计划。`;
        const response = await this.llmProvider.chat([
            { role: "system", content: PLAN_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
        ]);
        // 使用 LLMStructuredOutput 解析（THROW 模式：失败直接抛异常）
        const result = planParser.parse(response);
        if (!result.success) {
            throw new Error(result.error);
        }
        const parsed = result.data;
        // 标准化为步骤数组（兼容对象格式和纯数组格式）
        let rawSteps;
        if (Array.isArray(parsed)) {
            rawSteps = parsed;
        }
        else {
            rawSteps = parsed.steps ?? [];
        }
        // 补充默认值并规范化步骤
        return {
            id: parsed.id || generateId(),
            steps: rawSteps.map((item, index) => ({
                stepId: String(item.stepId ?? `step-${index + 1}`),
                agentType: item.agentType,
                description: String(item.description ?? ""),
                expectedOutput: String(item.expectedOutput ?? ""),
                toolsNeeded: Array.isArray(item.toolsNeeded)
                    ? item.toolsNeeded.map((t) => String(t))
                    : [],
            })),
            createdAt: new Date(),
        };
    }
    /**
     * 后处理：去重合并连续相同 agentType 的步骤
     * 将连续的、agentType 相同的步骤合并为单个步骤，合并 description 和 toolsNeeded
     */
    deduplicateConsecutiveSteps(steps) {
        if (steps.length <= 1)
            return steps;
        const deduped = [steps[0]];
        for (let i = 1; i < steps.length; i++) {
            const current = steps[i];
            const last = deduped[deduped.length - 1];
            if (current.agentType === last.agentType) {
                // 合并：拼接 description，合并工具列表（去重）
                last.description += "；" + current.description;
                const mergedTools = new Set([...last.toolsNeeded, ...current.toolsNeeded]);
                last.toolsNeeded = Array.from(mergedTools);
                // 保留更具体的 expectedOutput
                if (current.expectedOutput && !last.expectedOutput.includes(current.expectedOutput)) {
                    last.expectedOutput += " + " + current.expectedOutput;
                }
            }
            else {
                deduped.push(current);
            }
        }
        return deduped;
    }
}
//# sourceMappingURL=engine.js.map