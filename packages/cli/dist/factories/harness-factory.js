// Harness 工厂：从 app.ts 抽取的 LoopHarness 组装逻辑
import { ToolRegistry, LoopHarness, DEFAULT_WRITING_CRITERIA, } from "@aicos/loop-engine";
/**
 * 创建 ToolRegistry 和 LoopHarness
 *
 * 从 app.ts 构造函数中提取的 Harness 组装逻辑：
 * 1. 创建 ToolRegistry 并注册本地工具
 * 2. 根据 pi-ai Model 可用性决定是否启用 pi-agent-core 引擎
 * 3. 构造 LoopHarness 并注入回调
 * 4. 设置默认评估标准
 *
 * @param deps - 依赖注入参数
 */
export function createHarness(deps) {
    // 初始化工具注册表
    const toolRegistry = new ToolRegistry();
    toolRegistry.registerLocalTools(deps.llmProvider);
    // 判断是否启用 pi-agent-core 引擎
    const usePiCore = deps.piAiModel !== undefined;
    // 构造 LoopHarness（★ v0.4.0: 默认启用 pi-agent-core 引擎 + 流式回调）
    const loopHarness = new LoopHarness(toolRegistry, deps.llmProvider, {
        usePiAgentCore: usePiCore,
        model: deps.piAiModel,
        onIterationStart: deps.onIterationStart,
        onWriterOutput: deps.onWriterOutput,
        onCriticResult: deps.onCriticResult,
        onGoalProgress: deps.onGoalProgress,
        onStepComplete: deps.onStepComplete,
    });
    // 设置默认评估标准
    loopHarness.setCriteria(DEFAULT_WRITING_CRITERIA);
    // ★ 连接 pi-agent-core 事件到流式内容区
    if (usePiCore && deps.piEventForwarder) {
        loopHarness.setPiEventForwarder(deps.piEventForwarder);
    }
    return { toolRegistry, loopHarness, usePiCore };
}
//# sourceMappingURL=harness-factory.js.map