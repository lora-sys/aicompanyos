import { readFile, writeFile, mkdir, readdir, stat, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Artifact, ArtifactManagerConfig, ArtifactType, HTMLStyleConfig } from "./types.js";

const DEFAULT_OUTPUT_DIR = "./artifacts";

// ============================================================
// 默认视觉样式 — 仅作为首次运行或无 UIUX 输出时的 fallback
// 正常流程中，此默认值会被 UIUXProMaxSkill / design.mdx 的输出覆盖
// ============================================================

const DEFAULT_STYLE_CONFIG: HTMLStyleConfig = {
  theme: "dark",
  colors: {
    bgPrimary: "#0d1117",
    bgSecondary: "#161b22",
    bgTertiary: "#21262d",
    textPrimary: "#e6edf3",
    textSecondary: "#8b949e",
    accent: "#58a6ff",
    accentDim: "#1f6feb",
    success: "#3fb950",
    warning: "#d29922",
    danger: "#f85149",
    border: "#30363d",
    codeBg: "#161b22",
  },
  typography: {
    font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif",
    mono: "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
    headingSizes: { h1: "2.5rem", h2: "1.75rem", h3: "1.35rem", h4: "1.1rem" },
    lineHeight: "1.7",
    baseFontSize: "16px",
  },
  layout: {
    maxWidth: "900px",
    padding: "2rem 1rem",
    borderRadius: "8px",
  },
  source: "default-fallback", // 标记来源：方便追踪风格是否经过进化
};

/**
 * 产物管理器
 * 负责创建、读取、列出输出产物
 */
export class ArtifactManager {
  private readonly outputDir: string;

  constructor(config?: Partial<ArtifactManagerConfig>) {
    this.outputDir = resolve(config?.outputDir ?? DEFAULT_OUTPUT_DIR);
  }

  /**
   * 创建产物
   * 将内容写入文件并返回产物元信息
   */
  async createArtifact(params: {
    name: string;
    content: string;
    type: Artifact["type"];
  }): Promise<Artifact> {
    await this.ensureOutputDir();

    const filePath = this.getPath(params.name);

    await writeFile(filePath, params.content, "utf-8");

    const fileStat = await stat(filePath);

    const artifact: Artifact = {
      name: params.name,
      path: filePath,
      type: params.type,
      content: params.content,
      createdAt: new Date().toISOString(),
      sizeBytes: fileStat.size,
    };

    return artifact;
  }

  /**
   * 读取产物
   * 根据名称读取产物内容与元信息
   */
  async readArtifact(name: string): Promise<Artifact | null> {
    const filePath = this.getPath(name);

    try {
      const [content, fileStat] = await Promise.all([
        readFile(filePath, "utf-8"),
        stat(filePath),
      ]);

      return {
        name,
        path: filePath,
        type: this.inferType(name) as ArtifactType,
        content,
        // 使用文件的修改时间作为创建时间的近似值
        createdAt: fileStat.birthtime.toISOString(),
        sizeBytes: fileStat.size,
      };
    } catch {
      return null;
    }
  }

  /**
   * 列出所有产物
   * 扫描输出目录，返回所有已保存的产物列表
   */
  listArtifacts(): Promise<Artifact[]> {
    return this.scanArtifacts();
  }

  /**
   * 获取产物文件路径
   */
  getPath(name: string): string {
    return join(this.outputDir, name);
  }

  /**
   * 清理所有产物
   * 删除输出目录中的所有文件，下次写入时自动重建
   */
  async clearArtifacts(): Promise<void> {
    try {
      await rm(this.outputDir, { recursive: true, force: true });
    } catch {
      // 目录不存在时忽略
    }
  }

