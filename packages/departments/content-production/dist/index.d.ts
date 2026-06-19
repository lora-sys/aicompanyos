/**
 * AI Company OS — 内容产出部 (Content Production Department)
 *
 * 第一个部门实现，基于 ADR-005 部门制架构。
 *
 * 提供 4 种内容格式的完整配置剖面：
 * - article: 图文/长文（公众号/知乎）
 * - seed: 种草/短图文（小红书）
 * - short-video: 短视频脚本（抖音/TikTok）
 * - newsletter: Newsletter/周报（Substack）
 *
 * 使用方式：
 * ```typescript
 * import { ContentProductionDepartment } from "@aicos/content-production";
 *
 * const dept = new ContentProductionDepartment();
 * const config = dept.getConfig("article"); // 返回完整的 DepartmentConfig
 *
 * // 注入 LoopHarness
 * const harness = new LoopHarness(tools, llmProvider, {
 *   departmentConfig: config,
 * });
 * ```
 */
import type { ContentType, DepartmentConfig } from "@aicos/loop-engine";
/**
 * 内容产出部 — AI Company OS 的第一个部门
 *
 * 职责：根据选定的内容格式，生成完整的 DepartmentConfig，
 * 包含 Agent 人格、评估维度、验收目标、输出管线、质量门槛。
 *
 * 设计原则：先做深再做广 — 第一个部门的抽象必须能正确支撑
 * 未来 R&D / Operations 等部门的扩展，而不是为图文写死逻辑。
 */
export declare class ContentProductionDepartment {
    /** 部门标识 */
    static readonly DEPARTMENT_ID = "content-production";
    /** 部门名称 */
    static readonly DEPARTMENT_NAME = "\u5185\u5BB9\u4EA7\u51FA\u90E8";
    /** 当前版本 */
    static readonly VERSION = "1.0.0";
    /** 支持的所有内容格式 */
    static readonly SUPPORTED_TYPES: readonly ContentType[];
    /**
     * 根据内容格式获取完整的部门配置
     *
     * @param contentType 内容格式类型
     * @returns 完整的 DepartmentConfig，可直接注入 LoopHarness
     */
    getConfig(contentType: ContentType): DepartmentConfig;
    /**
     * 获取所有可用的内容格式列表（用于 CLI 层展示选项）
     */
    getAvailableTypes(): Array<{
        type: ContentType;
        label: string;
        description: string;
    }>;
    /**
     * 构建指定格式的 AgentProfile
     */
    private buildAgentProfile;
}
/** 默认实例（单例模式，避免重复创建） */
export declare const contentProductionDept: ContentProductionDepartment;
export { OutputPipeline, createDefaultOutputPipeline } from "./output/pipeline.js";
export type { PipelineContext } from "./output/pipeline.js";
export { initDepartmentMemory } from "./memory-init.js";
export type { MemoryInitResult } from "./memory-init.js";
export { ContentTeamManager, CONTENT_TEAM_RULES, createContentWorkerRegistrations, registerContentWorkers, } from "./team/index.js";
export type { ContentWorkerConfig, ContentTeamConfig, ContentTeamContext, } from "./team/index.js";
