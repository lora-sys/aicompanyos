// 顶栏组件
// 显示应用名称、状态徽章、任务 ID

import { LoopState } from "@aicos/loop-engine/types";
import type { HeaderArea } from "../types.js";

/** 状态到显示文本和颜色的映射 */
const STATE_DISPLAY: Record<LoopState, { label: string; color: string }> = {
  [LoopState.IDLE]: { label: "IDLE", color: "gray" },
  [LoopState.INTERROGATING]: { label: "INTERROGATING", color: "cyan" },
  [LoopState.PLANNING]: { label: "PLANNING", color: "yellow" },
  [LoopState.EXECUTING]: { label: "EXECUTING", color: "green" },
  [LoopState.VERIFYING]: { label: "VERIFYING", color: "magenta" },
  [LoopState.EVOLVING]: { label: "EVOLVING", color: "blue" },
  [LoopState.DONE]: { label: "DONE", color: "green" },
};

/**
 * 构建顶栏渲染数据
 * 返回纯数据结构，由 app.ts 调用 TUI 渲染
 */
export function buildHeaderData(params: {
  currentState: LoopState;
  taskId: string | null;
}): HeaderArea {
  const { currentState, taskId } = params;

  return {
    appName: "AI Company OS",
    version: "v0.1.0",
    currentState,
    taskId,
  };
}

/**
 * 获取状态的显示信息
 */
export function getStateDisplay(state: LoopState): {
  label: string;
  color: string;
} {
  return STATE_DISPLAY[state] ?? { label: String(state), color: "white" };
}

/**
 * 格式化顶栏内容为字符串（用于非 TUI 场景或调试）
 */
export function formatHeaderString(data: HeaderArea): string {
  const stateInfo = getStateDisplay(data.currentState);
  const taskIdStr = data.taskId ? ` | Task: ${data.taskId.slice(0, 8)}` : "";

  return ` ${data.appName} ${data.version} [${stateInfo.label}]${taskIdStr} `;
}
