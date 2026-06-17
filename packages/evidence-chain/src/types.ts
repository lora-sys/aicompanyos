// === Step Trace: 状态转换记录 ===
export interface StepTraceEntry {
  type: "step";
  traceId: string;
  timestamp: string; // ISO 8601
  previousState: string;
  nextState: string;
  triggerReason: string;
  triggeredBy: string; // 组件名称
  taskId: string;
  metadata?: Record<string, unknown>;
}

// === Decision Trace: LLM 决策记录 ===
export interface DecisionTraceEntry {
  type: "decision";
  traceId: string;
  timestamp: string;
  agentType: string; // writer/critic/ui-ux/evolution
  decisionPoint: string; // 决策点描述
  inputPrompt: string;
  outputReasoning?: string;
  finalChoice: string;
  confidence?: number; // 0-1
  alternatives?: Array<{ choice: string; reasoning: string }>;
  taskId: string;
  metadata?: Record<string, unknown>;
}

// === Tool Call Trace: 工具调用记录 ===
export interface ToolCallTraceEntry {
  type: "tool_call";
  traceId: string;
  timestamp: string;
  toolName: string;
  toolCategory: "local" | "mcp" | "skill";
  callerAgent: string; // 哪个 Agent 调用的
  inputParams: Record<string, unknown>;
  outputResult: unknown;
  success: boolean;
  errorMessage?: string;
  durationMs: number;
  mcpServerName?: string; // 如果是 MCP 工具
  taskId: string;
  metadata?: Record<string, unknown>;
}

// === Snapshot: 系统状态快照 ===
export interface SnapshotEntry {
  type: "snapshot";
  traceId: string;
  timestamp: string;
  snapshotType: "pre_execute" | "post_verify" | "pre_replan" | "post_evolution" | "custom";
  loopState: string;
  systemState: Record<string, unknown>; // 完整的可序列化状态
  taskId: string;
  metadata?: Record<string, unknown>;
}

// === Reasoning Trace: LLM 推理过程记录 ===
export interface ReasoningTraceEntry {
  type: "reasoning";
  traceId: string;
  timestamp: string;
  agentType: string;
  inputPrompt: string;
  reasoningProcess: string;    // LLM 的思考过程/中间步骤
  finalOutput: string;         // 最终输出摘要
  tokenUsage?: { prompt: number; completion: number };
  modelUsed?: string;
  taskId: string;
  metadata?: Record<string, unknown>;
}

// 联合类型
export type TraceEntry =
  | StepTraceEntry
  | DecisionTraceEntry
  | ToolCallTraceEntry
  | SnapshotEntry
  | ReasoningTraceEntry;

// Evidence Chain 元数据
export interface EvidenceChainMeta {
  chainId: string;
  taskId: string;
  taskInput: string;
  startedAt: string;
  endedAt?: string;
  totalEntries: number;
  entryCounts: {
    steps: number;
    decisions: number;
    toolCalls: number;
    snapshots: number;
    reasonings: number;
  };
}
