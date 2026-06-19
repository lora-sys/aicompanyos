/**
 * Content Production Department — 团队经理
 *
 * 实现 ITeamManager 接口的内容产出部版本。
 *
 * 职责：
 * 1. 使用通用的 TaskAnalyzer 提取任务特征
 * 2. 使用内容部门专属的 CONTENT_TEAM_RULES 匹配规则
 * 3. 将团队结果与部门的 DepartmentConfig 关联
 * 4. 支持将 Worker 注册到全局 Registry
 *
 * 文件位置：packages/departments/content-production/src/team/content-team-manager.ts
 */
import type { ITeamManager, ITeam, TeamContext, AgentFactory, IWorkerRegistry } from "@aicos/loop-engine";
import type { ContentTeamConfig } from "./types.js";
/**
 * 内容产出部团队经理
 *
 * 继承通用 TeamManager，注入内容部门专属规则和配置。
 *
 * 使用方式：
 * ```typescript
 * const mgr = new ContentTeamManager({ contentType: "seed" });
 * const team = await mgr.composeTeam("写一篇夏日防晒种草笔记", {});
 * // team.workers → [writer, critic, uiux-designer]
 *
 * // 注册 Workers 到全局 Registry
 * mgr.registerWorkers(globalWorkerRegistry);
 * ```
 */
export declare class ContentTeamManager implements ITeamManager {
    private inner;
    private teamConfig;
    private contentType;
    constructor(config: {
        contentType: import("@aicos/loop-engine").ContentType;
        teamConfig?: Partial<ContentTeamConfig>;
    });
    /**
     * 分析任务特征 + 组建团队（实现 ITeamManager 接口）
     *
     * 与通用 TeamManager 的区别：
     * - 自动注入 contentType 到 context
     * - 应用部门级用户偏好（如 targetPlatform）
     * - 日志中包含部门标识
     */
    composeTeam(taskInput: string, context?: TeamContext): Promise<ITeam>;
    /**
     * 将团队的 Worker 配置转换为工厂函数 Map
     *
     * 返回的 Map 包含此团队的 agentType 列表，
     * 实际 Factory 由调用方（CLI / LoopHarness）注入。
     */
    createWorkerFactories(team: ITeam): Map<string, AgentFactory>;
    /**
     * 注册内容产出部的所有 Worker 到指定 Registry
     *
     * @param registry 目标 Registry（默认使用全局实例需手动导入）
     */
    registerWorkers(registry: IWorkerRegistry): void;
    /** 获取内部的 TaskAnalyzer（用于调试或预检） */
    getAnalyzer(): import("@aicos/loop-engine").TaskAnalyzer;
    /** 获取内部的 TeamComposer（用于查看规则） */
    getComposer(): import("@aicos/loop-engine").TeamComposer;
    /** 获取当前团队配置 */
    getTeamConfig(): Readonly<ContentTeamConfig>;
    /** 获取关联的内容格式 */
    getContentType(): import("@aicos/loop-engine").ContentType;
}
