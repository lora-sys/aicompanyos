// Subagent 实现
// Writer/Critic/UI-UX-Pro-Max/Evolution/Researcher

// UI-UX-Pro-Max 导出
export {
  UIUXProMaxSkill,
  UIUXProMaxAgent,
  UIUXModeSwitcher,
  UIUXMode,
  type UIUXSkillInput,
  type UIUXSkillOutput,
  type UIUXAgentInput,
  type UIUXAgentOutput,
} from "./ui-ux-pro-max/index.js";

// Writer Agent 导出
export { WriterAgent } from "./writer/agent.js";
export type { WriterInput, WriterOutput } from "./writer/types.js";

// Critic Agent 导出
export { CriticAgent } from "./critic/agent.js";
export type { CriticInput, CriticOutput } from "./critic/types.js";

// Researcher Agent 导出（Loop Engineering: MCP 搜索）
export { ResearcherAgent } from "./researcher/agent.js";
export type { ResearcherInput, ResearcherOutput, ResearchSource } from "./researcher/types.js";
