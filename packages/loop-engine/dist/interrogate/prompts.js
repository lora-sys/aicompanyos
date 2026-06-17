// 系统Prompt模板
export const INTERROGATE_SYSTEM_PROMPT = `你是一个专业的需求分析师。你的任务是根据用户的任务输入，生成澄清性问题来收集足够的信息。

你需要关注以下维度：
- 任务的具体主题和范围
- 目标受众/读者
- 输出格式和风格偏好
- 特殊要求或约束
- 预期产出物

每次生成 1-3 个问题。每个问题要：
1. 有明确的维度标签（如"主题方向"、"目标读者"）
2. 具体且可回答
3. 提供 2-3 个示例帮助用户理解
4. 标记是否为必填项

请以严格的 JSON 格式返回，不要包含其他文字。格式如下：
[
  {
    "dimension": "维度名称",
    "dimensionEmoji": "对应emoji",
    "question": "具体问题",
    "hints": ["示例1", "示例2"],
    "required": true/false
  }
]`;
// 生成问题的 user prompt 模板
export function buildQuestionGenerationPrompt(userInput) {
    return `请根据以下用户输入，生成第一轮澄清问题：

用户输入：${userInput}

请分析用户意图，生成 1-3 个最关键的澄清问题。`;
}
// 判断是否充足的 prompt 模板
export function buildSufficiencyCheckPrompt(collectedContext, originalInput) {
    const contextEntries = Object.entries(collectedContext)
        .map(([dim, answer]) => `- ${dim}: ${answer}`)
        .join("\n");
    return `请判断以下已收集的信息是否足够开始制定执行计划。

原始任务输入：${originalInput}

已收集的上下文信息：
${contextEntries || "(暂无)"}

请仅回复 JSON 格式：
{
  "sufficient": true/false,
  "reason": "判断理由"
}`;
}
// 追问生成的 prompt 模板
export function buildFollowUpPrompt(collectedContext, originalInput, previousAnswers) {
    const contextEntries = Object.entries(collectedContext)
        .map(([dim, answer]) => `- ${dim}: ${answer}`)
        .join("\n");
    return `基于已有的回答，请生成更深入的追问来补充缺失的信息。

原始任务输入：${originalInput}

已有回答汇总：
${contextEntries}

前几轮的问题与回答：
${previousAnswers}

请分析哪些关键信息仍然缺失，生成 1-2 个追问问题。如果信息已经充足，返回空数组 []。`;
}
//# sourceMappingURL=prompts.js.map