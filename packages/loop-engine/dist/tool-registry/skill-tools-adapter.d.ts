import { ToolCategory, type ToolDefinition, type ToolExecuteRequest, type ToolExecuteResult, type ToolHandler } from "./types.js";
type SkillHandler = (params: Record<string, unknown>) => Promise<unknown>;
/**
 * Skills 适配器
 * 管理动态注册的技能工具（如 ui-ux-pro-max）
 */
export declare class SkillToolsAdapter implements ToolHandler {
    category: ToolCategory;
    private skills;
    /**
     * 注册一个 skill
     */
    registerSkill(name: string, description: string, handler: SkillHandler): void;
    /**
     * 执行 skill 调用
     */
    execute(request: ToolExecuteRequest): Promise<ToolExecuteResult>;
    /**
     * 获取已注册的 skills 列表
     */
    getRegisteredSkills(): ToolDefinition[];
}
export {};
//# sourceMappingURL=skill-tools-adapter.d.ts.map