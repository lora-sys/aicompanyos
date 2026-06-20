/**
 * 固定评估标准 (Grading Criteria)
 *
 * 设计原则（参考三 Agent 架构的最佳实践）：
 * 1. 标准在任务开始前定义，全程不变 — "焊死"
 * 2. Generator 和 Evaluator 共享同一套标准
 * 3. 每个维度有明确的评分规则和 few-shot 示例
 * 4. 标准本身可配置但运行时不可变
 *
 * 为什么需要固定标准？
 * - 避免 Evaluator 每次输出不同的评分维度
 * - 让 Generator 有明确的优化目标
 * - 让 Evolution Module 能追踪特定维度的改进趋势
 */
import { THRESHOLDS } from "../config/thresholds.js";
// ============================================================
// 默认标准：技术内容写作
// ============================================================
/**
 * 默认的技术内容写作评估标准
 *
 * 5 个维度，参考前端设计 harness 的 4 维度设计：
 * - Topic Accuracy → 对应 Design Quality（是否围绕主题）
 * - Technical Depth → 对应 Craft（技术执行质量）
 * - Code Quality → 对应 Craft 的子维度
 * - Readability → 对应 Functionality（用户能否理解）
 * - Originality → 对应 Originality（是否有独特见解）
 */
export const DEFAULT_WRITING_CRITERIA = {
    name: "Technical Writing Standard",
    version: "1.0.0",
    passThreshold: THRESHOLDS.EVALUATOR_PASS,
    excellenceThreshold: THRESHOLDS.EXCELLENCE_STOP,
    dimensions: [
        {
            id: "topic_accuracy",
            name: "Topic Accuracy",
            weight: 0.25,
            maxScore: 20,
            criteria: `**Topic Accuracy (主题准确性)** — 权重 25%
- 内容是否紧密围绕用户的原始任务主题？
- 是否存在 topic drift（偏题到其他技术领域）？
- 核心论点是否与任务要求直接相关？
- 代码示例的技术栈是否与任务匹配？

评分标准：
- 18-20: 完全聚焦主题，每个章节都直接服务于任务目标，无任何偏题
- 14-17: 基本聚焦，有少量边缘内容可能略微偏离
- 10-13: 存在明显偏题，部分章节与任务关系薄弱
- 6-9: 严重偏题，大部分内容与原始任务无关
- 0-5: 完全跑题`,
            guidance: `**[Generator Guidance - Topic Accuracy]**
- 在开始写作前，明确列出任务的 3-5 个核心关键词
- 每个章节写完后检查：这个内容是否直接服务于任务目标？
- 代码示例必须使用任务指定的技术栈
- 如果发现自己在写其他领域的内容，立即拉回主线`,
            examples: [
                {
                    description: "任务要求写 AI Agent 架构，文章完全聚焦于感知/决策/工具/记忆四大组件",
                    score: 19,
                    reason: "完美聚焦，每个章节都围绕 AI Agent 架构展开",
                },
                {
                    description: "任务要求写 AI Agent 架构，但花了大量篇幅讨论 RAG 和向量数据库",
                    score: 10,
                    reason: "严重偏题，RAG 虽然相关但不是文章主体",
                },
            ],
        },
        {
            id: "technical_depth",
            name: "Technical Depth",
            weight: 0.25,
            maxScore: 20,
            criteria: `**Technical Depth (技术深度)** — 权重 25%
- 技术分析是否超越了表面描述，触及了实现原理？
- 是否有独到的架构洞察或模式识别？
- 代码示例是否展示了真实的使用场景而非 Hello World？
- 是否讨论了 trade-off 和设计决策的理由？

评分标准：
- 18-20: 深入原理层面，有独特洞察，代码示例具有生产级质量
- 14-17: 有一定深度，涵盖了主要概念，代码示例实用
- 10-13: 停留在表面描述，缺乏深入分析
- 6-9: 非常浅显，类似入门教程水平
- 0-5: 无实质技术内容`,
            guidance: `**[Generator Guidance - Technical Depth]**
- 不要只说"是什么"，要解释"为什么"和"怎么做"
- 至少包含一个完整的、可运行的代码示例（>15 行）
- 讨论至少一个 design trade-off 及其选择理由
- 引用实际项目或框架的实现作为佐证`,
            examples: [
                {
                    description: "不仅介绍了 Agent 架构，还分析了不同消息传递模式的性能特征",
                    score: 18,
                    reason: "有深入的 trade-off 分析和生产级代码示例",
                },
                {
                    description: "只列举了 Agent 的组件名称，没有解释它们如何协作",
                    score: 8,
                    reason: "停留在名词解释层面，缺乏深度分析",
                },
            ],
        },
        {
            id: "code_quality",
            name: "Code Quality",
            weight: 0.2,
            maxScore: 20,
            criteria: `**Code Quality (代码质量)** — 权重 20%
- 代码语法正确，无明显的 bug 或逻辑错误
- 变量命名清晰，符合语言惯例
- 有适当的注释解释关键逻辑
- 类型使用正确（TypeScript 类型完整）
- 错误处理是否考虑周全？

评分标准：
- 18-20: 生产级代码质量，类型完整，错误处理完善
- 14-17: 代码正确且清晰，有小的不完美
- 10-13: 基本正确但有命名或结构问题
- 6-9: 存在明显的 bug 或反模式
- 0-5: 代码无法运行或有严重错误`,
            guidance: `**[Generator Guidance - Code Quality]**
- 使用 TypeScript 的类型系统，避免 any
- 遵循项目的代码风格约定
- 关键函数添加 JSDoc 注释
- 异步操作要有 error handling
- 代码提交前自检：能否直接复制粘贴运行？`,
        },
        {
            id: "readability",
            name: "Readability",
            weight: 0.15,
            maxScore: 20,
            criteria: `**Readability (可读性)** — 权重 15%
- 文章结构是否清晰？标题层级是否合理？
- 段落长度适中，过渡自然？
- 技术术语是否有适当解释？
- Markdown 格式是否规范？

评分标准：
- 18-20: 结构精良，像一本精心编辑的技术书
- 14-17: 结构清晰，阅读体验良好
- 10-13: 结构基本合理，部分地方不够流畅
- 6-9: 结构混乱，难以跟随作者思路
- 0-5: 格式混乱，无法正常阅读`,
            guidance: `**[Generator Guidance - Readability]**
- 使用 ## / ### / #### 明确的标题层级
- 每段不超过 4-5 行
- 技术术语首次出现时给出简短解释
- 使用表格对比多个选项
- 用引用块(>)突出关键结论`,
        },
        {
            id: "originality",
            name: "Originality",
            weight: 0.15,
            maxScore: 20,
            criteria: `**Originality (原创性)** — 权重 15%
- 是否有独特的观点或见解，而非复述官方文档？
- 代码示例是原创的还是从文档复制的？
- 是否有自己的实践总结或经验分享？
- 是否避免了"AI slop"模式（如泛泛而谈的 purple gradient 式废话）？

评分标准：
- 18-20: 高度原创，有明显个人/团队实践经验沉淀
- 14-17: 有一些原创元素，混合了通用知识
- 10-13: 大部分是已有知识的重组，少量个人观点
- 6-9: 基本是官方文档或博客的复述
- 0-5: 纯粹的 AI-generated 泛泛内容`,
            guidance: `**[Generator Guidance - Originality]**
- 加入"实战踩坑"或"经验教训"类的内容
- 不要只是罗列 API，要讲"我们为什么这样选"
- 代码示例要是自己写的，不是从文档 copy 的
- 如果引用他人观点，注明来源并加入自己的评价
- 避免使用过于通用的表达："在当今数字化时代..."`,
            examples: [
                {
                    description: "包含了作者在实际项目中遇到的消息丢失问题及解决方案",
                    score: 18,
                    reason: "有独特的实践经验，不是教科书式内容",
                },
                {
                    description: "完全是 ChatGPT 常见输出风格：'随着AI技术的飞速发展...'",
                    score: 5,
                    reason: "典型的 AI slop，无任何独特价值",
                },
            ],
        },
    ],
};
// ============================================================
// 工具函数
// ============================================================
/**
 * 将 GradingCriteria 格式化为 Evaluator Prompt 片段
 * 注入到 Critic/Evaluator 的 system prompt 中
 */
