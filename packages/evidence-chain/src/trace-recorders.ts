import { randomUUID } from "node:crypto";
import type {
  StepTraceEntry,
  DecisionTraceEntry,
  ToolCallTraceEntry,
  SnapshotEntry,
  ReasoningTraceEntry,
  VerificationTraceEntry,
} from "./types.js";

// === Step Trace Recorder: 状态转换记录 ===
export class StepTraceRecorder {
  record(params: {
    previousState: string;
    nextState: string;
    triggerReason: string;
    triggeredBy: string;
    taskId: string;
    metadata?: Record<string, unknown>;
  }): StepTraceEntry {
    return {
      type: "step",
      traceId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...params,
    };
  }
}

// === Decision Trace Recorder: LLM 决策记录 ===
export class DecisionTraceRecorder {
  record(params: {
    agentType: string;
    decisionPoint: string;
    inputPrompt: string;
    outputReasoning?: string;
    finalChoice: string;
    confidence?: number;
    alternatives?: Array<{ choice: string; reasoning: string }>;
    taskId: string;
  }): DecisionTraceEntry {
    return {
      type: "decision",
      traceId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...params,
    };
  }
}

// === Tool Call Trace Recorder: 工具调用记录 ===
export class ToolCallTraceRecorder {
  private pendingCalls = new Map<
    string,
    {
      toolName: string;
      toolCategory: "local" | "mcp" | "skill";
      callerAgent: string;
      inputParams: Record<string, unknown>;
      startTime: number;
      taskId: string;
    }
  >();

  startCall(
    toolName: string,
    toolCategory: "local" | "mcp" | "skill",
    callerAgent: string,
    inputParams: Record<string, unknown>,
    taskId: string,
  ): { traceId: string } {
    const traceId = randomUUID();
    this.pendingCalls.set(traceId, {
      toolName,
      toolCategory,
      callerAgent,
      inputParams,
      startTime: Date.now(),
      taskId,
    });
    return { traceId };
  }

  endCall(
    traceId: string,
    result: unknown,
    success: boolean,
    errorMessage?: string,
    mcpServerName?: string,
  ): ToolCallTraceEntry {
    const pending = this.pendingCalls.get(traceId);
    if (!pending) {
      throw new Error(`未找到 traceId 为 ${traceId} 的待完成工具调用`);
    }

    this.pendingCalls.delete(traceId);

    return {
      type: "tool_call",
      traceId,
      timestamp: new Date().toISOString(),
      toolName: pending.toolName,
      toolCategory: pending.toolCategory,
      callerAgent: pending.callerAgent,
      inputParams: pending.inputParams,
      outputResult: result,
      success,
      errorMessage,
      durationMs: Date.now() - pending.startTime,
      ...(mcpServerName ? { mcpServerName } : {}),
      taskId: pending.taskId,
    };
  }
}

// === Snapshot Recorder: 系统状态快照 ===
export class SnapshotRecorder {
  capture(params: {
    snapshotType: SnapshotEntry["snapshotType"];
    loopState: string;
    systemState: Record<string, unknown>;
    taskId: string;
  }): SnapshotEntry {
    return {
      type: "snapshot",
      traceId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...params,
    };
  }
}

// === Reasoning Trace Recorder: LLM 推理过程记录 ===
export class ReasoningTraceRecorder {
  record(params: {
    agentType: string;
    inputPrompt: string;
    reasoningProcess: string;
    finalOutput: string;
    tokenUsage?: { prompt: number; completion: number };
    modelUsed?: string;
    taskId: string;
  }): ReasoningTraceEntry {
    return {
      type: "reasoning",
      traceId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...params,
    };
  }
}

// === Verification Trace Recorder: 验证执行记录 (ADR-004) ===
export class VerificationTraceRecorder {
  record(params: {
    goalId: string;
    method: string;
    passed: boolean;
    durationMs: number;
    evidenceSummary: VerificationTraceEntry["evidenceSummary"];
    round: number;
    taskId: string;
  }): VerificationTraceEntry {
    return {
      type: "verification",
      traceId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...params,
    };
  }
}
