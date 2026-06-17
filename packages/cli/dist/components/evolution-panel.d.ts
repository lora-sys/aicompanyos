import type { EvolutionPanelData } from "../types.js";
/**
 * 构建进化面板渲染数据
 */
export declare function buildEvolutionPanelData(params?: {
    phase?: EvolutionPanelData["phase"];
    progress?: number;
    diffOutput?: string;
    summary?: string;
}): EvolutionPanelData;
/**
 * 格式化进化面板为 ASCII art 字符串
 */
export declare function formatEvolutionString(data: EvolutionPanelData): string;
/**
 * 进化动画帧（用于流式展示）
 */
export declare function getEvolutionAnimationFrame(frameIndex: number): {
    phase: EvolutionPanelData["phase"];
    progress: number;
};
//# sourceMappingURL=evolution-panel.d.ts.map