/**
 * TeamManager — 团队经理（编排器）
 *
 * 组合 TaskAnalyzer + TeamComposer + WorkerRegistry，
 * 提供 composeTeam() 和 createWorkerFactories() 两个核心方法。
 *
 * 这是纯编排层：
 * - 不执行 LLM 调用
 * - 不创建 Agent 实例
 * - 只做特征提取 + 规则匹配 + 工厂生成
 *
 * 文件位置：packages/loop-engine/src/team/team-manager.ts
 */
import type { ITeam, ITeamManager, TeamContext, AgentFactory, WorkerFactoryDeps } from "./types.js";
import { TaskAnalyzer } from "./task-analyzer.js";
import { TeamComposer } from "./team-composer.js";
import type { IWorkerRegistry } from "./types.js";
/**
 * 团队经理 — 动态团队编排的核心类
 *
 * 使用方式：
 * ```typescript
 * const manager = new TeamManager({ rules: MY_RULES });
 * const team = await manager.composeTeam("写一篇深度技术文章", { departmentId: "content-production" });
 * const factories = manager.createWorkerFactories(team);
 * // factories 可直接用于 LoopHarness.registerAgent()
 * ```
 */
export declare class TeamManager implements ITeamManager {
    private analyzer;
    private composer;
    private registry;
    private lastTeam;
    constructor(config: {
        rules: import("./types.js").TeamCompositionRule[];
        customAnalyzer?: TaskAnalyzer;
        registry?: IWorkerRegistry;
    });
    /**
     * 分析任务特征 + 组建团队（核心方法）
     *
     * 流程：
     * 1. TaskAnalyzer.analyze(input) → TaskFeatures
     * 2. TeamComposer.compose(features) → TeamWorkerDef[]
     * 3. 转换为 ITeam 对象
     *
     * @param taskInput 用户的原始任务输入
     * @param context 团队上下文
     * @returns 组装好的团队
     */
    composeTeam(taskInput: string, context: TeamContext): Promise<ITeam>;
    /**
     * 将团队的 Worker 配置转换为 LoopHarness 所需的工厂函数 Map
     *
     * 注意：此方法返回的是**空的 Map**（只有 key）。
     * 实际的 Factory 函数由调用方在注册 Agent 时提供。
     * 这是因为 TeamManager 不持有 Agent 的具体实现，
     * 工厂函数的实现属于 departments 层或 CLI 层。
     *
     * @param team composeTeam() 返回的团队
     * @returns agentType 字符串 → 空占位（需调用方填充实际 factory）
     */
    createWorkerFactories(team: ITeam): Map<string, AgentFactory>;
    /**
     * 返回团队中各 Worker 的 AgentFactory 映射（由 CLI 层调用）
     *
     * 遍历当前团队的 workers，从 WorkerRegistry 获取 defaultFactory，
     * 如果 factory 存在且是函数，包装为 (ctx) => agent 格式返回。
     * writer/critic 的 factory 由 LoopHarness.registerAgent 管理，不在此处返回。
     *
     * @param deps Worker 工厂依赖（LLM Provider + ToolRegistry）
     * @returns agentType → AgentFactory 的映射
     */
    createWorkerFactoriesWithDeps(deps: WorkerFactoryDeps): Record<string, AgentFactory>;
    /**
     * 获取内部的分析器（用于自定义规则或调试）
     */
    getAnalyzer(): TaskAnalyzer;
    /**
     * 获取内部的组合器（用于查看规则等）
     */
    getComposer(): TeamComposer;
    /** 应用用户偏好到特征上 */
    private applyUserPreferences;
    /** 生成团队目标描述 */
    private generateGoal;
}
//# sourceMappingURL=team-manager.d.ts.map