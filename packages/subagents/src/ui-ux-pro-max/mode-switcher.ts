// UI-UX-Pro-Max 模式切换器
// 统一管理 Skill 模式和 Agent 模式的切换与执行

import type { LLMProvider } from "@aicos/loop-engine/types";
import type {
  UIUXSkillInput,
  UIUXSkillOutput,
  UIUXAgentInput,
  UIUXAgentOutput,
} from "./types.js";
import { UIUXMode } from "./types.js";
import { UIUXProMaxSkill } from "./skill.js";
import { UIUXProMaxAgent } from "./agent.js";

export class UIUXModeSwitcher {
  private skill: UIUXProMaxSkill;
  private agent: UIUXProMaxAgent;
  private currentMode: UIUXMode = UIUXMode.SKILL;

  constructor(llm: LLMProvider) {
    this.skill = new UIUXProMaxSkill(llm);
    this.agent = new UIUXProMaxAgent(llm);
  }

  // 获取当前模式
  getMode(): UIUXMode {
    return this.currentMode;
  }

  // 切换到 Agent 模式（由 Consensus Lock 触发）
  switchToAgentMode(): void {
    this.currentMode = UIUXMode.AGENT;
  }

  // 切换回 Skill 模式
  switchToSkillMode(): void {
    this.currentMode = UIUXMode.SKILL;
  }

  // 统一执行入口（根据当前模式自动分发）
  async execute<
    T extends UIUXSkillOutput | UIUXAgentOutput,
  >(
    input: UIUXSkillInput | UIUXAgentInput
  ): Promise<T> {
    if (this.currentMode === UIUXMode.AGENT) {
      return this.asAgent(input as UIUXAgentInput) as Promise<T>;
    }
    return this.asSkill(input as UIUXSkillInput) as Promise<T>;
  }

  // 以 Skill 模式执行
  async asSkill(input: UIUXSkillInput): Promise<UIUXSkillOutput> {
    return this.skill.execute(input);
  }

  // 以 Agent 模式执行（支持自定义阈值）
  async asAgent(
    input: UIUXAgentInput,
    threshold?: number
  ): Promise<UIUXAgentOutput> {
    return this.agent.review(input, threshold);
  }
}
