/**
 * 内容产出部 — Output Pipeline（输出后处理管线）
 *
 * 将 LoopModule 产出的原始 Markdown 转换为平台适配格式。
 *
 * 处理链（按顺序执行）：
 *   FormatConverter → MetadataInjector → PlatformAdapter → QualityChecker
 *
 * 使用方式：
 * ```typescript
 * import { OutputPipeline } from "@aicos/content-production/output";
 *
 * const pipeline = new OutputPipeline(departmentConfig.outputPipeline);
 * const result = await pipeline.process(rawMarkdownContent, context);
 * // result.processedContent = 平台适配后的最终内容
 * ```
 */
import type { OutputPipelineConfig, ProcessedOutput } from "@aicos/loop-engine";
/** Pipeline 处理上下文 */
export interface PipelineContext {
    /** 原始内容（LoopModule 产出） */
    rawContent: string;
    /** 元数据（标题/作者/日期等） */
    metadata?: Record<string, unknown>;
    /** 输出文件基础路径（不含扩展名） */
    outputPath?: string;
    /** 任务 ID（用于日志） */
    taskId?: string;
}
/**
 * Output Pipeline — 产出后处理管线
 *
 * 按 postProcessors 数组顺序依次执行每个处理器，
 * 记录每步的执行结果，返回最终的 ProcessedOutput。
 */
export declare class OutputPipeline {
    private config;
    constructor(config: OutputPipelineConfig);
    /**
     * 执行完整的输出处理管线
     *
     * @param rawContent 原始 Markdown 内容
     * @param context 处理上下文
     * @returns 处理结果（包含处理后内容和执行日志）
     */
    process(rawContent: string, context: PipelineContext): Promise<ProcessedOutput>;
    /**
     * 推断最终输出格式
     */
    private inferFinalFormat;
    /**
     * 推断目标平台
     */
    private inferPlatform;
}
import type { ContentType } from "@aicos/loop-engine";
/**
 * 根据内容格式创建默认的 OutputPipelineConfig
 *
 * @param contentType 内容格式
 * @param metadata 可选元数据（标题/作者等）
 * @returns 配置好的 OutputPipelineConfig
 */
export declare function createDefaultOutputPipeline(contentType: ContentType, metadata?: Record<string, unknown>): OutputPipelineConfig;
