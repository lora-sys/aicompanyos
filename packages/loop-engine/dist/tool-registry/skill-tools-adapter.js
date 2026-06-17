import { ToolCategory, } from "./types.js";
/**
 * Skills 适配器
 * 管理动态注册的技能工具（如 ui-ux-pro-max）
 */
export class SkillToolsAdapter {
    category = ToolCategory.SKILL;
    // 已注册的 Skills
    skills = new Map();
    /**
     * 注册一个 skill
     */
    registerSkill(name, description, handler) {
        const definition = {
            name,
            category: ToolCategory.SKILL,
            description,
            inputSchema: {
                type: "object",
                properties: {},
                // Skills 的参数由调用时动态决定，不预设 required
            },
        };
        this.skills.set(name, { definition, handler });
    }
    /**
     * 执行 skill 调用
     */
    async execute(request) {
        const startTime = Date.now();
        try {
            const skill = this.skills.get(request.toolName);
            if (!skill) {
                return {
                    success: false,
                    data: null,
                    error: `未注册的 skill: ${request.toolName}`,
                    durationMs: Date.now() - startTime,
                };
            }
            const data = await skill.handler(request.params);
            return {
                success: true,
                data,
                durationMs: Date.now() - startTime,
            };
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            return {
                success: false,
                data: null,
                error: error.message,
                durationMs: Date.now() - startTime,
            };
        }
    }
    /**
     * 获取已注册的 skills 列表
     */
    getRegisteredSkills() {
        return Array.from(this.skills.values()).map((s) => s.definition);
    }
}
//# sourceMappingURL=skill-tools-adapter.js.map