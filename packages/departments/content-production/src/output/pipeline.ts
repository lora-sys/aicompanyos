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

import type {
  OutputPipelineConfig,
  OutputPostProcessor,
  ProcessedOutput,
  PlatformType,
} from "@aicos/loop-engine";
import type { AcceptanceGoal } from "@aicos/loop-engine";

// ============================================================
// 处理上下文
// ============================================================

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

// ============================================================
// 各处理器实现
// ============================================================

/**
 * 格式转换器 — Markdown → HTML / Plain Text
 */
async function executeFormatConverter(
  content: string,
  params: Extract<OutputPostProcessor, { type: "format_converter" }>
): Promise<string> {
  const { from, to } = params;

  if (from === to) return content;

  switch (`${from}->${to}`) {
    case "markdown->html":
      return markdownToHtml(content);

    case "markdown->plain":
      return markdownToPlain(content);

    case "html->plain":
      return htmlToPlain(content);

    default:
      console.warn(`[OutputPipeline] 不支持的转换: ${from} -> ${to}`);
      return content;
  }
}

/**
 * 简易 Markdown → HTML 转换器
 *
 * 注意：这是一个基础实现，不依赖第三方 markdown 解析库。
 * 生产环境可替换为 marked / remark 等。
 */
function markdownToHtml(md: string): string {
  let html = md;

  // 代码块 → <pre><code>
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) =>
    `<pre><code class="language-${lang || ''}">${escapeHtml(code.trim())}</code></pre>`
  );

  // 行内代码 → <code>
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 标题 → <h1>-<h4>
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // 加粗和斜体
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 图片
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // 无序列表
  html = html.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>\n$&</ul>");

  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // 段落：双换行之间的文本包裹 <p>
  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;

  // 清理空段落
  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<(h[1-4]|ul|ol|pre|blockquote))/g, "$1");
  html = html.replace(/(<\/(h[1-4]|ul|ol|pre|blockquote)>)<\/p>/g, "$1");

  return html;
}

