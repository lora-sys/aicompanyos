/**
 * GoalTemplateRegistry — 验收目标自动模板匹配
 *
 * 当 PlanStep.metadata 中没有显式定义 acceptanceGoals 时，
 * 根据 step 的 agentType 和 description 自动生成默认验收目标。
 *
 * 设计原则：
 * - writer 类型的 step 自动获得代码/内容验证目标
 * - critic/ui-ux 类型不生成（它们不是产出型 step）
 * - 模板可扩展：通过 registerTemplate() 注册自定义模板
 */
import type { AcceptanceGoal } from "./types.js";
/** 目标模板 — 根据上下文生成具体的 AcceptanceGoal */
export interface GoalTemplate {
    /** 匹配条件 */
    match: {
        /** 匹配的 agentType（* 表示全部） */
        agentType: string | "*";
        /** description 中的关键词（任一匹配即触发，空数组表示无条件） */
        keywords?: string[];
        /** description 中的反关键词（包含则排除） */
        antiKeywords?: string[];
    };
    /** 生成的目标列表工厂 */
    generate: (stepId: string, description: string) => AcceptanceGoal[];
}
export declare class GoalTemplateRegistry {
    private builtinTemplates;
    private customTemplates;
    constructor();
    /** 注册自定义模板（自定义模板优先于内置模板匹配） */
    registerTemplate(template: GoalTemplate): void;
    /**
     * 根据 step 信息生成验收目标
     *
     * @param stepId Step ID
     * @param agentType Agent 类型 (writer/critic/ui-ux)
     * @param description Step 描述
     * @returns 生成的 AcceptanceGoal 列表（无匹配则返回空数组）
     */
    generateGoals(stepId: string, agentType: string, description: string): AcceptanceGoal[];
    /** 检查模板是否匹配 */
    private matchesTemplate;
    private registerBuiltinTemplates;
    /** 代码实现类目标的默认集合 */
    private generateCodeGoals;
    /** 文章/内容写作类目标的默认集合 */
    private generateArticleGoals;
    /** UI/前端页面类目标的默认集合 */
    private generateUIGoals;
    /** 通用 Writer 兜底目标 */
    private generateGenericWriterGoals;
}
//# sourceMappingURL=goal-templates.d.ts.map