// Loop 状态可视化面板
// 中央主区域：状态机流程图、当前高亮状态、Agent 输出区
import { LoopState } from "@aicos/loop-engine/types";
/**
 * Loop 流程图定义
 * 定义各步骤的标签和顺序
 */
const LOOP_STEPS = [
    { state: LoopState.IDLE, label: "IDLE" },
    { state: LoopState.INTERROGATING, label: "INTERROGATE" },
    { state: LoopState.PLANNING, label: "PLAN" },
    { state: LoopState.EXECUTING, label: "EXECUTE" },
    { state: LoopState.VERIFYING, label: "VERIFY" },
    { state: LoopState.EVOLVING, label: "EVOLVE" },
    { state: LoopState.DONE, label: "DONE" },
];
/**
 * 构建 Loop 可视化数据
 * 根据当前状态生成流程图和进度数据
 */
export function buildLoopVisualizationData(params) {
    const { currentState, planSteps, currentStepIndex, streamingOutput, agentName } = params;
    // 构建各步骤进度
    const steps = LOOP_STEPS.map((step) => {
        const stepIdx = LOOP_STEPS.indexOf(step);
        const currentIdx = LOOP_STEPS.findIndex((s) => s.state === currentState);
        let status = "pending";
        if (stepIdx < currentIdx) {
            status = "done";
        }
        else if (stepIdx === currentIdx) {
            status = "running";
        }
        let detail;
        if (step.state === currentState && agentName) {
            detail = `${agentName} 运行中...`;
        }
        if (planSteps && currentStepIndex !== undefined && step.state === LoopState.EXECUTING) {
            detail = `步骤 ${currentStepIndex + 1}/${planSteps.length}`;
        }
        return {
            stepLabel: step.label,
            status,
            detail,
        };
    });
    return {
        currentState,
        steps,
        streamingOutput,
    };
}
/**
 * 格式化 Loop 可视化为 ASCII art 字符串（用于终端输出）
 */
export function formatLoopASCII(data) {
    const lines = [];
    lines.push("┌─ Loop Execution ─────────────────────┐");
    lines.push("│                                      │");
    // 第一行：IDLE → INTERROGATE → PLAN
    lines.push(`│  ${formatStep(data.steps[0])} → ${formatStep(data.steps[1])} → ${formatStep(data.steps[2])}     │`);
    // 第二行：缩进 EXECUTE → VERIFY
    lines.push(`│              ↓                 │`);
    lines.push(`│        ${formatStep(data.steps[3])} → ${formatStep(data.steps[4])}     │`);
    // 第三行：REPLAN / EVOLVE
    lines.push(`│          ↓         ↓           │`);
    lines.push(`│     [REPLAN]   ${formatStep(data.steps[5])}        │`);
    // 第四行：DONE
    lines.push(`│                   ↓          │`);
    lines.push(`│                ${formatStep(data.steps[6])}       │`);
    lines.push("│                                      │");
    // 当前状态指示器
    const stateLabel = data.currentState.toUpperCase();
    const currentStep = data.steps.find((s) => s.status === "running");
    const detailStr = currentStep?.detail ? `  ${currentStep.detail}` : "";
    lines.push(`│  当前状态: ● ${stateLabel}${detailStr.padEnd(25)}│`);
    lines.push("└──────────────────────────────────────┘");
    // Streaming 输出区域
    if (data.streamingOutput) {
        lines.push("");
        lines.push("┌─ Agent Output ──────────────────────┐");
        const outputLines = data.streamingOutput.split("\n").slice(-8);
        for (const line of outputLines) {
            lines.push(`│  ${line.slice(0, 34).padEnd(34)}│`);
        }
        lines.push("└──────────────────────────────────────┘");
    }
    return lines.join("\n");
}
/**
 * 格式化单个步骤的状态标记
 */
function formatStep(step) {
    switch (step.status) {
        case "done":
            return `[${step.stepLabel}]`;
        case "running":
            return `[●${step.stepLabel}]`;
        case "error":
            return `[✗${step.stepLabel}]`;
        default:
            return `[${step.stepLabel}]`;
    }
}
//# sourceMappingURL=loop-visualization.js.map