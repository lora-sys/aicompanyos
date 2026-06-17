import type { ExecutionPlan } from "../types.js";

// 规划引擎输入
export interface PlanGenerationInput {
  taskInput: string;
  interrogationResults: Record<string, string>; // 拷问结果
  availableAgents: string[]; // 可用的 Agent 列表
  availableTools: string[]; // 可用的工具列表
}

// 规划引擎输出
export interface PlanGenerationResult {
  plan: ExecutionPlan;
  reasoning: string; // LLM 的规划理由
}
