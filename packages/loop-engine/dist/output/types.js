// 输出产物类型定义
/**
 * 将 UIUXProMaxSkill 的输出转换为 HTMLStyleConfig
 *
 * 这是 Loop 进化链的关键桥接：
 * UIUXProMaxSkill.execute() → uiuxToHTMLStyle() → createHTMLArtifact({ styleConfig })
 *
 * 这样每次运行时，HTML 风格都反映了最新的 UIUX 分析结果
 */
export function uiuxToHTMLStyle(uiuxOutput) {
    const cp = uiuxOutput.colorPalette ?? {};
    const typo = uiuxOutput.typography ?? {};
    const tokens = uiuxOutput.designTokens ?? {};
    return {
        source: "uiux-skill",
        theme: (cp.background ?? "#0d1117") === "#FAFAFA" ? "light" : "dark",
        colors: {
            bgPrimary: cp.background ?? undefined,
            bgSecondary: cp.secondary ?? undefined,
            textPrimary: cp.text ?? undefined,
            accent: cp.accent ?? undefined,
            accentDim: cp.primary ?? undefined,
        },
        typography: {
            font: typo.bodyFont ?? undefined,
            mono: "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
            lineHeight: typo.lineHeight ?? undefined,
        },
        layout: {
            borderRadius: tokens.borderRadius ?? undefined,
        },
    }; // 允许部分字段为 undefined（会被 mergeStyleConfig 的默认值覆盖）
}
//# sourceMappingURL=types.js.map