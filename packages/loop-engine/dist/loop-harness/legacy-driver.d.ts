/**
 * LegacyInnerLoopDriver — 基于 LoopModule 的 Inner Loop 实现
 *
 * 将现有 LoopModule 适配为 IInnerLoopEngine 接口。
 * 这是向后兼容的 driver，使用手搓 Writer→Critic 循环。
 */
import type { IGeneratorAgent, IEvaluatorAgent } from "../loop-module/index.js";
import type { PlanStep } from "../types.js";
import type { IInnerLoopEngine, InnerLoopConfig, InnerLoopResult } from "./inner-loop-types.js";
export interface LegacyDriverDeps {
    writerFactory: (ctx: {
        taskId: string;
        taskInput: string;
        tools: import("../tool-registry/registry.js").ToolRegistry;
        llmProvider: import("../interrogate/types.js").LLMProvider;
    }) => IGeneratorAgent<PlanStep, unknown>;
    criticFactory: (ctx: {
        taskId: string;
        taskInput: string;
        tools: import("../tool-registry/registry.js").ToolRegistry;
        llmProvider: import("../interrogate/types.js").LLMProvider;
    }) => IEvaluatorAgent;
    toolRegistry: import("../tool-registry/registry.js").ToolRegistry;
    llmProvider: import("../interrogate/types.js").LLMProvider;
}
export declare class LegacyInnerLoopDriver implements IInnerLoopEngine {
    private deps;
    private config;
    private loopModule;
    constructor(deps: LegacyDriverDeps, config: InnerLoopConfig);
    run(step: PlanStep, taskInput: string): Promise<InnerLoopResult>;
    setEventForwarder(): void;
    private getOrCreateLoopModule;
    private convertResult;
}
//# sourceMappingURL=legacy-driver.d.ts.map