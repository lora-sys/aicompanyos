// 底栏组件
// 日志滚动区 + 快捷键提示

import type { FooterArea, LogEntry, ShortcutHint, LogLevel } from "../types.js";

/** 默认快捷键提示 */
const DEFAULT_SHORTCUTS: ShortcutHint[] = [
  { key: "Enter", description: "提交/确认" },
  { key: "Esc", description: "跳过/取消" },
  { key: "Tab", description: "切换焦点" },
  { key: "q", description: "退出" },
];

/** 日志级别对应的显示样式 */
const LEVEL_STYLES: Record<LogLevel, { prefix: string; label: string }> = {
  info: { prefix: "ℹ", label: "INFO" },
  warn: { prefix: "⚠", label: "WARN" },
  error: { prefix: "✗", label: "ERROR" },
  debug: { prefix: "◇", label: "DEBUG" },
};

/**
 * 构建底栏渲染数据
 */
export function buildFooterData(params?: {
  logs?: LogEntry[];
  shortcuts?: ShortcutHint[];
}): FooterArea {
  return {
    logs: params?.logs ?? [],
    shortcuts: params?.shortcuts ?? DEFAULT_SHORTCUTS,
  };
}

/**
 * 格式化底栏为字符串（用于终端输出）
 */
export function formatFooterString(data: FooterArea): string {
  const lines: string[] = [];

  // 日志区域
  lines.push("┌─ Logs ─────────────────────────────┐");

  const recentLogs = data.logs.slice(-6); // 只显示最近 6 条
  if (recentLogs.length === 0) {
    lines.push("│  (暂无日志)".padEnd(38) + "│");
  } else {
    for (const log of recentLogs) {
      const style = LEVEL_STYLES[log.level];
      const time = log.timestamp.slice(11, 19); // HH:mm:ss
      const logLine = `${style.prefix} [${time}] [${log.source}] ${log.message}`;
      lines.push(`│  ${logLine.slice(0, 34).padEnd(34)}│`);
    }
  }

  lines.push("└──────────────────────────────────────┘");

  // 快捷键提示
  const shortcutParts = data.shortcuts.map((s) => `${s.key}:${s.description}`);
  lines.push(` ${shortcutParts.join("  |  ")} `);

  return lines.join("\n");
}
