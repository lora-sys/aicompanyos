/**
 * HistoryReader — 单元测试
 *
 * 覆盖：
 * - 空数据返回空前缀
 * - 有经验/能力/限制时构建完整前缀
 * - 相关性筛选（关键词匹配）
 * - 能力排序（熟练度优先）
 * - 用户画像提取
 * - 配置限制（maxExperiences 等）
 */
import { describe, it, expect } from "vitest";
import { HistoryReader, DEFAULT_HISTORY_READER_CONFIG } from "../history-reader.js";
// ============================================================
// Mock 工厂函数
// ============================================================
function createMockSelfData(overrides) {
    return {
        experiences: overrides?.experiences ?? [],
        totalTasksCompleted: overrides?.totalTasksCompleted ?? 10,
        totalSuccessRate: overrides?.totalSuccessRate ?? 0.8,
        capabilities: overrides?.capabilities ?? [],
        limitations: overrides?.limitations ?? [],
        lastUpdated: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}
function createMockUserData(overrides) {
    const baseProfile = {
        writingStyle: "专业但亲切",
        topicTendencies: ["AI", "技术", "效率工具"],
        expressionHabits: ["数据驱动", "案例支撑"],
        targetAudience: "25-35岁职场人士",
        workflowPreference: "先大纲后填充",
    };
    return {
        profile: { ...baseProfile, ...overrides?.profile },
        fields: overrides?.fields ?? [
            { key: "niche", value: "AI和技术", source: "interrogate", confidence: 0.9, updatedAt: "2026-01-01" },
        ],
        createdAt: "2026-01-01",
        lastUpdated: "2026-01-01",
    };
}
// ============================================================
// Test Suite 1: 空数据处理
// ============================================================
describe("HistoryReader — 空数据", () => {
    it("selfMD 为 null 时返回空前缀", async () => {
        const reader = new HistoryReader(async () => null);
        const result = await reader.buildPromptPrefix("写一篇文章");
        expect(result.promptPrefix).toBe("");
        expect(result.stats.experienceCount).toBe(0);
        expect(result.stats.totalChars).toBe(0);
    });
    it("experiences 为空数组时返回空前缀", async () => {
        const reader = new HistoryReader(async () => createMockSelfData({ experiences: [] }));
        const result = await reader.buildPromptPrefix("写一篇文章");
        expect(result.promptPrefix).toBe("");
        expect(result.stats.experienceCount).toBe(0);
    });
});
// ============================================================
// Test Suite 2: 能力清单构建
// ============================================================
describe("HistoryReader — 能力清单", () => {
    it("应按熟练度降序排列能力", async () => {
        const reader = new HistoryReader(async () => createMockSelfData({
            capabilities: [
                { name: "长文写作", proficiency: 85, lastUsed: "2026-06-01", successCount: 10, failureCount: 1 },
                { name: "种草笔记", proficiency: 92, lastUsed: "2026-06-10", successCount: 20, failureCount: 2 },
                { name: "短视频", proficiency: 45, lastUsed: "2026-05-01", successCount: 3, failureCount: 3 },
            ],
            experiences: [{ entryId: "e1", pattern: "test", type: "success", lesson: "ok", timestamp: "2026-06-01", taskType: "article" }],
        }));
        const result = await reader.buildPromptPrefix("写一篇技术文章");
        expect(result.promptPrefix).toContain("种草笔记"); // proficiency=92, 排第一
        expect(result.promptPrefix).toContain("长文写作"); // proficiency=85, 排第二
        expect(result.promptPrefix).toContain("短视频"); // proficiency=45, 排第三
        expect(result.stats.capabilityCount).toBe(3);
        // 验证顺序：种草笔记在长文写作前面
        const seedIdx = result.promptPrefix.indexOf("种草笔记");
        const articleIdx = result.promptPrefix.indexOf("长文写作");
        expect(seedIdx).toBeLessThan(articleIdx);
    });
    it("低熟练度能力应显示警告", async () => {
        const reader = new HistoryReader(async () => createMockSelfData({
            capabilities: [
                { name: "短视频", proficiency: 30, lastUsed: "2026-06-01", successCount: 1, failureCount: 5 },
            ],
            experiences: [{ entryId: "e1", pattern: "test", type: "success", lesson: "ok", timestamp: "2026-06-01", taskType: "article" }],
        }), undefined, { proficiencyWarningThreshold: 40 });
        const result = await reader.buildPromptPrefix("测试");
        expect(result.promptPrefix).toContain("⚠️");
        expect(result.promptPrefix).toContain("熟练度偏低");
    });
    it("maxCapabilities 应限制数量", async () => {
        const caps = Array.from({ length: 10 }, (_, i) => ({
            name: `能力${i + 1}`,
            proficiency: 80 - i * 5,
            lastUsed: "2026-06-01",
            successCount: 5,
            failureCount: 0,
        }));
        const reader = new HistoryReader(async () => createMockSelfData({
            capabilities: caps,
            experiences: [{ entryId: "e1", pattern: "test", type: "success", lesson: "ok", timestamp: "2026-06-01", taskType: "article" }],
        }), undefined, { maxCapabilities: 3 });
        const result = await reader.buildPromptPrefix("测试");
        expect(result.stats.capabilityCount).toBeLessThanOrEqual(3);
    });
});
// ============================================================
// Test Suite 3: 经验教训构建
// ============================================================
describe("HistoryReader — 经验教训", () => {
    it("应包含成功和失败的经验", async () => {
        const experiences = [
            { entryId: "e1", pattern: "技术文章写作", type: "success", lesson: "加入代码示例提升可读性", timestamp: "2026-06-10", taskType: "article" },
            { entryId: "e2", pattern: "种草笔记", type: "failure", lesson: "emoji 过多会降低专业性", timestamp: "2026-06-09", taskType: "seed" },
            { entryId: "e3", pattern: "长文结构", type: "success", lesson: "小标题分段提高可读性", timestamp: "2026-06-08", taskType: "article" },
        ];
        const reader = new HistoryReader(async () => createMockSelfData({ experiences }));
        const result = await reader.buildPromptPrefix("写一篇AI技术文章");
        expect(result.promptPrefix).toContain("技术文章写作");
        expect(result.promptPrefix).toContain("加入代码示例提升可读性");
        expect(result.promptPrefix).toContain("种草笔记");
        expect(result.promptPrefix).toContain("emoji 过多会降低专业性");
        expect(result.stats.experienceCount).toBeGreaterThan(0);
    });
    it("maxExperiences 应限制数量", async () => {
        const experiences = Array.from({ length: 10 }, (_, i) => ({
            entryId: `e${i}`,
            pattern: `任务${i}`,
            type: "success",
            lesson: `lesson ${i}`,
            timestamp: "2026-06-01",
            taskType: "article",
        }));
        const reader = new HistoryReader(async () => createMockSelfData({ experiences }), undefined, { maxExperiences: 3 });
        const result = await reader.buildPromptPrefix("测试");
        expect(result.stats.experienceCount).toBeLessThanOrEqual(3);
    });
    it("与任务关键词匹配的经验应被包含在结果中", async () => {
        const experiences = [
            { entryId: "e1", pattern: "烹饪食谱", type: "success", lesson: "步骤要详细", timestamp: "2026-06-10", taskType: "article" },
            { entryId: "e2", pattern: "AI技术文章", type: "success", lesson: "需要调研最新论文和代码示例", timestamp: "2026-06-10", taskType: "article" },
            { entryId: "e3", pattern: "旅行攻略", type: "failure", lesson: "图片链接容易失效", timestamp: "2026-06-08", taskType: "seed" },
        ];
        const reader = new HistoryReader(async () => createMockSelfData({ experiences }));
        const result = await reader.buildPromptPrefix("写一篇关于AI Agent的技术深度分析");
        // 核心验证：与任务关键词匹配的经验必须被包含
        // "AI技术文章" 的 pattern 包含 "技术"，与输入关键词匹配
        expect(result.promptPrefix).toContain("AI技术文章");
        expect(result.promptPrefix).toContain("需要调研最新论文和代码示例");
        // 验证经验计数 > 0
        expect(result.stats.experienceCount).toBeGreaterThan(0);
    });
});
// ============================================================
// Test Suite 4: 已知限制
// ============================================================
describe("HistoryReader — 已知限制", () => {
    it("应包含限制列表", async () => {
        const reader = new HistoryReader(async () => createMockSelfData({
            limitations: [
                { limitation: "长文容易超出字数限制", source: "evolution", severity: "high", discoveredAt: "2026-06-01", count: 5 },
                { limitation: "技术术语过多影响可读性", source: "manual", severity: "medium", discoveredAt: "2026-06-05", count: 2 },
            ],
            experiences: [{ entryId: "e1", pattern: "test", type: "success", lesson: "ok", timestamp: "2026-06-01", taskType: "article" }],
        }));
        const result = await reader.buildPromptPrefix("写一篇技术文章");
        expect(result.promptPrefix).toContain("长文容易超出字数限制");
        expect(result.promptPrefix).toContain("🔴"); // high severity icon
        expect(result.promptPrefix).toContain("出现5次");
        expect(result.stats.limitationCount).toBe(2);
    });
    it("maxLimitations 应限制数量", async () => {
        const limitations = Array.from({ length: 5 }, (_, i) => ({
            limitation: `限制${i}`,
            source: "test",
            severity: "medium",
            discoveredAt: "2026-06-01",
            count: i + 1,
        }));
        const reader = new HistoryReader(async () => createMockSelfData({
            limitations,
            experiences: [{ entryId: "e1", pattern: "test", type: "success", lesson: "ok", timestamp: "2026-06-01", taskType: "article" }],
        }), undefined, { maxLimitations: 2 });
        const result = await reader.buildPromptPrefix("测试");
        expect(result.stats.limitationCount).toBeLessThanOrEqual(2);
    });
});
// ============================================================
// Test Suite 5: 用户画像
// ============================================================
describe("HistoryReader — 用户画像", () => {
    it("应包含用户画像信息", async () => {
        const reader = new HistoryReader(async () => createMockSelfData({ experiences: [{ entryId: "e1", pattern: "test", type: "success", lesson: "ok", timestamp: "2026-06-01", taskType: "article" }] }), async () => createMockUserData());
        const result = await reader.buildPromptPrefix("写一篇文章");
        expect(result.promptPrefix).toContain("目标用户画像");
        expect(result.promptPrefix).toContain("25-35岁职场人士");
        // niche 来自 userData.fields（自定义字段）
        expect(result.promptPrefix).toContain("AI和技术");
        expect(result.stats.hasUserProfile).toBe(true);
    });
    it("includeUserProfile=false 时不应包含用户画像", async () => {
        const reader = new HistoryReader(async () => createMockSelfData({ experiences: [{ entryId: "e1", pattern: "test", type: "success", lesson: "ok", timestamp: "2026-06-01", taskType: "article" }] }), async () => createMockUserData(), { includeUserProfile: false });
        const result = await reader.buildPromptPrefix("写一篇文章");
        expect(result.promptPrefix).not.toContain("目标用户画像");
        expect(result.stats.hasUserProfile).toBe(false);
    });
    it("userMD 为 null 时不应崩溃", async () => {
        const reader = new HistoryReader(async () => createMockSelfData({ experiences: [{ entryId: "e1", pattern: "test", type: "success", lesson: "ok", timestamp: "2026-06-01", taskType: "article" }] }), async () => null);
        const result = await reader.buildPromptPrefix("写一篇文章");
        expect(result.stats.hasUserProfile).toBe(false);
        // 不应抛异常
        expect(result.promptPrefix).toBeDefined();
    });
});
// ============================================================
// Test Suite 6: 完整集成场景
// ============================================================
describe("HistoryReader — 完整集成", () => {
    it("应有标题和正确的 Markdown 结构", async () => {
        const reader = new HistoryReader(async () => createMockSelfData({
            experiences: [
                { entryId: "e1", pattern: "技术文章", type: "success", lesson: "代码示例很重要", timestamp: "2026-06-10", taskType: "article" },
            ],
            capabilities: [
                { name: "技术写作", proficiency: 88, lastUsed: "2026-06-10", successCount: 15, failureCount: 1 },
            ],
            limitations: [
                { limitation: "避免过度使用术语", source: "evolution", severity: "medium", discoveredAt: "2026-06-05", count: 3 },
            ],
        }), async () => createMockUserData({
            profile: { targetAudience: "开发者", writingStyle: "technical", topicTendencies: [], expressionHabits: [], workflowPreference: "structured" },
        }));
        const result = await reader.buildPromptPrefix("写一篇 AI Agent 架构分析");
        // 基本结构检查
        expect(result.promptPrefix).toContain("📚 历史经验与能力画像");
        expect(result.promptPrefix).toContain("✅ 已掌握的能力");
        expect(result.promptPrefix).toContain("💡 相关经验教训");
        expect(result.promptPrefix).toContain("🚫 已知限制");
        expect(result.promptPrefix).toContain("👤 目标用户画像");
        // 统计完整性
        expect(result.stats.experienceCount).toBe(1);
        expect(result.stats.capabilityCount).toBe(1);
        expect(result.stats.limitationCount).toBe(1);
        expect(result.stats.hasUserProfile).toBe(true);
        expect(result.stats.totalChars).toBeGreaterThan(50);
        // sourceData 引用完整性
        expect(result.sourceData.experiences).toHaveLength(1);
        expect(result.sourceData.capabilities).toHaveLength(1);
        expect(result.sourceData.limitations).toHaveLength(1);
    });
    it("默认配置常量应包含合理值", () => {
        expect(DEFAULT_HISTORY_READER_CONFIG.maxExperiences).toBe(5);
        expect(DEFAULT_HISTORY_READER_CONFIG.maxCapabilities).toBe(8);
        expect(DEFAULT_HISTORY_READER_CONFIG.maxLimitations).toBe(3);
        expect(DEFAULT_HISTORY_READER_CONFIG.includeUserProfile).toBe(true);
        expect(DEFAULT_HISTORY_READER_CONFIG.proficiencyWarningThreshold).toBe(40);
    });
});
//# sourceMappingURL=history-reader.test.js.map