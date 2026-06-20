import { SelectList } from "@earendil-works/pi-tui";
/** TUIManager 初始化配置 */
export interface TUIManagerConfig {
    appName: string;
    onInput: (value: string) => Promise<void>;
    onEscape?: () => void;
}
/**
 * TUI 管理器
 *
 * 封装 pi-tui 终端 UI 的完整生命周期：
 * 1. TUI 初始化与组件树构建
 * 2. 流式内容追加与渲染
 * 3. 输入框锁定/解锁
 * 4. Overlay 显示/隐藏
 * 5. Console 拦截/恢复
 */
export declare class TUIManager {
    /** pi-tui TUI 实例 */
    private tui;
    /** pi-tui Terminal 实例 */
    private terminal;
    /** 流式内容区 Markdown 组件 */
    private streamMarkdown;
    /** 流式内容累积文本 */
    private streamContent;
    /** 底部输入框组件 */
    private inputComponent;
    /** 执行中输入框锁定标记 */
    private inputLocked;
    /** 保存原始 console 方法 */
    private _originalConsoleLog;
    private _originalConsoleWarn;
    private _originalConsoleError;
    /** 渲染节流定时器 */
    private _renderTimer;
    /** 是否正在运行 */
    private running;
    /** 输入回调 */
    private onInput;
    /** ESC 回调 */
    private onEscape;
    /** 获取原始 console.log（供全局错误处理等使用） */
    get originalConsoleLog(): typeof console.log | null;
    /** 获取 TUI 实例是否已初始化 */
    get isInitialized(): boolean;
    /** 获取输入锁定状态 */
    get isInputLocked(): boolean;
    /**
     * 初始化 TUI（仅 TTY 环境）
     *
     * 构建 Claude Code 风格布局：
     * ┌──────────────────────────────────────┐
     * │ Header: 状态栏                        │
     * ├──────────────────────────────────────┤
     * │  流式内容区 (Markdown)                │
     * ├──────────────────────────────────────┤
     * │ > 输入框 (Input)                     │
     * └──────────────────────────────────────┘
     */
    initialize(config: TUIManagerConfig): Promise<void>;
    /**
     * 显示 Overlay 浮层
     *
     * 用于 SelectList 等交互式浮层组件。
     */
    showOverlay(content: SelectList, options?: {
        width?: string | number;
        anchor?: string;
    }): void;
    /**
     * 隐藏 Overlay 浮层
     */
    hideOverlay(): void;
    /**
     * 锁定/解锁输入框
     *
     * 执行中锁定输入框，完成后解锁。
     * 每次解锁后重新聚焦 Input 组件，确保键盘事件正确分发。
     */
    setInputLocked(locked: boolean): void;
    /**
     * 追加流式内容到 Markdown 区域
     *
     * 所有 Agent 产出、评估、工具调用、进度信息都通过此方法追加。
     * 自动触发 TUI 重绘。
     */
    appendStream(content: string): void;
    /**
     * 清空流式内容区
     */
    clearStream(): void;
    /**
     * 拦截 console.log/warn/error → 静默丢弃
     *
     * TUI 模式下 console.log 直接输出会破坏差分渲染。
     * 关键日志已通过回调机制输出到流式内容区，console.log 全部静默。
     */
    interceptConsole(): void;
    /**
     * 恢复原始 console 方法
     *
     * 在退出 TUI 模式前调用，确保后续输出正常。
     */
    restoreConsole(): void;
    /**
     * 标记运行状态
     */
    setRunning(running: boolean): void;
    /**
     * 请求重绘
     */
    requestRender(): void;
    /**
     * 销毁 TUI（退出时调用）
     */
    destroy(): void;
    /**
     * 重建整个 TUI 组件树
     *
     * 布局：上方 Markdown 流式区 + 下方 Input 输入框
     */
    private rebuildLayout;
    /** 渲染节流：最多每 200ms 重绘一次 */
    private scheduleRender;
}
//# sourceMappingURL=tui-manager.d.ts.map