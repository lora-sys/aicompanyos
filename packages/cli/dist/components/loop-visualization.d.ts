import { LoopState } from "@aicos/loop-engine/types";
import type { PlanStep } from "@aicos/loop-engine/types";
import type { LoopVisualizationData } from "../types.js";
/**
 * 构建 Loop 可视化数据
 * 根据当前状态生成流程图和进度数据
 */
export declare function buildLoopVisualizationData(params: {
    currentState: LoopState;
    planSteps?: PlanStep[];
    currentStepIndex?: number;
    streamingOutput?: string;
    agentName?: string;
}): LoopVisualizationData;
/**
 * 格式化 Loop 可视化为 ASCII art 字符串（用于终端输出）
 */
export declare function formatLoopASCII(data: LoopVisualizationData): string;
//# sourceMappingURL=loop-visualization.d.ts.map