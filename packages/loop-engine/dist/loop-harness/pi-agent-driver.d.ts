/**
 * PiAgentInnerLoopDriver — 基于 pi-agent-core 的 Inner Loop 实现
 *
 * 将 PiAgentLoopEngine 适配为 IInnerLoopEngine 接口。
 * 使用 pi-agent-core 的 agentLoop 驱动 Writer→Critic 迭代。
 */
import type { IGeneratorAgent, IEvaluatorAgent } from "../loop-module/index.js";
import type { PlanStep } from "../types.js";
import type { IInnerLoopEngine, InnerLoopConfig, InnerLoopResult } from "./inner-loop-types.js";
import type { Model } from "@earendil-works/pi-ai";
export interface PiAgentDriverDeps {
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
    /** pi-ai Model（启用 agentLoop 驱动时需要） */
    model?: Model<any>;
}
export declare class PiAgentInnerLoopDriver implements IInnerLoopEngine {
    private deps;
    private config;
    private engine;
    constructor(deps: PiAgentDriverDeps, config: InnerLoopConfig);
    run(step: PlanStep, taskInput: string): Promise<InnerLoopResult>;
    setEventForwarder(forwarder: (event: unknown) => void): void;
    private _pendingForwarder;
    private getOrCreateEngine;
    private convertResult;
}
//# sourceMappingURL=pi-agent-driver.d.ts.map