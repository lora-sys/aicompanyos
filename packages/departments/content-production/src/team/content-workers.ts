/**
 * Content Production Department — 部门专属 Worker 定义
 *
 * 定义内容产出部注册到全局 WorkerRegistry 的 Worker。
 * 每个 Worker 对应一种 Agent 实现，带有内容部门特有的配置。
 *
 * 文件位置：packages/departments/content-production/src/team/content-workers.ts
 */

import type { WorkerRegistration, AgentFactory } from "@aicos/loop-engine";

// ============================================================
// Worker 注册工厂函数
// ============================================================

/**
 * 创建内容产出部的基础 Worker 注册列表
 *
 * 这些是部门启动时注册到 globalWorkerRegistry 的 Worker。
 * 实际的 AgentFactory 由 CLI 层或 LoopHarness 注入。
 *
 * 设计原则：
 * - 此处只定义「有哪些 Worker 可用」和它们的元数据
 * - 不绑定具体的 Agent 实例（解耦）
 * - factory 使用 null 占位，由调用方替换
 */
export function createContentWorkerRegistrations(): WorkerRegistration[] {
  return [
    {
      id: "cp-writer-primary",
      role: "writer",
      agentType: "writer",
      defaultFactory: null as unknown as AgentFactory,
      supportedContentTypes: ["article", "seed", "short-video", "newsletter"],
      description: "内容产出部主写手，支持全部4种内容格式",
    },
    {
      id: "cp-critic-primary",
      role: "critic",
      agentType: "critic",
      defaultFactory: null as unknown as AgentFactory,
      supportedContentTypes: ["article", "seed", "short-video", "newsletter"],
      description: "内容产出部审核员，支持全格式质量评估",
    },
    {
      id: "cp-researcher-primary",
      role: "researcher",
      agentType: "researcher",
      defaultFactory: null as unknown as AgentFactory,
      supportedContentTypes: ["article", "newsletter"],
      description: "内容调研员，负责外部信息搜集和数据验证",
    },
    {
      id: "cp-uiux-designer-primary",
      role: "uiux-designer",
      agentType: "ui-ux",
      defaultFactory: null as unknown as AgentFactory,
      supportedContentTypes: ["seed", "short-video"],
      description: "视觉设计师，负责卡片/封面/分镜脚本设计",
    },
    {
      id: "cp-reviewer-primary",
      role: "reviewer",
      agentType: "reviewer",
      defaultFactory: null as unknown as AgentFactory,
      supportedContentTypes: ["article", "newsletter"],
      description: "最终审查员，Premium 内容的质量把关",
    },
  ];
}

/**
 * 将 Worker 注册到全局 Registry
 *
 * @param registry 目标 WorkerRegistry 实例
 */
export function registerContentWorkers(
  registry: import("@aicos/loop-engine").IWorkerRegistry,
): void {
  const workers = createContentWorkerRegistrations();
  for (const w of workers) {
    registry.register(w);
  }
}
