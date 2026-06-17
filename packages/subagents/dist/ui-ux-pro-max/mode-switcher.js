// UI-UX-Pro-Max 模式切换器
// 统一管理 Skill 模式和 Agent 模式的切换与执行
import { UIUXMode } from "./types.js";
import { UIUXProMaxSkill } from "./skill.js";
import { UIUXProMaxAgent } from "./agent.js";
export class UIUXModeSwitcher {
    skill;
    agent;
    currentMode = UIUXMode.SKILL;
    constructor(llm) {
        this.skill = new UIUXProMaxSkill(llm);
        this.agent = new UIUXProMaxAgent(llm);
    }
    // 获取当前模式
    getMode() {
        return this.currentMode;
    }
    // 切换到 Agent 模式（由 Consensus Lock 触发）
    switchToAgentMode() {
        this.currentMode = UIUXMode.AGENT;
    }
    // 切换回 Skill 模式
    switchToSkillMode() {
        this.currentMode = UIUXMode.SKILL;
    }
    // 统一执行入口（根据当前模式自动分发）
    async execute(input) {
        if (this.currentMode === UIUXMode.AGENT) {
            return this.asAgent(input);
        }
        return this.asSkill(input);
    }
    // 以 Skill 模式执行
    async asSkill(input) {
        return this.skill.execute(input);
    }
    // 以 Agent 模式执行（支持自定义阈值）
    async asAgent(input, threshold) {
        return this.agent.review(input, threshold);
    }
}
//# sourceMappingURL=mode-switcher.js.map