import { LoopState } from "@aicos/loop-engine/types";
import type { HeaderArea } from "../types.js";
/**
 * 构建顶栏渲染数据
 * 返回纯数据结构，由 app.ts 调用 TUI 渲染
 */
export declare function buildHeaderData(params: {
    currentState: LoopState;
    taskId: string | null;
}): HeaderArea;
/**
 * 获取状态的显示信息
 */
export declare function getStateDisplay(state: LoopState): {
    label: string;
    color: string;
};
/**
 * 格式化顶栏内容为字符串（用于非 TUI 场景或调试）
 */
export declare function formatHeaderString(data: HeaderArea): string;
//# sourceMappingURL=header.d.ts.map