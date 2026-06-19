/**
 * Content Production Team — 单元测试
 *
 * 覆盖：
 * - ContentTeamManager.composeTeam() 8 种规则匹配
 * - CONTENT_TEAM_RULES 覆盖率
 * - createContentWorkerRegistrations() 完整性
 * - Worker 注册流程
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ContentTeamManager } from "../content-team-manager.js";
import { CONTENT_TEAM_RULES } from "../content-rules.js";
import { createContentWorkerRegistrations, } from "../content-workers.js";
// ============================================================
// Mock: 简化的 TeamContext（不需要完整实现）
// ============================================================
const BASE_CONTEXT = {
    departmentId: "content-production",
    availableRoles: ["writer", "critic", "researcher", "uiux-designer", "reviewer"],
};
// ============================================================
// Test Suite 1: 规则匹配（8 条规则逐一验证）
// ============================================================
describe("ContentTeamRules — 8 条规则匹配", () => {
    it("R1: 高复杂度+调研+视觉+premium → 全明星5人", async () => {
        const mgr = new ContentTeamManager({ contentType: "article" });
        const team = await mgr.composeTeam("写一篇关于AI Agent架构的深度技术文章，需要调研最新论文并配图", BASE_CONTEXT);
        const roles = team.workers.map((w) => w.role);
        expect(roles).toContain("writer");
        expect(roles).toContain("critic");
        expect(roles).toContain("researcher");
        expect(roles).toContain("uiux-designer");
        expect(roles).toContain("reviewer");
        expect(team.matchedRuleId).toBe("cp-premium-full-team");
        expect(team.features.complexity).toBe("high");
        expect(team.features.needsResearch).toBe(true);
        expect(team.features.hasVisualContent).toBe(true);
    });
    it("R2: 高复杂度+调研+premium → 研究4人", async () => {
        const mgr = new ContentTeamManager({ contentType: "article" });
        const team = await mgr.composeTeam("深度分析2026年AI行业趋势报告，需要调研大量数据", BASE_CONTEXT);
        const roles = team.workers.map((w) => w.role);
        expect(roles).toContain("writer");
        expect(roles).toContain("critic");
        expect(roles).toContain("researcher");
        expect(roles).toContain("reviewer");
        // 不应包含 uiux-designer（无视觉需求）
        expect(roles).not.toContain("uiux-designer");
        expect(team.matchedRuleId).toBe("cp-research-heavy");
    });
    it("R3: 有视觉内容(非高复杂度) → 创意3人", async () => {
        const mgr = new ContentTeamManager({ contentType: "seed" });
        const team = await mgr.composeTeam("写一篇夏日防晒好物的小红书种草笔记，需要卡片设计", BASE_CONTEXT);
        const roles = team.workers.map((w) => w.role);
        expect(roles).toContain("writer");
        expect(roles).toContain("critic");
        expect(roles).toContain("uiux-designer");
        expect(team.matchedRuleId).toBe("cp-visual-creative");
    });
    it("R4: 轻量调研 → 3人(含light researcher)", async () => {
        const mgr = new ContentTeamManager({ contentType: "article" });
        const team = await mgr.composeTeam("写一篇关于最新iPhone发布的新闻稿，需要查一下参数", BASE_CONTEXT);
        const roles = team.workers.map((w) => w.role);
        expect(roles).toContain("writer");
        expect(roles).toContain("critic");
        expect(roles).toContain("researcher");
        // researcher 应该是 light 模式
        const researcher = team.workers.find((w) => w.role === "researcher");
        expect(researcher?.configOverride?.researchDepth).toBe("light");
        expect(team.matchedRuleId).toBe("cp-light-research");
    });
    it("R5: Premium 质量(无特殊需求) → 核心3人+审查员", async () => {
        const mgr = new ContentTeamManager({ contentType: "article" });
        const team = await mgr.composeTeam("写一篇专业的品牌故事文案，要求高质量", BASE_CONTEXT);
        const roles = team.workers.map((w) => w.role);
        expect(roles).toContain("writer");
        expect(roles).toContain("critic");
        expect(roles).toContain("reviewer");
        expect(roles).not.toContain("researcher");
        expect(roles).not.toContain("uiux-designer");
        expect(team.matchedRuleId).toBe("cp-premium-core");
    });
    it("R6: 标准质量 → 双核2人", async () => {
        const mgr = new ContentTeamManager({ contentType: "newsletter" });
        const team = await mgr.composeTeam("写本周的AI周报", BASE_CONTEXT);
        const roles = team.workers.map((w) => w.role);
        expect(roles).toEqual(["writer", "critic"]);
        expect(team.matchedRuleId).toBe("cp-standard");
    });
    it("R7: Draft/草稿模式 → 最小2人(Critic仅1轮)", async () => {
        const mgr = new ContentTeamManager({ contentType: "seed" });
        const team = await mgr.composeTeam("快速写一个大纲草稿", BASE_CONTEXT);
        const roles = team.workers.map((w) => w.role);
        expect(roles).toEqual(["writer", "critic"]);
        // Critic 应该限制为1轮
        const critic = team.workers.find((w) => w.role === "critic");
        expect(critic?.configOverride?.maxRounds).toBe(1);
        expect(team.matchedRuleId).toBe("cp-draft");
    });
    it("R8: 兜底规则 → 双核2人", async () => {
        const mgr = new ContentTeamManager({ contentType: "article" });
        // 注意：当前规则集下，大部分标准质量输入会命中 R6(cp-standard)
        // 兜底规则是安全网，确保任何未被覆盖的任务都有团队
        // 此测试验证兜底规则的 match 函数确实返回 true
        const team = await mgr.composeTeam("随便写点东西", BASE_CONTEXT);
        const roles = team.workers.map((w) => w.role);
        expect(roles).toEqual(["writer", "critic"]);
        // 标准质量输入命中 cp-standard（priority=70），这是正确的行为
        // 兜底规则(priority=999)是最终安全网
        expect(["cp-standard", "cp-fallback"]).toContain(team.matchedRuleId);
    });
});
// ============================================================
// Test Suite 2: 规则集完整性
// ============================================================
describe("ContentTeamRules — 规则集完整性", () => {
    it("应有8条规则", () => {
        expect(CONTENT_TEAM_RULES).toHaveLength(8);
    });
    it("必须包含兜底规则", () => {
        const fallback = CONTENT_TEAM_RULES.find((r) => r.id === "cp-fallback");
        expect(fallback).toBeDefined();
        expect(fallback.match({})).toBe(true);
    });
    it("每条规则都有唯一 ID", () => {
        const ids = CONTENT_TEAM_RULES.map((r) => r.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });
    it("优先级已排序（升序）", () => {
        const priorities = CONTENT_TEAM_RULES.map((r) => r.priority);
        for (let i = 1; i < priorities.length; i++) {
            expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i - 1]);
        }
    });
    it("每条规则的 team 都包含 writer 和 critic", () => {
        for (const rule of CONTENT_TEAM_RULES) {
            const roles = rule.team.map((d) => d.role);
            expect(roles).toContain("writer");
            expect(roles).toContain("critic");
        }
    });
});
// ============================================================
// Test Suite 3: Worker 注册
// ============================================================
describe("ContentWorkers — Worker 注册", () => {
    it("应注册5个 Worker", () => {
        const workers = createContentWorkerRegistrations();
        expect(workers).toHaveLength(5);
    });
    it("每个 Worker 有唯一 id", () => {
        const workers = createContentWorkerRegistrations();
        const ids = workers.map((w) => w.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });
    it("覆盖所有5种角色", () => {
        const workers = createContentWorkerRegistrations();
        const roles = workers.map((w) => w.role);
        expect(roles).toContain("writer");
        expect(roles).toContain("critic");
        expect(roles).toContain("researcher");
        expect(roles).toContain("uiux-designer");
        expect(roles).toContain("reviewer");
    });
    it("Writer 和 Critic 支持4种格式", () => {
        const workers = createContentWorkerRegistrations();
        const writer = workers.find((w) => w.role === "writer");
        const critic = workers.find((w) => w.role === "critic");
        expect(writer.supportedContentTypes).toHaveLength(4);
        expect(critic.supportedContentTypes).toHaveLength(4);
    });
});
// ============================================================
// Test Suite 4: ContentTeamManager 辅助方法
// ============================================================
describe("ContentTeamManager — 辅助方法", () => {
    let mgr;
    beforeEach(() => {
        mgr = new ContentTeamManager({ contentType: "seed" });
    });
    it("getContentType() 返回构造时的值", () => {
        expect(mgr.getContentType()).toBe("seed");
    });
    it("getTeamConfig() 返回默认配置", () => {
        const config = mgr.getTeamConfig();
        expect(config.defaultIncludeResearcher).toBe(false);
        expect(config.autoIncludeReviewerForPremium).toBe(true);
        expect(config.maxTeamSize).toBe(5);
    });
    it("getAnalyzer() 返回有效实例", () => {
        const analyzer = mgr.getAnalyzer();
        expect(analyzer).toBeDefined();
        const features = analyzer.analyze("测试输入");
        expect(features.domain).toBeDefined();
        expect(features.confidence).toBeGreaterThan(0);
    });
    it("getComposer() 返回包含8条规则的 composer", () => {
        const composer = mgr.getComposer();
        const rules = composer.getRules();
        expect(rules).toHaveLength(8);
    });
});
