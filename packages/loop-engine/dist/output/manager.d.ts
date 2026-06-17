import { Artifact, ArtifactManagerConfig, HTMLStyleConfig } from "./types.js";
/**
 * 产物管理器
 * 负责创建、读取、列出输出产物
 */
export declare class ArtifactManager {
    private readonly outputDir;
    constructor(config?: Partial<ArtifactManagerConfig>);
    /**
     * 创建产物
     * 将内容写入文件并返回产物元信息
     */
    createArtifact(params: {
        name: string;
        content: string;
        type: Artifact["type"];
    }): Promise<Artifact>;
    /**
     * 读取产物
     * 根据名称读取产物内容与元信息
     */
    readArtifact(name: string): Promise<Artifact | null>;
    /**
     * 列出所有产物
     * 扫描输出目录，返回所有已保存的产物列表
     */
    listArtifacts(): Promise<Artifact[]>;
    /**
     * 获取产物文件路径
     */
    getPath(name: string): string;
    /**
     * 确保输出目录存在
     * 不存在则递归创建
     */
    private ensureOutputDir;
    /**
     * 扫描输出目录中的所有产物
     */
    private scanArtifacts;
    /**
     * 从文件名推断产物类型
     */
    private inferType;
    /**
     * 从 Markdown 内容生成 HTML 产物
     *
     * **风格不是写死的！** 样式通过 styleConfig 参数从 Loop 进化链注入：
     * - UIUXProMaxSkill → design.mdx → createHTMLArtifact(styleConfig)
     * - 不传 styleConfig 则使用 DEFAULT_STYLE_CONFIG（暗色主题 fallback）
     *
     * 结构性 CSS（布局规则）固定不变；视觉 CSS（颜色/字体/间距）可进化
     */
    createHTMLArtifact(params: {
        name: string;
        markdownContent: string;
        title?: string;
        metadata?: Record<string, string>;
        /** 🔄 可选：来自 UIUXProMaxSkill / design.mdx 的进化风格 */
        styleConfig?: Partial<HTMLStyleConfig>;
    }): Promise<Artifact>;
    /**
     * 深度合并样式配置：用户传入的值覆盖默认值
     */
    private mergeStyleConfig;
    /**
     * 将 Markdown 渲染为带样式的独立 HTML 页面
     *
     * **结构模板固定，视觉 token 可进化**
     * - 结构性规则（flexbox、grid、media queries）不变
     * - 视觉变量（颜色/字体/间距）从 styleConfig 注入
     */
    private renderMarkdownToHTML;
    /**
     * 基础 Markdown → HTML 转换器（无外部依赖）
     */
    private convertMarkdown;
    /**
     * 内联格式化：bold, italic, inline code, links
     */
    private inlineFormat;
    private escapeHtml;
}
//# sourceMappingURL=manager.d.ts.map