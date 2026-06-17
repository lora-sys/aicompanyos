import type { ExecutionPlan } from "../types.js";

// 验证输入
export interface VerifyInput {
  artifacts: string[]; // 产物文件路径列表
  originalTask: string;
  interrogationResults: Record<string, string>;
  plan: ExecutionPlan;
}

// 验证结果
export interface VerifyResult {
  passed: boolean;
  score: number; // 0-100
  reasons: string[];
  artifactChecks: Array<{
    path: string;
    exists: boolean;
    nonEmpty: boolean;
    qualityScore: number;
  }>;
}

// 验证配置
export interface VerifyConfig {
  threshold: number; // 通过阈值
  checkFileExistence: boolean;
  checkContentQuality: boolean; // LLM 审核
}