/** Markdown → 纯文本（去除所有标记） */
function markdownToPlain(md: string): string {
  let text = md;

  // 移除代码块
  text = text.replace(/```[\s\S]*?```/g, "");
  // 移除行内代码
  text = text.replace(/`[^`]+`/g, "");
  // 移除标题标记
  text = text.replace(/^#{1,4}\s+/gm, "");
  // 移除加粗/斜体
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  // 移除链接语法，保留文字
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // 移除图片
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  // 移除列表标记
  text = text.replace(/^[\-\*]\s+/gm, "- ");
  text = text.replace(/^\d+\.\s+/gm, ". ");
  // 合并多余空行
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/** HTML → 纯文本 */
function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(h[1-4]|div|ul|ol|li|blockquote|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** HTML 转义 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 元数据注入器 — 向内容注入标题/作者/日期等
 */
async function executeMetadataInjector(
  content: string,
  params: Extract<OutputPostProcessor, { type: "metadata_injector" }>,
  context: PipelineContext
): Promise<string> {
  const meta = params.metadata;
  let result = content;

  // ★ 标题提取优先级链（物理层焊死，杜绝 undefined）
  // 1. meta.title（显式传入）
  // 2. Markdown h1 标题（从内容自动提取）
  // 3. 第一行非空文本（最终兜底）
  let effectiveTitle: string | undefined = meta?.title;

  // 排除 contentType 占位符（article/seed/short-video/newsletter 不是真实标题）
  if (!effectiveTitle || ["article", "seed", "short-video", "newsletter", "undefined"].includes(effectiveTitle)) {
    effectiveTitle = undefined; // 重置，走后续提取
  }

  // ★ 策略2：从 Markdown h1 提取
  if (!effectiveTitle) {
    // 优先从原始 markdown 中提取标题
    let h1Match = context.rawContent?.match(/^#\s+(.+)$/m);
    if (!h1Match) {
      // 回退到 HTML 中的 <h1> 标签
      h1Match = result.match(/<h1[^>]*>(.*?)<\/h1>/is);
    }
    if (h1Match) {
      effectiveTitle = h1Match[1].trim();
    }
  }

  // ★ 策略3：从第一行非空非标记文本提取（最终兜底）
  if (!effectiveTitle) {
    for (const line of result.split("\n")) {
      const trimmed = line.trim();
      // 跳过空行、markdown 标记、代码块标记
      if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("```") && !trimmed.startsWith("---") && !trimmed.startsWith("<") && !trimmed.startsWith("|")) {
        // 截取前 60 字符作为标题
        effectiveTitle = trimmed.slice(0, 60).replace(/\*|`|#/g, "").trim();
        if (effectiveTitle.length > 0) break;
      }
    }
  }

  // ★ 回写到 context.metadata（下游 adapter 依赖此值）
  if (effectiveTitle) {
    if (!context.metadata) context.metadata = {};
    const previousTitle = context.metadata.title;
    context.metadata.title = effectiveTitle;

    if (previousTitle && previousTitle !== effectiveTitle) {
      console.log(`[OutputPipeline] metadata_injector: 标题已更新 "${previousTitle}" → "${effectiveTitle}"`);
    } else {
      console.log(`[OutputPipeline] metadata_injector: 使用标题 "${effectiveTitle}"`);
    }
  } else {
    console.warn(`[OutputPipeline] metadata_injector: ⚠️ 无法提取标题，使用默认值`);
    effectiveTitle = "AI Company OS 产出";
  }

  // 在开头注入标题（如果是 HTML）
  if (effectiveTitle && result.startsWith("<")) {
    result = `<h1>${escapeHtml(effectiveTitle)}</h1>\n${result}`;
  }

  // 在末尾注入元信息 footer
  const metaParts: string[] = [];
  if (meta.author) metaParts.push(`作者: ${meta.author}`);
  if (meta.date) metaParts.push(`日期: ${meta.date}`);
  if (meta.tags && Array.isArray(meta.tags)) {
    metaParts.push(`标签: ${(meta.tags as string[]).join(", ")}`);
  }

  if (metaParts.length > 0) {
    const footer = result.startsWith("<")
      ? `\n<footer>${metaParts.join(" | ")}</footer>`
      : `\n\n---\n${metaParts.join(" | ")}`;
    result += footer;
  }

  return result;
}

/**
 * 平台适配器 — 将内容转换为特定平台的 HTML/CSS 格式
 */
async function executePlatformAdapter(
  content: string,
  params: Extract<OutputPostProcessor, { type: "platform_adapter" }>,
  context: PipelineContext
): Promise<string> {
  const { platform } = params;

  switch (platform) {
    case "wechat":
      return adaptForWechat(content, context);
    case "xiaohongshu":
      return adaptForXiaohongshu(content, context);
    case "douyin":
      return adaptForDouyin(content, context);
    case "substack":
      return adaptForSubstack(content, context);
    case "generic":
    default:
      return content;
  }
}

// ============================================================
// 平台适配实现
// ============================================================

/** 微信公众号 HTML 适配 */
function adaptForWechat(html: string, ctx: PipelineContext): string {
  const title = (ctx.metadata?.title as string) ?? "未命名文章";
  const author = (ctx.metadata?.author as string) ?? "";

  // 微信兼容的内联 CSS 样式
  const wechatStyle = `
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif; max-width: 677px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.8; font-size: 16px; }
  h1 { font-size: 22px; font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
  h2 { font-size: 19px; border-left: 4px solid #576b95; padding-left: 12px; margin-top: 30px; }
  h3 { font-size: 17px; color: #576b95; margin-top: 25px; }
  p { margin-bottom: 16px; text-align: justify; }
  strong { color: #1a1a1a; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
  pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #ddd; margin: 16px 0; padding: 8px 16px; color: #666; }
  a { color: #576b95; text-decoration: none; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  img { max-width: 100%; height: auto; display: block; margin: 16px auto; border-radius: 4px; }
  footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 13px; color: #999; text-align: center; }
</style>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>${wechatStyle}</head>
<body>
${html}
${author ? `<footer><p>— ${escapeHtml(author)}</p></footer>` : ""}
</body></html>`;
}

/** 小红书卡片式 HTML 适配 */
function adaptForXiaohongshu(content: string, ctx: PipelineContext): string {
  // ★ 从内容中提取标题（优先级：context.metadata.title > Markdown h1 > HTML h1）
  let title = (ctx.metadata?.title as string) ?? "";

  // 如果 title 是 contentType 占位符，尝试从内容中提取真实标题
  if (!title || ["article", "seed", "short-video", "newsletter"].includes(title)) {
    // 先尝试 Markdown h1（format_converter 尚未执行时）
    const mdH1Match = content.match(/^#\s+(.+)$/m);
    if (mdH1Match) {
      title = mdH1Match[1].trim();
    } else {
      // 再尝试 HTML <h1>（format_converter 已执行后）
      const htmlH1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/is);
      if (htmlH1Match) {
        // 去除 HTML 标签，只保留文本
        title = htmlH1Match[1].replace(/<[^>]+>/g, "").trim();
      }
    }
  }

  console.log(`[OutputPipeline] xiaohongshu-adapter: 最终卡片标题="${title}" (原始ctx.metadata.title="${ctx.metadata?.title ?? ""}")`);
  const tags = (ctx.metadata?.tags as string[]) ?? [];

  // 小红书风格：圆角卡片 + 渐变背景 + Emoji 标题
  const xhsStyle = `
<style>
  body { background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); min-height: 100vh; display: flex; justify-content: center; padding: 20px; box-sizing: border-box; font-family: -apple-system, sans-serif; }
  .card { background: #fff; border-radius: 20px; padding: 30px; max-width: 520px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
  .card-title { font-size: 22px; font-weight: bold; margin-bottom: 16px; line-height: 1.4; }
  .card-body { font-size: 15px; line-height: 1.9; color: #333; white-space: pre-wrap; }
  .tags { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 8px; }
  .tag { background: #fff0f0; color: #ff2442; padding: 4px 12px; border-radius: 14px; font-size: 13px; }
  .cta { margin-top: 20px; text-align: center; color: #ff2442; font-size: 14px; }
</style>`;

  const tagHtml = tags.length > 0
    ? "<div class=\"tags\">" + tags.map((t) => "<span class=\"tag\">#" + t + "#</span>").join("") + "</div>"
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${xhsStyle}</head>
<body>
<div class="card">
  ${title ? `<div class="card-title">${escapeHtml(title)}</div>` : ""}
  <div class="card-body">${content}</div>
  ${tagHtml}
  <div class="cta">❤️ 如果有用的话，记得点赞收藏哦～</div>
</div>
</body></html>`;
}

/** 抖音脚本纯文本格式化 */
function adaptForDouyin(content: string, _ctx: PipelineContext): string {
  // 抖音脚本保持为纯文本，但添加标准分镜格式头部
  const lines = content.split("\n");
  let sceneCount = 0;

  const formatted = lines.map((line) => {
    // 统计场景数
    if (/^\[场景\d+\]/.test(line)) sceneCount++;

    // 保持原格式但美化缩进
    if (/^\[场景\d+\]/.test(line)) {
      return `\n${"═".repeat(50)}\n${line}\n${"─".repeat(50)}`;
    }
    if (/^\[画面\]/.test(line)) return `  📷 ${line.replace(/^\[画面\]\s*/, "")}`;
    if (/^\[音效\]/.test(line)) return `  🔊 ${line.replace(/^\[音效\]\s*/, "")}`;
    if (/^\[字幕\]/.test(line)) return `  💬 ${line.replace(/^\[字幕\]\s*/, "")}`;
    if (/^\[口播\]|\[文案\]/.test(line)) return `  🎙️ ${line.replace(/^\[(口播|文案)\]\s*/, "")}`;

    return line;
  }).join("\n");

  const header = [
    "┌─────────────────────────────────────────┐",
    "│       抖音短视频分镜脚本                  │",
    `│       场景数: ${String(sceneCount).padEnd(26)}│`,
    "└─────────────────────────────────────────┘",
    "",
  ].join("\n");

  return header + formatted;
}

/** Substack Newsletter HTML 渲染 */
function adaptForSubstack(content: string, ctx: PipelineContext): string {
  const title = (ctx.metadata?.title as string) ?? "Newsletter";
  const author = (ctx.metadata?.author as string) ?? "";

  // Substack 兼容的邮件 HTML（inline CSS）
  const style = `
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #222; line-height: 1.7; font-size: 18px; }
  .header { border-bottom: 2px solid #222; padding-bottom: 15px; margin-bottom: 25px; }
  .header h1 { font-size: 28px; margin: 0; }
  .header p { color: #666; font-size: 14px; margin: 5px 0 0 0; }
  h2 { font-size: 22px; margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
  p { margin-bottom: 18px; }
  blockquote { border-left: 3px solid #222; margin: 20px 0; padding: 10px 20px; color: #555; font-style: italic; }
  .ps { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 15px; color: #666; }
  .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 13px; color: #999; }
  a.unsubscribe { color: #999; text-decoration: underline; }
</style>`;

  // 提取 P.S. 部分（如果存在）
  let body = content;
  let psSection = "";
  const psMatch = body.match(/(?:P\.S\.|PS\.|附言|又及)[\s\S]*$/m);
  if (psMatch) {
    psSection = `<div class="ps">${psMatch[0]}</div>`;
    body = body.replace(psMatch[0], "").trim();
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${style}</head>
<body>
<div class="header">
  <h1>${escapeHtml(title)}</h1>
  <p>${author ? `by ${escapeHtml(author)}` : ""}</p>
</div>
${body.startsWith("<") ? body : `<p>${body.replace(/\n\n/g, "</p><p>")}</p>`}
${psSection}
<div class="footer">
  <p>📧 收到这封邮件是因为你订阅了我们的 Newsletter。</p>
  <p><a class="unsubscribe" href="{{UNSUBSCRIBE_LINK}}">取消订阅</a></p>
</div>
</body></html>`;
}

/**
 * 质量检查处理器 — 发布前最后安检
 */
async function executeQualityChecker(
  content: string,
  params: Extract<OutputPostProcessor, { type: "quality_checker" }>,
  _context: PipelineContext
): Promise<{ passed: boolean; content: string; failures: string[] }> {
  const failures: string[] = [];
  let passed = true;

  for (const check of params.checks) {
    switch (check.type) {
      case "word_count_min": {
        const min = (check.params?.min as number) ?? 100;
        const count = content.length;
        if (count < min) {
          failures.push(`[${check.id}] 字数不足: ${count} < ${min}`);
          if (check.blocking) passed = false;
        }
        break;
      }
      case "word_count_max": {
        const max = (check.params?.max as number) ?? 10000;
        const count = content.length;
        if (count > max) {
          failures.push(`[${check.id}] 字数超限: ${count} > ${max}`);
          if (check.blocking) passed = false;
        }
        break;
      }
      case "has_title": {
        const hasTitle = /^#\s+.+/m.test(content) || /<h[1-4]>/i.test(content);
        if (!hasTitle) {
          failures.push(`[${check.id}] 缺少标题`);
          if (check.blocking) passed = false;
        }
        break;
      }
      case "spam_score": {
        const spamWords = ["免费", "中奖", "!!!", "urgent", "限时", "马上行动"];
        const found = spamWords.filter((w) => content.toLowerCase().includes(w.toLowerCase()));
        if (found.length > 0) {
          failures.push(`[${check.id}] 发现垃圾邮件触发词: [${found.join(", ")}]`);
          if (check.blocking) passed = false;
        }
        break;
      }
      case "custom_regex": {
        const pattern = check.params?.pattern as string | undefined;
        if (pattern) {
          const regex = new RegExp(pattern);
          if (!regex.test(content)) {
            failures.push(`[${check.id}] 自定义正则检查未通过: ${pattern}`);
            if (check.blocking) passed = false;
          }
        }
        break;
      }
    }
  }

  return { passed, content, failures };
}

// ============================================================
// OutputPipeline 主类
// ============================================================

/**
 * Output Pipeline — 产出后处理管线
 *
 * 按 postProcessors 数组顺序依次执行每个处理器，
 * 记录每步的执行结果，返回最终的 ProcessedOutput。
 */
export class OutputPipeline {
  private config: OutputPipelineConfig;

  constructor(config: OutputPipelineConfig) {
    this.config = config;
  }

  /**
   * 执行完整的输出处理管线
   *
   * @param rawContent 原始 Markdown 内容
   * @param context 处理上下文
   * @returns 处理结果（包含处理后内容和执行日志）
   */
  async process(rawContent: string, context: PipelineContext): Promise<ProcessedOutput> {
    const startTime = Date.now();
    let currentContent = rawContent;
    const processorLog: ProcessedOutput["processorLog"] = [];

    for (const processor of this.config.postProcessors) {
      const procStart = Date.now();
      let success = true;
      let error: string | undefined;

      try {
        switch (processor.type) {
          case "format_converter":
            currentContent = await executeFormatConverter(currentContent, processor);
            break;

          case "metadata_injector":
            currentContent = await executeMetadataInjector(currentContent, processor, context);
            break;

          case "platform_adapter":
            currentContent = await executePlatformAdapter(currentContent, processor, context);
            break;

          case "quality_checker": {
            const result = await executeQualityChecker(currentContent, processor, context);
            if (!result.passed && result.failures.length > 0) {
              console.warn(`[OutputPipeline] Quality check 失败:\n  ${result.failures.join("\n  ")}`);
              // 不阻断流程，只记录失败项
            }
            currentContent = result.content;
            break;
          }
        }
      } catch (e) {
        success = false;
        error = e instanceof Error ? e.message : String(e);
        console.error(`[OutputPipeline] 处理器 "${processor.type}" 执行失败:`, error);
      }

      processorLog.push({
        processorType: processor.type,
        success,
        durationMs: Date.now() - procStart,
        error,
      });
    }

    // 推断最终格式
    const format = this.inferFinalFormat();

    return {
      rawContent,
      processedContent: currentContent,
      format,
      platform: this.inferPlatform(),
      outputFiles: [], // 由调用方决定写入哪些文件
      processorLog,
    };
  }

  /**
   * 推断最终输出格式
   */
  private inferFinalFormat(): ProcessedOutput["format"] {
    // 从后往前找最后一个 format_converter 的目标格式
    for (let i = this.config.postProcessors.length - 1; i >= 0; i--) {
      const p = this.config.postProcessors[i];
      if (p.type === "format_converter") {
        return p.to as ProcessedOutput["format"];
      }
    }
    return this.config.primaryFormat;
  }

  /**
   * 推断目标平台
   */
  private inferPlatform(): PlatformType | undefined {
    for (const p of this.config.postProcessors) {
      if (p.type === "platform_adapter") {
        return p.platform;
      }
    }
    return undefined;
  }
}

// ============================================================
// 工厂函数：根据 ContentType 创建默认 OutputPipeline
// ============================================================

import type { ContentType } from "@aicos/loop-engine";

/**
 * 根据内容格式创建默认的 OutputPipelineConfig
 *
 * @param contentType 内容格式
 * @param metadata 可选元数据（标题/作者等）
 * @returns 配置好的 OutputPipelineConfig
 */
export function createDefaultOutputPipeline(
  contentType: ContentType,
  metadata?: Record<string, unknown>
): OutputPipelineConfig {
  switch (contentType) {
    case "article":
      return {
        primaryFormat: "html",
        postProcessors: [
          { type: "format_converter", from: "markdown", to: "html" },
          { type: "metadata_injector", metadata: metadata ?? {} },
          { type: "platform_adapter", platform: "wechat" },
          {
            type: "quality_checker",
            checks: [
              { id: "word_count", name: "字数下限", type: "word_count_min", params: { min: 1500 }, blocking: false },
              { id: "has_title", name: "有标题", type: "has_title", blocking: false },
            ],
          },
        ],
      };

    case "seed":
      return {
        primaryFormat: "html",
        postProcessors: [
          { type: "format_converter", from: "markdown", to: "html" },
          { type: "metadata_injector", metadata: metadata ?? {} },
          { type: "platform_adapter", platform: "xiaohongshu" },
          {
            type: "quality_checker",
            checks: [
              { id: "seed_length", name: "种草长度", type: "word_count_max", params: { max: 1200 }, blocking: false },
            ],
          },
        ],
      };

    case "short-video":
      return {
        primaryFormat: "plain",
        postProcessors: [
          { type: "format_converter", from: "markdown", to: "plain" },
          { type: "platform_adapter", platform: "douyin" },
          {
            type: "quality_checker",
            checks: [
              { id: "sv_scenes", name: "场景标记", type: "custom_regex", params: { pattern: "\\[场景\\d+\\]" }, blocking: false },
            ],
          },
        ],
      };

    case "newsletter":
      return {
        primaryFormat: "html",
        postProcessors: [
          { type: "format_converter", from: "markdown", to: "html" },
          { type: "metadata_injector", metadata: metadata ?? {} },
          { type: "platform_adapter", platform: "substack" },
          {
            type: "quality_checker",
            checks: [
              { id: "nl_spam", name: "垃圾邮件安全", type: "spam_score", blocking: false },
              { id: "nl_unsubscribe", name: "退订链接", type: "custom_regex", params: { pattern: "unsubscribe|取消订阅|退订" }, blocking: false },
            ],
          },
        ],
      };

    default:
      return {
        primaryFormat: "markdown",
        postProcessors: [],
      };
  }
}
