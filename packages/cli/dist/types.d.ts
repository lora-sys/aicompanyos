import type { LoopState } from "@aicos/loop-engine/types";
/** 顶栏区域数据 */
export interface HeaderArea {
    appName: string;
    version: string;
    currentState: LoopState;
    taskId: string | null;
}
/** 主区域数据（Loop 可视化 / Modal） */
export interface MainArea {
    mode: "loop" | "modal" | "evolution" | "summary";
}
/** 侧边栏区域数据（MCP 状态 / 工具列表） */
export interface SidebarArea {
    mcpConnections: MCPConnectionInfo[];
    registeredTools: ToolInfo[];
}
/** 底栏区域数据（日志 / 快捷键提示） */
export interface FooterArea {
    logs: LogEntry[];
    shortcuts: ShortcutHint[];
}
/** TUI 完整布局 */
export interface TUILayout {
    header: HeaderArea;
    main: MainArea;
    sidebar: SidebarArea;
    footer: FooterArea;
}
/** MCP 连接状态类型 */
export type MCPStatus = "connected" | "disconnected" | "error";
/** MCP 连接信息 */
export interface MCPConnectionInfo {
    name: string;
    status: MCPStatus;
    toolCount: number;
    error?: string;
}
/** 已注册工具信息 */
export interface ToolInfo {
    name: string;
    category: string;
    source: "mcp" | "local" | "skill";
}
/** 日志级别 */
export type LogLevel = "info" | "warn" | "error" | "debug";
/** 日志条目 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    source: string;
    message: string;
}
/** 快捷键提示 */
export interface ShortcutHint {
    key: string;
    description: string;
}
/** 活跃的 Modal 类型 */
export type ActiveModalType = "interrogate" | "summary" | "evolution-view" | null;
/** Modal 动作类型 */
export type ModalAction = {
    type: "SUBMIT";
    value: string;
} | {
    type: "SKIP";
} | {
    type: "BACK";
} | {
    type: "CONFIRM";
} | {
    type: "CANCEL";
} | {
    type: "NAVIGATE_TO";
    index: number;
};
/** 问题卡片渲染数据 */
export interface QuestionCardData {
    /** 步骤标签，如 "🔍 拷问 · Step 2 of 3" */
    stepLabel: string;
    /** 进度点，如 "● ● ○" */
    progressDots: string;
    /** 维度 emoji，如 "📌" */
    dimensionEmoji: string;
    /** 维度标签，如 "主题方向" */
    dimensionLabel: string;
    /** 已收集信息列表 */
    collectedInfo: string[];
    /** 具体问题文本 */
    promptText: string;
    /** 示例选项/提示 */
    hints: string[];
    /** 当前输入值 */
    inputValue: string;
    /** 底部操作提示 */
    footerHints: string;
}
/** 摘要卡片 Q&A 对 */
export interface SummaryQAPair {
    dimension: string;
    question: string;
    answer: string;
    skipped: boolean;
}
/** 摘要卡片渲染数据 */
export interface SummaryCardData {
    totalQuestions: number;
    qaPairs: SummaryQAPair[];
    canModify: boolean;
    currentIndex?: number;
}
/** Modal 渲染结果 */
export interface ModalRenderResult {
    type: "question" | "summary" | "complete";
    card?: QuestionCardData;
    summary?: SummaryCardData;
}
/** CLI 应用完整状态 */
export interface CLIAppState {
    currentTaskId: string | null;
    currentTaskInput?: string;
    loopState: LoopState;
    mcpStatus: Map<string, MCPStatus>;
    activeModal: ActiveModalType;
    modalData?: unknown;
    logs: LogEntry[];
}
/** Loop 步骤进度信息 */
export interface LoopStepProgress {
    stepLabel: string;
    status: "pending" | "running" | "done" | "error";
    agentName?: string;
    detail?: string;
}
/** Loop 可视化面板数据 */
export interface LoopVisualizationData {
    currentState: LoopState;
    steps: LoopStepProgress[];
    streamingOutput?: string;
}
/** 进化面板数据 */
export interface EvolutionPanelData {
    phase: "analyzing" | "generating" | "applying" | "complete";
    progress: number;
    diffOutput?: string;
    summary?: string;
}
//# sourceMappingURL=types.d.ts.map