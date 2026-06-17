import * as fs from "node:fs/promises";
import { StepTraceRecorder, DecisionTraceRecorder, ToolCallTraceRecorder, SnapshotRecorder, ReasoningTraceRecorder, } from "./trace-recorders.js";
// === Evidence Chain 主类 ===
export class EvidenceChain {
    entries = [];
    meta;
    // 五个专用记录器实例（只读暴露）
    steps;
    decisions;
    toolCalls;
    snapshots;
    reasoning;
    constructor(chainId, taskId, taskInput) {
        this.steps = new StepTraceRecorder();
        this.decisions = new DecisionTraceRecorder();
        this.toolCalls = new ToolCallTraceRecorder();
        this.snapshots = new SnapshotRecorder();
        this.reasoning = new ReasoningTraceRecorder();
        this.meta = {
            chainId,
            taskId,
            taskInput,
            startedAt: new Date().toISOString(),
            totalEntries: 0,
            entryCounts: {
                steps: 0,
                decisions: 0,
                toolCalls: 0,
                snapshots: 0,
                reasonings: 0,
            },
        };
    }
    // 追加一条记录（自动路由到对应 recorder）
    append(entry) {
        this.entries.push(entry);
        this.meta.totalEntries++;
        // 更新各类型计数
        switch (entry.type) {
            case "step":
                this.meta.entryCounts.steps++;
                break;
            case "decision":
                this.meta.entryCounts.decisions++;
                break;
            case "tool_call":
                this.meta.entryCounts.toolCalls++;
                break;
            case "snapshot":
                this.meta.entryCounts.snapshots++;
                break;
            case "reasoning":
                this.meta.entryCounts.reasonings++;
                break;
        }
    }
    // 获取元数据
    getMeta() {
        return { ...this.meta };
    }
    // 获取所有记录（按时间排序）
    getEntries() {
        return [...this.entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
    // 按类型过滤
    getEntriesByType(type) {
        return this.entries.filter((entry) => entry.type === type);
    }
    // 按时间范围查询
    getEntriesInRange(start, end) {
        const startMs = start.getTime();
        const endMs = end.getTime();
        return this.entries.filter((entry) => {
            const entryTime = new Date(entry.timestamp).getTime();
            return entryTime >= startMs && entryTime <= endMs;
        });
    }
    // 导出为 JSON Lines 格式
    exportToJSONL() {
        return this.entries.map((entry) => JSON.stringify(entry)).join("\n");
    }
    // 从 JSON Lines 格式导入
    static importFromJSONL(jsonl) {
        const lines = jsonl.trim().split("\n");
        if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
            throw new Error("JSONL 内容为空");
        }
        const entries = lines.map((line) => JSON.parse(line));
        // 从第一条记录推断 chainId 和 taskId
        const first = entries[0];
        const chainId = `imported-${Date.now()}`;
        const taskId = first.taskId;
        const taskInput = "";
        const chain = new EvidenceChain(chainId, taskId, taskInput);
        // 覆盖内部 entries 和 meta
        chain.entries = entries;
        // 重建 meta 计数
        const meta = chain.getMeta();
        meta.totalEntries = entries.length;
        meta.entryCounts = {
            steps: entries.filter((e) => e.type === "step").length,
            decisions: entries.filter((e) => e.type === "decision").length,
            toolCalls: entries.filter((e) => e.type === "tool_call").length,
            snapshots: entries.filter((e) => e.type === "snapshot").length,
            reasonings: entries.filter((e) => e.type === "reasoning").length,
        };
        return chain;
    }
    // 保存到文件系统
    async saveToFile(filePath) {
        await fs.writeFile(filePath, this.exportToJSONL(), "utf-8");
    }
    // 从文件系统加载
    static async loadFromFile(filePath) {
        const content = await fs.readFile(filePath, "utf-8");
        return EvidenceChain.importFromJSONL(content);
    }
    // 标记结束
    end() {
        this.meta.endedAt = new Date().toISOString();
    }
    // 回放（按顺序遍历所有 entries，对每条调用 callback）
    replay(callback) {
        const sorted = this.getEntries();
        for (const entry of sorted) {
            callback(entry);
        }
    }
}
//# sourceMappingURL=evidence-chain.js.map