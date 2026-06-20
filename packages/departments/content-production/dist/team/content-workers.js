/**
 * Content Production Department — 部门专属 Worker 定义
 *
 * 定义内容产出部注册到全局 WorkerRegistry 的 Worker。
 * 每个 Worker 对应一种 Agent 实现，带有内容部门特有的配置。
 *
 * 文件位置：packages/departments/content-production/src/team/content-workers.ts
 */
import { GenericAgent } from "@aicos/loop-engine";
// ============================================================
// Worker 注册工厂函数
// ============================================================
/**
 * 创建内容产出部的基础 Worker 注册列表
 *
 * 这些是部门启动时注册到 globalWorkerRegistry 的 Worker。
 * writer/critic 的 factory 为 null（由 LoopHarness.registerAgent 管理）。
 * researcher/ui-ux/reviewer 的 factory 接收 WorkerFactoryDeps 并返回 AgentExecutor。
 *
 * 设计原则：
 * - 此处定义「有哪些 Worker 可用」和它们的元数据
 * - factory 函数由本模块提供，使用 GenericAgent 实现
 * - writer/critic 不走此路径，由 CLI 层直接注册
 */
export function createContentWorkerRegistrations() {
    return [
        {
            id: "cp-writer-primary",
            role: "writer",
            agentType: "writer",
            defaultFactory: null,
            supportedContentTypes: ["article", "seed", "short-video", "newsletter"],
            description: "内容产出部主写手，支持全部4种内容格式",
        },
        {
            id: "cp-critic-primary",
            role: "critic",
            agentType: "critic",
            defaultFactory: null,
            supportedContentTypes: ["article", "seed", "short-video", "newsletter"],
            description: "内容产出部审核员，支持全格式质量评估",
        },
        {
            id: "cp-researcher-primary",
            role: "researcher",
            agentType: "researcher",
            defaultFactory: (deps) => new GenericAgent({
                systemPrompt: RESEARCHER_SYSTEM_PROMPT,
                llmProvider: deps.llmProvider,
            }),
            supportedContentTypes: ["article", "newsletter"],
            description: "内容调研员，负责外部信息搜集和数据验证",
        },
        {
            id: "cp-uiux-designer-primary",
            role: "uiux-designer",
            agentType: "ui-ux",
            defaultFactory: (deps) => new GenericAgent({
                systemPrompt: UIUX_DESIGNER_SYSTEM_PROMPT,
                llmProvider: deps.llmProvider,
            }),
            supportedContentTypes: ["seed", "short-video"],
            description: "视觉设计师，负责卡片/封面/分镜脚本设计",
        },
        {
            id: "cp-reviewer-primary",
            role: "reviewer",
            agentType: "reviewer",
            defaultFactory: (deps) => new GenericAgent({
                systemPrompt: REVIEWER_SYSTEM_PROMPT,
                llmProvider: deps.llmProvider,
            }),
            supportedContentTypes: ["article", "newsletter"],
            description: "最终审查员，Premium 内容的质量把关",
        },
    ];
}
// ============================================================
// Worker 专属 System Prompt
// ============================================================
/** 调研员系统提示 */
const RESEARCHER_SYSTEM_PROMPT = `你是一名专业的技术资料研究员。你的任务是根据写作主题搜索和整理高质量的参考资料。

工作原则：
1. 使用搜索工具获取最新的技术资料
2. 从搜索结果中筛选最相关、最权威的来源
3. 将资料整理为结构化的摘要，包含关键观点和数据
4. 标注每条资料的来源和可信度
5. 避免过时信息，优先选择最近 1-2 年内的内容

输出格式：返回结构化的调研摘要，包含来源列表和综合分析。`;
/** 视觉设计师系统提示 */
const UIUX_DESIGNER_SYSTEM_PROMPT = `你是一名专注于内容视觉设计的专业 Agent。
你会收到当前任务描述和上游产物（如果有）。请直接输出高质量的专业产出。

你的职责是视觉设计：根据内容生成卡片/封面/分镜脚本设计建议，包含：
- 标题文案（主标题 + 副标题）
- 配色方案（主色、辅色、强调色，附带 HEX 值）
- 布局建议（图文比例、视觉层次）
- 图片方向（风格、色调、构图建议）

保持输出简洁、结构化，便于下游步骤使用。`;
/** 审查员系统提示 */
const REVIEWER_SYSTEM_PROMPT = `你是一名专注于内容最终审查的专业 Agent。
你会收到当前任务描述和上游产物（如果有）。请直接输出高质量的专业产出。

你的职责是最终审查：检查内容是否符合以下维度：
- 目标平台规范（字数、格式、标签要求）
- 品牌一致性（语气、风格、术语统一）
- 法律风险（版权、敏感词、合规性）
- 事实准确性（关键数据、引用来源）

输出格式：给出通过/修改意见，附具体修改建议。`;
/**
 * 将 Worker 注册到全局 Registry
 *
 * @param registry 目标 WorkerRegistry 实例
 */
export function registerContentWorkers(registry) {
    const workers = createContentWorkerRegistrations();
    for (const w of workers) {
        registry.register(w);
    }
}
