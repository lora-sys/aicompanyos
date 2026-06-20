import { ToolRegistry, LoopHarness, type LLMProvider } from "@aicos/loop-engine";
/** Harness 工厂创建结果 */
export interface HarnessFactoryResult {
    /** 工具注册表 */
    toolRegistry: ToolRegistry;
    /** Loop Harness 实例 */
    loopHarness: LoopHarness;
    /** 是否启用了 pi-agent-core 引擎 */
    usePiCore: boolean;
}
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
export declare function createHarness(deps: {
    llmProvider: LLMProvider;
    piAiModel?: import("@earendil-works/pi-ai").Model<"openai-completions">;
    /** 迭代开始回调 */
    onIterationStart?: (iteration: number, stepId: string) => void;
    /** Writer 产出回调 */
    onWriterOutput?: (content: string, iteration: number) => void;
    /** Critic 评估回调 */
    onCriticResult?: (score: number, passed: boolean, suggestions: string[], iteration: number) => void;
    /** 目标进度回调 */
    onGoalProgress?: (verified: number, total: number, stopCondition: string) => void;
    /** 单步完成回调 */
    onStepComplete?: (stepId: string, score: number, passed: boolean) => void;
    /** pi-agent-core 事件转发回调 */
    piEventForwarder?: (event: any) => void;
}): HarnessFactoryResult;
//# sourceMappingURL=harness-factory.d.ts.map