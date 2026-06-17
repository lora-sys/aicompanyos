import type { LLMProvider } from "@aicos/loop-engine/types";
import type { UIUXSkillInput, UIUXSkillOutput, UIUXAgentInput, UIUXAgentOutput } from "./types.js";
import { UIUXMode } from "./types.js";
export declare class UIUXModeSwitcher {
    private skill;
    private agent;
    private currentMode;
    constructor(llm: LLMProvider);
    getMode(): UIUXMode;
    switchToAgentMode(): void;
    switchToSkillMode(): void;
    execute<T extends UIUXSkillOutput | UIUXAgentOutput>(input: UIUXSkillInput | UIUXAgentInput): Promise<T>;
    asSkill(input: UIUXSkillInput): Promise<UIUXSkillOutput>;
    asAgent(input: UIUXAgentInput, threshold?: number): Promise<UIUXAgentOutput>;
}
//# sourceMappingURL=mode-switcher.d.ts.map