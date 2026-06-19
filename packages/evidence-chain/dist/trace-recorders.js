import { randomUUID } from "node:crypto";
// === Step Trace Recorder: 状态转换记录 ===
export class StepTraceRecorder {
    record(params) {
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
    record(params) {
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
    pendingCalls = new Map();
    startCall(toolName, toolCategory, callerAgent, inputParams, taskId) {
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
    endCall(traceId, result, success, errorMessage, mcpServerName) {
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
    capture(params) {
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
    record(params) {
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
    record(params) {
        return {
            type: "verification",
            traceId: randomUUID(),
            timestamp: new Date().toISOString(),
            ...params,
        };
    }
}
//# sourceMappingURL=trace-recorders.js.map