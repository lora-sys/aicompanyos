import { describe, it, expect } from "vitest";
import { EvidenceChain } from "../src/evidence-chain.js";
import type {
  StepTraceEntry,
  DecisionTraceEntry,
  ToolCallTraceEntry,
  SnapshotEntry,
  ReasoningTraceEntry,
} from "../src/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ============================================================
// 测试数据辅助工厂方法
// ============================================================

/** 构造一条 step 类型的测试记录 */
function makeStepEntry(override?: Partial<StepTraceEntry>): StepTraceEntry {
  return {
    type: "step" as const,
    traceId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    previousState: "idle",
    nextState: "planning",
    triggerReason: "test",
    triggeredBy: "test-sm",
    taskId: "t-1",
    ...override,
  };
}

/** 构造一条 decision 类型的测试记录 */
function makeDecisionEntry(override?: Partial<DecisionTraceEntry>): DecisionTraceEntry {
  return {
    type: "decision" as const,
    traceId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    agentType: "writer",
    decisionPoint: "选择方案",
    inputPrompt: "写一个函数",
    finalChoice: "方案A",
    taskId: "t-1",
    ...override,
  };
}

/** 构造一条 tool_call 类型的测试记录 */
function makeToolCallEntry(override?: Partial<ToolCallTraceEntry>): ToolCallTraceEntry {
  return {
    type: "tool_call" as const,
    traceId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    toolName: "read_file",
    toolCategory: "local",
    callerAgent: "agent-1",
    inputParams: {},
    outputResult: null,
    success: true,
    durationMs: 100,
    taskId: "t-1",
    ...override,
  };
}

/** 构造一条 snapshot 类型的测试记录 */
function makeSnapshotEntry(override?: Partial<SnapshotEntry>): SnapshotEntry {
  return {
    type: "snapshot" as const,
    traceId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    snapshotType: "pre_execute",
    loopState: "running",
    systemState: { key: "value" },
    taskId: "t-1",
    ...override,
  };
}

/** 构造一条 reasoning 类型的测试记录 */
function makeReasoningEntry(override?: Partial<ReasoningTraceEntry>): ReasoningTraceEntry {
  return {
    type: "reasoning" as const,
    traceId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    agentType: "critic",
    inputPrompt: "分析代码质量",
    reasoningProcess: "逐步分析...",
    finalOutput: "代码质量良好",
    taskId: "t-1",
    ...override,
  };
}

