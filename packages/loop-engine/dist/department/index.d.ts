/**
 * Department Architecture (ADR-005) — 部门制抽象层
 *
 * 导出所有部门相关的类型和常量。
 *
 * 使用方式：
 * ```typescript
 * import {
 *   DepartmentConfig,
 *   ContentType,
 *   AgentProfile,
 *   OutputPipelineConfig,
 *   ProcessedOutput,
 * } from "@aicos/loop-engine";
 * ```
 */
export type { ContentType, PlatformType, WriterConstraints, CriticDimension, StyleGuide, AgentProfile, DepartmentGoalTemplate, OutputPostProcessor, PlatformAdapterProcessor, MetadataInjector, FormatConverter, QualityCheckerProcessor, OutputPipelineConfig, DimensionWeightOverride, ExtraDimension, QualityGateConfig, DepartmentConfig, ProcessedOutput, } from "./types.js";
export { CONTENT_TYPES } from "./types.js";
//# sourceMappingURL=index.d.ts.map