export function formatCriteriaForEvaluator(criteria) {
    const lines = [
        `═══ ${criteria.name} v${criteria.version} ═══`,
        ``,
        `你是一个严格的评估员。请严格按照以下 ${criteria.dimensions.length} 个维度对产出进行评分。`,
        ``,
        `【评分规则】`,
        `- 通过线: 加权平均分 >= ${criteria.passThreshold}`,
        `- 优秀线: 加权平均分 >= ${criteria.excellenceThreshold}`,
        `- 每个维度满分 ${criteria.dimensions[0]?.maxScore ?? 20} 分`,
        ``,
        `【评估维度】`,
    ];
    for (const dim of criteria.dimensions) {
        lines.push(``);
        lines.push(`--- ${dim.name} (权重 ${(dim.weight * 100).toFixed(0)}%, ID: ${dim.id}) ---`);
        lines.push(dim.criteria);
        if (dim.examples && dim.examples.length > 0) {
            lines.push(``);
            lines.push(`【参考样例】`);
            for (const ex of dim.examples) {
                lines.push(`  • "${ex.description.slice(0, 60)}..." → ${ex.score}/${dim.maxScore} (${ex.reason.slice(0, 40)}...)`);
            }
        }
    }
    lines.push(``);
    lines.push(`═══ 输出格式要求 ═══`);
    lines.push(`将评估结果严格包裹在 json markdown 代码块中：`);
    lines.push(`\`\`\`json`);
    lines.push(`{ "totalScore": 85, "dimensionScores": [{ "dimensionId": "topic_accuracy", "rawScore": 17, "comment": "..." }], "suggestions": [{ "dimensionId": "topic_accuracy", "severity": "minor", "description": "...", "suggestion": "..." }], "reasoning": "..." }`);
    lines.push(`\`\`\``);
    lines.push(`注意：必须使用 markdown code block 包裹，不要将 JSON 裸露在正文中。`);
    lines.push(`JSON 必须包含 totalScore、dimensionScores、suggestions、reasoning 字段。`);
    return lines.join("\n");
}
/**
 * 将 GradingCriteria 格式化为 Generator Prompt 片段
 * 注入到 Writer/Generator 的 system prompt 中
 */
export function formatCriteriaForGenerator(criteria) {
    const lines = [
        `═══ 写作质量标准 (你需要达到的目标) ═══`,
        ``,
        `你的产出将按以下 ${criteria.dimensions.length} 个维度被严格评估：`,
    ];
    for (const dim of criteria.dimensions) {
        lines.push(``);
        lines.push(`**${dim.name}** [${(dim.weight * 100).toFixed(0)}%]`);
        lines.push(dim.guidance);
    }
    lines.push(``);
    lines.push(`目标：加权平均分 >= ${criteria.passThreshold} (通过), >= ${criteria.excellenceThreshold} (优秀)`);
    return lines.join("\n");
}
//# sourceMappingURL=grading-criteria.js.map