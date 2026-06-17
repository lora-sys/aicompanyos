// 输出产物类型定义

/** 产物类型枚举 */
export type ArtifactType = "blog" | "tweet" | "design-doc" | "html" | "generic";

/** 输出产物 */
export interface Artifact {
  /** 产物名称，如 "blog.md" */
  name: string;
  /** 完整路径，如 "./artifacts/blog.md" */
  path: string;
  /** 产物类型 */
  type: ArtifactType;
  /** 产物内容 */
  content: string;
  /** 创建时间（ISO 格式） */
  createdAt: string;
  /** 内容大小（字节） */
  sizeBytes: number;
  /** 关联的原始 Markdown 内容 (用于 HTML 产物) */
  sourceContent?: string;
}

/** ArtifactManager 配置 */
export interface ArtifactManagerConfig {
  /** 输出目录，默认 "./artifacts" */
  outputDir: string;
}

// ============================================================
// HTML Style Config — 可进化的视觉样式配置
// 从 UIUXProMaxSkill / design.mdx 注入，非硬编码
// ============================================================

/** HTML 输出的动态样式配置 */
export interface HTMLStyleConfig {
  /** 风格来源标记（方便追踪：default-fallback / uiux-skill / design-mdx / evolved） */
  source: string;
  /** 主题名称（dark/light/custom/...） */
  theme: string;
  /** 色彩系统 */
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    accentDim: string;
    success: string;
    warning: string;
    danger: string;
    border: string;
    codeBg: string;
  };
  /** 排版系统 */
  typography: {
    font: string;           // 正文字体栈
    mono: string;           // 等宽字体栈
    headingSizes: {         // 标题字号
      h1: string;
      h2: string;
      h3: string;
      h4: string;
    };
    lineHeight: string;     // 行高
    baseFontSize: string;   // 基础字号
  };
  /** 布局参数 */
  layout: {
    maxWidth: string;       // 内容最大宽度
    padding: string;        // 页面内边距
    borderRadius: string;   // 圆角半径
  };
}

/**
 * 将 UIUXProMaxSkill 的输出转换为 HTMLStyleConfig
 *
 * 这是 Loop 进化链的关键桥接：
 * UIUXProMaxSkill.execute() → uiuxToHTMLStyle() → createHTMLArtifact({ styleConfig })
 *
 * 这样每次运行时，HTML 风格都反映了最新的 UIUX 分析结果
 */
export function uiuxToHTMLStyle(uiuxOutput: {
  colorPalette?: { primary?: string; secondary?: string; accent?: string; background?: string; text?: string };
  typography?: { headingFont?: string; bodyFont?: string; lineHeight?: string };
  designTokens?: { borderRadius?: string; paddingScale?: string };
}): Partial<HTMLStyleConfig> {
  const cp = uiuxOutput.colorPalette ?? {};
  const typo = uiuxOutput.typography ?? {};
  const tokens = uiuxOutput.designTokens ?? {};

  return {
    source: "uiux-skill",
    theme: (cp.background ?? "#0d1117") === "#FAFAFA" ? "light" : "dark",
    colors: {
      bgPrimary: cp.background ?? undefined!,
      bgSecondary: cp.secondary ?? undefined!,
      textPrimary: cp.text ?? undefined!,
      accent: cp.accent ?? undefined!,
      accentDim: cp.primary ?? undefined!,
    },
    typography: {
      font: typo.bodyFont ?? undefined!,
      mono: "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
      lineHeight: typo.lineHeight ?? undefined!,
    },
    layout: {
      borderRadius: tokens.borderRadius ?? undefined!,
    },
  } as Partial<HTMLStyleConfig>; // 允许部分字段为 undefined（会被 mergeStyleConfig 的默认值覆盖）
}