  /**
   * 确保输出目录存在
   * 不存在则递归创建
   */
  private async ensureOutputDir(): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
  }

  /**
   * 扫描输出目录中的所有产物
   */
  private async scanArtifacts(): Promise<Artifact[]> {
    await this.ensureOutputDir();

    let entries: string[];
    try {
      entries = await readdir(this.outputDir);
    } catch {
      return [];
    }

    const artifacts: Artifact[] = [];

    for (const entry of entries) {
      const artifact = await this.readArtifact(entry);
      if (artifact !== null) {
        artifacts.push(artifact);
      }
    }

    // 按创建时间倒序排列
    artifacts.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return artifacts;
  }

  /**
   * 从文件名推断产物类型
   */
  private inferType(filename: string): string {
    if (filename.endsWith(".md") || filename.endsWith(".markdown")) {
      if (filename.includes("blog") || filename.includes("article")) return "blog";
      if (filename.includes("design") || filename.includes("spec")) return "design-doc";
    }
    if (filename.includes("tweet") || filename.includes("post")) return "tweet";
    if (filename.endsWith(".html") || filename.endsWith(".htm")) return "html";
    return "generic";
  }

  /**
   * 从 Markdown 内容生成 HTML 产物
   *
   * **风格不是写死的！** 样式通过 styleConfig 参数从 Loop 进化链注入：
   * - UIUXProMaxSkill → design.mdx → createHTMLArtifact(styleConfig)
   * - 不传 styleConfig 则使用 DEFAULT_STYLE_CONFIG（暗色主题 fallback）
   *
   * 结构性 CSS（布局规则）固定不变；视觉 CSS（颜色/字体/间距）可进化
   */
  async createHTMLArtifact(params: {
    name: string;
    markdownContent: string;
    title?: string;
    metadata?: Record<string, string>;
    /** 🔄 可选：来自 UIUXProMaxSkill / design.mdx 的进化风格 */
    styleConfig?: Partial<HTMLStyleConfig>;
  }): Promise<Artifact> {
    // 合并样式：传入的 > 默认值（只覆盖提供的字段）
    const resolvedStyle: HTMLStyleConfig = this.mergeStyleConfig(
      params.styleConfig ?? {}
    );

    const htmlContent = this.renderMarkdownToHTML(
      params.markdownContent,
      params.title,
      params.metadata,
      resolvedStyle
    );

    // 同时保存原始 Markdown 为 .md 文件
    const mdName = params.name.replace(/\.html$/, '.md');
    await this.createArtifact({ name: mdName, content: params.markdownContent, type: this.inferType(mdName) as Artifact["type"] });

    // 创建 HTML 文件
    return this.createArtifact({
      name: params.name,
      content: htmlContent,
      type: "html",
    });
  }

  /**
   * 深度合并样式配置：用户传入的值覆盖默认值
   */
  private mergeStyleConfig(override: Partial<HTMLStyleConfig>): HTMLStyleConfig {
    return {
      theme: override.theme ?? DEFAULT_STYLE_CONFIG.theme,
      source: override.source ?? "evolved",
      colors: { ...DEFAULT_STYLE_CONFIG.colors, ...override.colors },
      typography: {
        ...DEFAULT_STYLE_CONFIG.typography,
        ...override.typography,
        headingSizes: { ...DEFAULT_STYLE_CONFIG.typography.headingSizes, ...override.typography?.headingSizes },
      },
      layout: { ...DEFAULT_STYLE_CONFIG.layout, ...override.layout },
    };
  }

  /**
   * 将 Markdown 渲染为带样式的独立 HTML 页面
   *
   * **结构模板固定，视觉 token 可进化**
   * - 结构性规则（flexbox、grid、media queries）不变
   * - 视觉变量（颜色/字体/间距）从 styleConfig 注入
   */
  private renderMarkdownToHTML(
    markdown: string,
    title?: string,
    metadata?: Record<string, string>,
    styleConfig: HTMLStyleConfig = DEFAULT_STYLE_CONFIG,
  ): string {
    // 简单的 Markdown → HTML 转换（处理标题、代码块、表格、引用、列表等）
    let html = this.convertMarkdown(markdown);

    const metaStr = metadata
      ? Object.entries(metadata).map(([k,v]) => `<meta name="${k}" content="${this.escapeHtml(v)}">`).join('\n    ')
      : '';

    // === 从 styleConfig 动态生成 CSS 变量 ===
    const c = styleConfig.colors;
    const t = styleConfig.typography;
    const l = styleConfig.layout;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${metaStr}
  <title>${this.escapeHtml(title ?? 'AI Company OS Output')}</title>
  <style>
    /* =========================================================
     * AI Company OS — Dynamic Style Output
     * source: ${styleConfig.source} | theme: ${styleConfig.theme}
     *
     * 视觉 token 从 Loop 进化链注入 (UIUXProMaxSkill → design.mdx)
     * 结构性布局规则固定不变
     * ========================================================= */

    :root {
      /* === Colors (from UIUX evolution) === */
      --bg-primary: ${c.bgPrimary};
      --bg-secondary: ${c.bgSecondary};
      --bg-tertiary: ${c.bgTertiary};
      --text-primary: ${c.textPrimary};
      --text-secondary: ${c.textSecondary};
      --accent: ${c.accent};
      --accent-dim: ${c.accentDim};
      --success: ${c.success};
      --warning: ${c.warning};
      --danger: ${c.danger};
      --border: ${c.border};
      --code-bg: ${c.codeBg};

      /* === Typography (from UIUX evolution) === */
      --font: ${t.font};
      --mono: ${t.mono};
      --line-height: ${t.lineHeight};
      --base-font-size: ${t.baseFontSize};
      --h1-size: ${t.headingSizes.h1};
      --h2-size: ${t.headingSizes.h2};
      --h3-size: ${t.headingSizes.h3};
      --h4-size: ${t.headingSizes.h4};

      /* === Layout (from UIUX evolution) === */
      --max-width: ${l.maxWidth};
      --padding: ${l.padding};
      --radius: ${l.borderRadius};
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font);
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: var(--line-height);
      font-size: var(--base-font-size);
      padding: var(--padding);
    }

    .container { max-width: var(--max-width); margin: 0 auto; }

    header {
      text-align: center;
      padding: 3rem 0 2rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 2rem;
    }

    h1 { font-size: 2.5rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text-primary); }
    h2 { font-size: 1.75rem; font-weight: 600; margin-top: 2.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); color: var(--accent); }
    h3 { font-size: 1.35rem; font-weight: 600; margin-top: 2rem; color: var(--text-primary); }
    h4 { font-size: 1.1rem; font-weight: 600; margin-top: 1.5rem; color: var(--text-secondary); }

    p { margin-bottom: 1rem; color: var(--text-primary); }

    blockquote {
      border-left: 4px solid var(--accent);
      background: var(--bg-secondary);
      padding: 1rem 1.5rem;
      margin: 1.5rem 0;
      border-radius: 0 var(--radius) var(--radius) 0;
      color: var(--text-secondary);
    }

    code {
      font-family: var(--mono);
      background: var(--code-bg);
      padding: 0.15em 0.4em;
      border-radius: 4px;
      font-size: 0.88em;
      color: var(--warning);
    }

    pre {
      background: var(--bg-secondary) !important;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      overflow-x: auto;
      margin: 1.5rem 0;
      position: relative;
    }

    pre code {
      background: none !important;
      padding: 0;
      color: var(--text-primary);
      font-size: 0.88rem;
      line-height: 1.6;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
      background: var(--bg-secondary);
      border-radius: var(--radius);
      overflow: hidden;
    }

    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      background: var(--bg-tertiary);
      font-weight: 600;
      color: var(--accent);
    }

    tr:last-child td { border-bottom: none; }

    ul, ol { padding-left: 1.5rem; margin-bottom: 1rem; }
    li { margin-bottom: 0.35rem; color: var(--text-primary); }

    strong { color: var(--text-primary); font-weight: 600; }
    em { color: var(--text-secondary); }

    hr { border: none; border-top: 1px solid var(--border); margin: 2.5rem 0; }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Metadata badge bar */
    .meta-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: center;
      margin-top: 1rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    footer {
      text-align: center;
      padding: 2rem 0 1rem;
      margin-top: 3rem;
      border-top: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 0.85rem;
    }

    @media (max-width: 640px) {
      body { padding: 1rem 0.5rem; font-size: 14px; }
      h1 { font-size: 1.75rem; }
      h2 { font-size: 1.4rem; }
      pre { padding: 0.75rem; font-size: 0.82rem; }
      table { font-size: 0.85rem; }
      th, td { padding: 0.5rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.escapeHtml(title ?? 'AI Company OS')}</h1>
      ${metadata ? `<div class="meta-bar">${Object.entries(metadata).map(([k,v]) => `<span class="badge">${this.escapeHtml(k)}: ${this.escapeHtml(v)}</span>`).join('')}</div>` : ''}
    </header>
    <main>
${html}
    </main>
    <footer>
      Generated by <strong>AI Company OS</strong> — Loop-Driven AI Execution Harness<br>
      Style source: <em>${this.escapeHtml(styleConfig.source)}</em> | Theme: <em>${this.escapeHtml(styleConfig.theme)}</em><br>
      ${new Date().toISOString().split('T')[0]}
    </footer>
  </div>
</body>
</html>`;
  }

  /**
   * 基础 Markdown → HTML 转换器（无外部依赖）
   */
  private convertMarkdown(md: string): string {
    const lines = md.split('\n');
    const result: string[] = [];
    let inCodeBlock = false;
    let codeLang = '';
    let codeLines: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          // Close code block
          result.push(`<pre><code class="language-${codeLang}">${this.escapeHtml(codeLines.join('\n'))}</code></pre>`);
          codeLines = [];
          inCodeBlock = false;
        } else {
          // Open code block
          codeLang = line.slice(3).trim();
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Tables
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        if (cells.every(c => /^[-:]+$/.test(c))) {
          continue; // Skip separator row
        }
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        const tag = tableRows.length === 0 ? 'th' : 'td';
        tableRows.push('<tr>' + cells.map(c => `<${tag}>${this.inlineFormat(c)}</${tag}>`).join('') + '</tr>');

        // Check if next line is not a table row
        if (i + 1 >= lines.length || (!lines[i + 1].trim().startsWith('|'))) {
          result.push('<table>' + tableRows.join('\n') + '</table>');
          tableRows = [];
          inTable = false;
        }
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        result.push('<hr>');
        continue;
      }

      // Headings
      const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = this.inlineFormat(headingMatch[2]);
        result.push(`<h${level}>${text}</h${level}>`);
        continue;
      }

      // Blockquote
      if (line.startsWith('> ')) {
        result.push(`<blockquote>${this.inlineFormat(line.slice(2))}</blockquote>`);
        continue;
      }

      // Unordered list
      if (line.match(/^[-*+]\s+/)) {
        result.push(`<li>${this.inlineFormat(line.replace(/^[-*+]\s+/, ''))}</li>`);
        continue;
      }

      // Ordered list
      if (line.match(/^\d+\.\s+/)) {
        result.push(`<li>${this.inlineFormat(line.replace(/^\d+\.\s+/, ''))}</li>`);
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        result.push('');
        continue;
      }

      // Paragraph
      result.push(`<p>${this.inlineFormat(line)}</p>`);
    }

    // Handle unclosed code block
    if (inCodeBlock && codeLines.length > 0) {
      result.push(`<pre><code>${this.escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }

    return result.join('\n');
  }

  /**
   * 内联格式化：bold, italic, inline code, links
   */
  private inlineFormat(text: string): string {
    // Escape HTML first
    text = this.escapeHtml(text);

    // Inline code (`...`)
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold (**...** or __...__)
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic (*...* or _..._)
    text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    text = text.replace(/(?<!_)_([^_]+?)_(?!_)/g, '<em>$1</em>');

    // Links ([text](url))
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    return text;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
