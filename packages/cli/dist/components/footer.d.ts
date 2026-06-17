import type { FooterArea, LogEntry, ShortcutHint } from "../types.js";
/**
 * 构建底栏渲染数据
 */
export declare function buildFooterData(params?: {
    logs?: LogEntry[];
    shortcuts?: ShortcutHint[];
}): FooterArea;
/**
 * 格式化底栏为字符串（用于终端输出）
 */
export declare function formatFooterString(data: FooterArea): string;
//# sourceMappingURL=footer.d.ts.map