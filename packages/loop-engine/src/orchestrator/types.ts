// 单步执行结果
export interface StepExecutionResult {
  stepId: string;
  agentType: string;
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

// 编排器配置
export interface OrchestratorConfig {
  maxConcurrentSteps: number; // 最大并行步数，MVP=1（串行）
  timeoutPerStep: number; // 每步超时 ms
}

// Agent 执行器接口
// #2.4 类型安全改进：使用 StandardAgentContext 替代 Record<string,unknown>
// 消除所有 Agent 中的 unchecked as cast
export interface StandardAgentContext {
  taskId: string;
  taskInput: string;
  interrogationResults?: Record<string, string>;
  selfExperience?: {
    lessons?: string[];
    content?: string;
    pattern?: string;
    type?: "success" | "learning";
  };
  designMDX?: string;
  userPreferences?: Record<string, string>;
  uiuxGuidance?: unknown;
  // === Loop Engineering: 扩展字段（供 LoopHarness 注入 Critic 反馈等）===
  extensions?: Record<string, unknown>;
}

export interface AgentExecutor {
  execute(params: {
    step: import("../types.js").PlanStep;
    tools: import("../tool-registry/registry.js").ToolRegistry;
    context: StandardAgentContext;
    previousOutputs: Record<string, { content: string }>;
  }): Promise<unknown>;
}

// 注入给 Agent 的上下文（占位接口，后续注入具体实现）
export interface EvidenceChainRef {
  readonly id: string;
  append(entry: unknown): Promise<void>;
}

// 注入给 Agent 的上下文（占位接口，后续注入具体实现）
export interface MemoryManagerRef {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
}

// 注入给 Agent 的上下文
export interface OrchestratorAgentContext {
  taskId: string;
  evidenceChain: EvidenceChainRef; // 引用，不持有
  memoryManager: MemoryManagerRef;
  designMDX?: string;
  userPreferences?: Record<string, string>;
}
