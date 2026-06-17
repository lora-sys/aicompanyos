// 进化展示面板
// evolving 状态时的进化进度展示
/**
 * 进化阶段标签映射
 */
const PHASE_LABELS = {
    analyzing: "分析现有成果...",
    generating: "生成进化方案...",
    applying: "应用进化变更...",
    complete: "进化完成",
};
/**
 * 进度条字符
 */
function buildProgressBar(progress, width = 20) {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${progress}%`;
}
/**
 * 构建进化面板渲染数据
 */
export function buildEvolutionPanelData(params) {
    return {
        phase: params?.phase ?? "analyzing",
        progress: params?.progress ?? 0,
        diffOutput: params?.diffOutput,
        summary: params?.summary,
    };
}
/**
 * 格式化进化面板为 ASCII art 字符串
 */
export function formatEvolutionString(data) {
    const lines = [];
    lines.push("┌─ Evolution ─────────────────────────┐");
    // 阶段标签
    const phaseLabel = PHASE_LABELS[data.phase];
    lines.push(`│  🧬 ${phaseLabel.padEnd(30)}│`);
    // 进度条
    lines.push(`│  ${buildProgressBar(data.progress).padEnd(34)}│`);
    // Diff 输出（如果有）
    if (data.diffOutput) {
        lines.push("│                                      │");
        lines.push("│  Changes:                            │");
        const diffLines = data.diffOutput.split("\n").slice(-5);
        for (const line of diffLines) {
            // 对 diff 行进行颜色标识前缀
            const prefix = line.startsWith("+") ? "+" : line.startsWith("-") ? "-" : " ";
            lines.push(`│  ${prefix} ${line.slice(1, 33).padEnd(33)}│`);
        }
    }
    // 摘要（完成时）
    if (data.phase === "complete" && data.summary) {
        lines.push("│                                      │");
        lines.push("│  📋 Summary:                          │");
        const summaryLines = data.summary.split("\n").slice(-3);
        for (const line of summaryLines) {
            lines.push(`│  ${line.slice(0, 34).padEnd(34)}│`);
        }
    }
    lines.push("└──────────────────────────────────────┘");
    return lines.join("\n");
}
/**
 * 进化动画帧（用于流式展示）
 */
export function getEvolutionAnimationFrame(frameIndex) {
    const totalFrames = 40;
    if (frameIndex < totalFrames * 0.2) {
        // 分析阶段 0-20%
        return {
            phase: "analyzing",
            progress: Math.min(20, Math.round((frameIndex / (totalFrames * 0.2)) * 20)),
        };
    }
    else if (frameIndex < totalFrames * 0.5) {
        // 生成阶段 20-50%
        return {
            phase: "generating",
            progress: Math.min(50, 20 + Math.round(((frameIndex - totalFrames * 0.2) / (totalFrames * 0.3)) * 30)),
        };
    }
    else if (frameIndex < totalFrames * 0.85) {
        // 应用阶段 50-85%
        return {
            phase: "applying",
            progress: Math.min(85, 50 + Math.round(((frameIndex - totalFrames * 0.5) / (totalFrames * 0.35)) * 35)),
        };
    }
    else {
        // 完成阶段 85-100%
        return {
            phase: "complete",
            progress: Math.min(100, 85 + Math.round(((frameIndex - totalFrames * 0.85) / (totalFrames * 0.15)) * 15)),
        };
    }
}
//# sourceMappingURL=evolution-panel.js.map