import { LoopHarness, type ITeam, type LLMProvider, type ContentType, type DepartmentConfig, ToolRegistry } from "@aicos/loop-engine";
import { ContentProductionDepartment } from "@aicos/content-production";
import { WriterAgent } from "@aicos/subagents/writer";
import { CriticAgent } from "@aicos/subagents/critic";
/** DepartmentSetup 依赖注入 */
export interface DepartmentSetupDeps {
    loopHarness: LoopHarness;
    llmProvider: LLMProvider;
    toolRegistry: ToolRegistry;
    writerAgent: WriterAgent;
    criticAgent: CriticAgent;
    addLog: (level: string, tag: string, msg: string) => void;
    getTaskInput: () => string;
}
/**
 * 部门设置协调器
 *
 * 封装 ADR-005 部门路由核心逻辑：
 * 1. 内容类型选择与部门配置获取
 * 2. LoopHarness 部门配置注入
 * 3. Writer/Critic Prompt 注入
 * 4. 动态团队组建与 Agent 注册
 */
export declare class DepartmentSetup {
    private deps;
    private contentDept;
    private activeDepartmentConfig;
    private activeTeam;
    private selectedContentType;
    constructor(deps: DepartmentSetupDeps);
    /** 获取当前激活的部门配置 */
    getActiveConfig(): DepartmentConfig | null;
    /** 获取当前动态团队 */
    getActiveTeam(): ITeam | null;
    /** 获取当前选中的内容类型 */
    getSelectedContentType(): ContentType | null;
    /** 获取内容产出部实例（供 showContentTypeMenu 等使用） */
    getContentDept(): ContentProductionDepartment;
    /**
     * 选择内容格式并加载对应部门配置
     *
     * ADR-005 部门路由核心方法：
     * 1. 根据 contentType 获取 DepartmentConfig
     * 2. 将配置注入 LoopHarness
     * 3. 将 Writer Prompt 注入 WriterAgent
     * 4. 将 Critic 维度注入 CriticAgent
     * 5. 动态团队组建与 Agent 注册
     */
    selectContentType(type: string | ContentType): Promise<void>;
    /**
     * Phase F: 注册动态团队中的单个 Worker。
     * - researcher → 使用现有的 ResearcherAgent（支持 MCP Exa 搜索）
     * - ui-ux / uiux-designer → 使用 UIUXProMaxAgent（桥接为 AgentExecutor）
     * - reviewer → 使用 ReviewerAgent（最终审查角色）
     * - 其他角色 → 回退到 GenericAgent
     */
    private registerDynamicWorker;
    /** 根据 agentType 构建 GenericAgent 的系统提示（可扩展为部门专属 Prompt） */
    private buildGenericAgentPrompt;
}
//# sourceMappingURL=department-setup.d.ts.map