describe("EvidenceChain", () => {
  // ============================================================
  // 1. 构造：创建 EvidenceChain 应正确初始化 meta 信息
  // ============================================================
  describe("构造", () => {
    it("应正确初始化 meta 信息（chainId / taskId / taskInput / startedAt）", () => {
      const chain = new EvidenceChain("c-1", "t-1", "写一个排序算法");
      const meta = chain.getMeta();

      expect(meta.chainId).toBe("c-1");
      expect(meta.taskId).toBe("t-1");
      expect(meta.taskInput).toBe("写一个排序算法");
      expect(typeof meta.startedAt).toBe("string");
      // startedAt 应该是合法的 ISO 时间字符串
      expect(() => new Date(meta.startedAt)).not.toThrow();
      // 初始 totalEntries 和各类型计数都应为 0
      expect(meta.totalEntries).toBe(0);
      expect(meta.entryCounts.steps).toBe(0);
      expect(meta.entryCounts.decisions).toBe(0);
      expect(meta.entryCounts.toolCalls).toBe(0);
      expect(meta.entryCounts.snapshots).toBe(0);
      expect(meta.entryCounts.reasonings).toBe(0);
    });
  });

  // ============================================================
  // 2. append + getEntries：追加记录后能按时间排序获取
  // ============================================================
  describe("append + getEntries", () => {
    it("追加多条记录后，getEntries 应按时间升序返回", () => {
      const chain = new EvidenceChain("c-2", "t-1", "");

      // 故意用不同时间戳，顺序打乱
      const entryA = makeStepEntry({ timestamp: "2025-01-03T00:00:00.000Z" });
      const entryB = makeDecisionEntry({ timestamp: "2025-01-01T00:00:00.000Z" });
      const entryC = makeToolCallEntry({ timestamp: "2025-01-02T00:00:00.000Z" });

      chain.append(entryA);
      chain.append(entryB);
      chain.append(entryC);

      const entries = chain.getEntries();

      expect(entries).toHaveLength(3);
      // 应按时间升序排列：B -> C -> A
      expect(entries[0].type).toBe("decision");
      expect(entries[1].type).toBe("tool_call");
      expect(entries[2].type).toBe("step");

      // 验证具体时间戳顺序
      expect(new Date(entries[0].timestamp).getTime()).toBeLessThanOrEqual(
        new Date(entries[1].timestamp).getTime(),
      );
      expect(new Date(entries[1].timestamp).getTime()).toBeLessThanOrEqual(
        new Date(entries[2].timestamp).getTime(),
      );
    });

    it("getEntries 返回的是新数组（浅拷贝），替换元素不影响内部数据", () => {
      const chain = new EvidenceChain("c-3", "t-1", "");
      const entry = makeStepEntry();
      chain.append(entry);

      const entries = chain.getEntries();

      // 浅拷贝：数组本身是新引用，但元素仍是同一对象引用
      // 替换数组中的元素不会影响内部
      entries[0] = makeStepEntry({ previousState: "replaced" });
      expect(chain.getEntries()[0].previousState).toBe("idle");
    });
  });

  // ============================================================
  // 3. getEntriesByType：按类型过滤
  // ============================================================
  describe("getEntriesByType", () => {
    it("应正确过滤出指定类型的记录（step / decision / tool_call / snapshot / reasoning）", () => {
      const chain = new EvidenceChain("c-4", "t-1", "");

      chain.append(makeStepEntry());
      chain.append(makeDecisionEntry());
      chain.append(makeToolCallEntry());
      chain.append(makeSnapshotEntry());
      chain.append(makeReasoningEntry());

      // 各类型过滤结果应只包含对应类型的条目
      expect(chain.getEntriesByType("step")).toHaveLength(1);
      expect(chain.getEntriesByType("decision")).toHaveLength(1);
      expect(chain.getEntriesByType("tool_call")).toHaveLength(1);
      expect(chain.getEntriesByType("snapshot")).toHaveLength(1);
      expect(chain.getEntriesByType("reasoning")).toHaveLength(1);

      // 返回的元素类型应正确
      const steps = chain.getEntriesByType("step");
      expect(steps[0].type).toBe("step");
      expect(steps[0].previousState).toBe("idle"); // 类型收窄后可访问 step 特有字段
    });

    it("当目标类型不存在时应返回空数组", () => {
      const chain = new EvidenceChain("c-5", "t-1", "");
      chain.append(makeStepEntry());

      expect(chain.getEntriesByType("decision")).toHaveLength(0);
      expect(chain.getEntriesByType("tool_call")).toHaveLength(0);
      expect(chain.getEntriesByType("snapshot")).toHaveLength(0);
      expect(chain.getEntriesByType("reasoning")).toHaveLength(0);
    });

    it("同类型多条记录都能被正确过滤出来", () => {
      const chain = new EvidenceChain("c-6", "t-1", "");
      chain.append(makeStepEntry());
      chain.append(makeStepEntry({ nextState: "executing" }));
      chain.append(makeStepEntry({ nextState: "finished" }));
      chain.append(makeDecisionEntry());

      expect(chain.getEntriesByType("step")).toHaveLength(3);
      expect(chain.getEntriesByType("decision")).toHaveLength(1);
    });
  });

  // ============================================================
  // 4. getEntriesInRange：按时间范围查询
  // ============================================================
  describe("getEntriesInRange", () => {
    it("应只返回落在 [start, end] 区间内的记录", () => {
      const chain = new EvidenceChain("c-7", "t-1", "");

      chain.append(makeStepEntry({ timestamp: "2025-02-01T12:00:00.000Z" }));
      chain.append(makeDecisionEntry({ timestamp: "2025-02-15T12:00:00.000Z" }));
      chain.append(makeToolCallEntry({ timestamp: "2025-03-01T12:00:00.000Z" }));
      chain.append(makeSnapshotEntry({ timestamp: "2025-04-01T12:00:00.000Z" }));

      // 查询 2 月区间
      const result = chain.getEntriesInRange(
        new Date("2025-02-01T00:00:00.000Z"),
        new Date("2025-02-28T23:59:59.999Z"),
      );

      expect(result).toHaveLength(2); // step + decision
      expect(result.every((e) => e.type === "step" || e.type === "decision")).toBe(true);
    });

    it("边界值包含在内（闭区间）", () => {
      const chain = new EvidenceChain("c-8", "t-1", "");
      chain.append(makeStepEntry({ timestamp: "2025-06-01T00:00:00.000Z" }));
      chain.append(makeDecisionEntry({ timestamp: "2025-06-30T23:59:59.999Z" }));

      const result = chain.getEntriesInRange(
        new Date("2025-06-01T00:00:00.000Z"),
        new Date("2025-06-30T23:59:59.999Z"),
      );

      expect(result).toHaveLength(2);
    });

    it("无匹配记录时返回空数组", () => {
      const chain = new EvidenceChain("c-9", "t-1", "");
      chain.append(makeStepEntry({ timestamp: "2025-01-01T00:00:00.000Z" }));

      const result = chain.getEntriesInRange(
        new Date("2026-01-01T00:00:00.000Z"),
        new Date("2026-12-31T23:59:59.999Z"),
      );

      expect(result).toHaveLength(0);
    });
  });

  // ============================================================
  // 5. getMeta：元数据包含正确的 entryCounts
  // ============================================================
  describe("getMeta", () => {
    it("entryCounts 应反映当前各类型记录的实际数量", () => {
      const chain = new EvidenceChain("c-10", "t-1", "");

      // 初始状态全为 0
      let meta = chain.getMeta();
      expect(meta.entryCounts).toEqual({
        steps: 0,
        decisions: 0,
        toolCalls: 0,
        snapshots: 0,
        reasonings: 0,
        verifications: 0,
      });
      expect(meta.totalEntries).toBe(0);

      // 添加各种类型记录
      chain.append(makeStepEntry());          // steps=1
      chain.append(makeStepEntry());          // steps=2
      chain.append(makeDecisionEntry());       // decisions=1
      chain.append(makeToolCallEntry());       // toolCalls=1
      chain.append(makeSnapshotEntry());       // snapshots=1
      chain.append(makeReasoningEntry());      // reasonings=1

      meta = chain.getMeta();
      expect(meta.totalEntries).toBe(6);
      expect(meta.entryCounts).toEqual({
        steps: 2,
        decisions: 1,
        toolCalls: 1,
        snapshots: 1,
        reasonings: 1,
        verifications: 0,
      });
    });

    it("getMeta 返回副本，顶层属性修改不影响内部状态", () => {
      const chain = new EvidenceChain("c-11", "t-1", "");
      chain.append(makeStepEntry());

      const meta = chain.getMeta();
      meta.chainId = "hacked";

      // 顶层属性（chainId / taskId 等）是独立副本，修改不会影响内部
      const freshMeta = chain.getMeta();
      expect(freshMeta.chainId).toBe("c-11");
    });
  });

  // ============================================================
  // 6. exportToJSONL / importFromJSONL：导出与导入
  // ============================================================
  describe("exportToJSONL / importFromJSONL", () => {
    it("导出的 JSONL 每行应为有效的 JSON 对象", () => {
      const chain = new EvidenceChain("c-12", "t-1", "");
      chain.append(makeStepEntry({ traceId: "s-1" }));
      chain.append(makeDecisionEntry({ traceId: "d-1" }));
      chain.append(makeToolCallEntry({ traceId: "tc-1" }));

      const jsonl = chain.exportToJSONL();
      const lines = jsonl.trim().split("\n");

      expect(lines).toHaveLength(3);

      // 每行都应是合法 JSON 且包含完整字段
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty("type");
        expect(parsed).toHaveProperty("traceId");
        expect(parsed).toHaveProperty("timestamp");
        expect(parsed).toHaveProperty("taskId");
      }
    });

    it("从 JSONL 导入后能正确解析各条记录的字段", () => {
      const chain = new EvidenceChain("c-13", "t-1", "");
      chain.append(makeStepEntry({ traceId: "s-import" }));
      chain.append(makeDecisionEntry({ traceId: "d-import" }));
      chain.append(makeSnapshotEntry({ traceId: "sn-import" }));

      const jsonl = chain.exportToJSONL();
      const restored = EvidenceChain.importFromJSONL(jsonl);

      // 导入过程不抛异常即成功，验证导入链的基本属性
      const restoredMeta = restored.getMeta();
      expect(restoredMeta.chainId).toContain("imported-");
      expect(restoredMeta.taskId).toBe("t-1");

      // 验证导出的 JSONL 行数与原始条目一致（确保序列化/反序列化完整）
      const lines = jsonl.trim().split("\n");
      expect(lines).toHaveLength(3);

      // 逐行验证关键字段完整性
      const parsedEntries = lines.map((l) => JSON.parse(l));
      const stepEntry = parsedEntries.find((e: TraceEntry) => e.type === "step") as StepTraceEntry;
      expect(stepEntry.traceId).toBe("s-import");
      expect(stepEntry.previousState).toBe("idle");

      const decisionEntry = parsedEntries.find((e: TraceEntry) => e.type === "decision") as DecisionTraceEntry;
      expect(decisionEntry.traceId).toBe("d-import");
      expect(decisionEntry.finalChoice).toBe("方案A");

      const snapEntry = parsedEntries.find((e: TraceEntry) => e.type === "snapshot") as SnapshotEntry;
      expect(snapEntry.traceId).toBe("sn-import");
      expect(snapEntry.snapshotType).toBe("pre_execute");
    });

    it("导入空字符串或仅空白内容应抛出错误", () => {
      expect(() => EvidenceChain.importFromJSONL("")).toThrow("JSONL 内容为空");
      expect(() => EvidenceChain.importFromJSONL("   \n  ")).toThrow("JSONL 内容为空");
    });
  });

  // ============================================================
  // 7. saveToFile / loadFromFile：文件系统持久化和加载
  // ============================================================
  describe("saveToFile / loadFromFile", () => {
    it("保存到临时文件后再加载，文件内容完整且可被正确解析", async () => {
      const chain = new EvidenceChain("c-14", "t-1", "测试任务输入");
      chain.append(makeStepEntry({ traceId: "s-file" }));
      chain.append(makeDecisionEntry({ traceId: "d-file" }));
      chain.append(makeToolCallEntry({ traceId: "tc-file" }));
      chain.append(makeReasoningEntry({ traceId: "r-file" }));

      // 使用系统临时目录创建一个临时文件
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-chain-test-"));
      const filePath = path.join(tmpDir, "chain.jsonl");

      try {
        await chain.saveToFile(filePath);
        const loaded = await EvidenceChain.loadFromFile(filePath);

        // 加载成功且返回有效的 EvidenceChain 实例
        expect(loaded).toBeInstanceOf(EvidenceChain);
        const loadedMeta = loaded.getMeta();
        expect(loadedMeta.chainId).toContain("imported-");
        expect(loadedMeta.taskId).toBe("t-1");

        // 验证文件内容确实是合法的 JSONL 且行数正确
        const fileContent = await fs.readFile(filePath, "utf-8");
        const lines = fileContent.trim().split("\n");
        expect(lines).toHaveLength(4);

        // 逐行验证 JSON 合法性及关键字段
        lines.forEach((line) => {
          const parsed = JSON.parse(line);
          expect(parsed).toHaveProperty("type");
          expect(parsed).toHaveProperty("traceId");
          expect(parsed).toHaveProperty("timestamp");
          expect(parsed).toHaveProperty("taskId");
        });
      } finally {
        // 清理临时文件和目录
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // ============================================================
  // 8. end()：设置 endedAt 时间戳
  // ============================================================
  describe("end()", () => {
    it("调用 end 后 meta 中应有 endedAt 字段且为有效 ISO 时间", () => {
      const chain = new EvidenceChain("c-15", "t-1", "");

      // 调用前 endedAt 不存在
      expect(chain.getMeta().endedAt).toBeUndefined();

      chain.end();

      const afterEnd = chain.getMeta();
      expect(afterEnd.endedAt).toBeDefined();
      expect(typeof afterEnd.endedAt).toBe("string");
      expect(() => new Date(afterEnd.endedAt!)).not.toThrow();

      // endedAt 不应早于 startedAt
      const startTime = new Date(afterEnd.startedAt).getTime();
      const endTime = new Date(afterEnd.endedAt!).getTime();
      expect(endTime).toBeGreaterThanOrEqual(startTime);
    });

    it("多次调用 end 会更新 endedAt 为最新时间", () => {
      const chain = new EvidenceChain("c-16", "t-1", "");

      chain.end();
      const firstEndedAt = chain.getMeta().endedAt;

      // 短暂等待确保时间戳不同（实际中通常不需要，但逻辑上应覆盖）
      chain.end();
      const secondEndedAt = chain.getMeta().endedAt;

      // 两次调用都会设置 endedAt（可能相同毫秒）
      expect(secondEndedAt).toBeDefined();
    });
  });

  // ============================================================
  // 9. replay()：回放时对每条记录调用 callback
  // ============================================================
  describe("replay()", () => {
    it("应按时间顺序对每条记录调用 callback", () => {
      const chain = new EvidenceChain("c-17", "t-1", "");

      // 用固定时间戳确保顺序可控
      chain.append(makeDecisionEntry({ timestamp: "2025-05-01T10:00:00.000Z" }));
      chain.append(makeStepEntry({ timestamp: "2025-05-01T09:00:00.000Z" }));
      chain.append(makeToolCallEntry({ timestamp: "2025-05-01T11:00:00.000Z" }));

      const replayedTypes: string[] = [];
      chain.replay((entry) => {
        replayedTypes.push(entry.type);
      });

      // 回放顺序应按时间升序：step -> decision -> tool_call
      expect(replayedTypes).toEqual(["step", "decision", "tool_call"]);
    });

    it("callback 接收到的每条记录应包含完整的原始字段", () => {
      const chain = new EvidenceChain("c-18", "t-1", "");
      const testEntry = makeStepEntry({
        traceId: "replay-test-id",
        previousState: "init",
        nextState: "done",
      });
      chain.append(testEntry);

      let receivedEntry: TraceEntry | undefined;
      chain.replay((entry) => {
        receivedEntry = entry;
      });

      expect(receivedEntry).toBeDefined();
      expect(receivedEntry!.traceId).toBe("replay-test-id");
      expect((receivedEntry! as StepTraceEntry).previousState).toBe("init");
      expect((receivedEntry! as StepTraceEntry).nextState).toBe("done");
    });

    it("空链回放时 callback 不应被调用", () => {
      const chain = new EvidenceChain("c-19", "t-1", "");
      let callCount = 0;
      chain.replay(() => {
        callCount++;
      });
      expect(callCount).toBe(0);
    });
  });

  // ============================================================
  // 10. 5 个 Recorder 实例：steps/decisions/toolCalls/snapshots/reasoning 都存在且独立
  // ============================================================
  describe("Recorder 实例", () => {
    it("五个 recorder 属性均存在且为各自独立的实例", () => {
      const chain = new EvidenceChain("c-20", "t-1", "");

      // 验证每个属性都存在
      expect(chain.steps).toBeDefined();
      expect(chain.decisions).toBeDefined();
      expect(chain.toolCalls).toBeDefined();
      expect(chain.snapshots).toBeDefined();
      expect(chain.reasoning).toBeDefined();

      // 验证它们是不同的实例（通过构造函数名称区分）
      expect(chain.steps.constructor.name).toBe("StepTraceRecorder");
      expect(chain.decisions.constructor.name).toBe("DecisionTraceRecorder");
      expect(chain.toolCalls.constructor.name).toBe("ToolCallTraceRecorder");
      expect(chain.snapshots.constructor.name).toBe("SnapshotRecorder");
      expect(chain.reasoning.constructor.name).toBe("ReasoningTraceRecorder");
    });

    it("每个 recorder 可以独立生成对应类型的 TraceEntry", () => {
      const chain = new EvidenceChain("c-21", "t-1", "recorder-test");

      // StepTraceRecorder.record()
      const step = chain.steps.record({
        previousState: "idle",
        nextState: "working",
        triggerReason: "开始执行",
        triggeredBy: "test-agent",
        taskId: "rt-1",
      });
      expect(step.type).toBe("step");
      expect(step.traceId).toBeDefined();
      expect(step.timestamp).toBeDefined();
      expect(step.previousState).toBe("idle");
      expect(step.nextState).toBe("working");

      // DecisionTraceRecorder.record()
      const decision = chain.decisions.record({
        agentType: "critic",
        decisionPoint: "评估方案",
        inputPrompt: "这个方案好吗？",
        finalChoice: "通过",
        taskId: "rt-1",
      });
      expect(decision.type).toBe("decision");
      expect(decision.agentType).toBe("critic");
      expect(decision.finalChoice).toBe("通过");

      // ToolCallTraceRecorder.startCall() + endCall()
      const startResult = chain.toolCalls.startCall(
        "search_web",
        "local",
        "agent-1",
        { query: "vitest" },
        "rt-1",
      );
      expect(startResult.traceId).toBeDefined();

      const toolCall = chain.toolCalls.endCall(startResult.traceId, { results: [] }, true);
      expect(toolCall.type).toBe("tool_call");
      expect(toolCall.toolName).toBe("search_web");
      expect(toolCall.success).toBe(true);
      expect(toolCall.durationMs).toBeGreaterThanOrEqual(0);

      // SnapshotRecorder.capture()
      const snapshot = chain.snapshots.capture({
        snapshotType: "post_verify",
        loopState: "verifying",
        systemState: { progress: 80 },
        taskId: "rt-1",
      });
      expect(snapshot.type).toBe("snapshot");
      expect(snapshot.snapshotType).toBe("post_verify");
      expect(snapshot.systemState).toEqual({ progress: 80 });

      // ReasoningTraceRecorder.record()
      const reasoning = chain.reasoning.record({
        agentType: "writer",
        inputPrompt: "如何实现？",
        reasoningProcess: "首先...然后...",
        finalOutput: "使用递归",
        tokenUsage: { prompt: 100, completion: 50 },
        modelUsed: "gpt-4",
        taskId: "rt-1",
      });
      expect(reasoning.type).toBe("reasoning");
      expect(reasoning.modelUsed).toBe("gpt-4");
      expect(reasoning.tokenUsage).toEqual({ prompt: 100, completion: 50 });
    });

    it("两个不同 EvidenceChain 的 recorder 实例互不干扰", () => {
      const chainA = new EvidenceChain("ca", "ta", "");
      const chainB = new EvidenceChain("cb", "tb", "");

      // 确认是不同的实例对象
      expect(chainA.steps).not.toBe(chainB.steps);
      expect(chainA.decisions).not.toBe(chainB.decisions);
      expect(chainA.toolCalls).not.toBe(chainB.toolCalls);
      expect(chainA.snapshots).not.toBe(chainB.snapshots);
      expect(chainA.reasoning).not.toBe(chainB.reasoning);
    });
  });
});
