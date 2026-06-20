// TUI 管理器
// 从 AICOSApp 中抽取的 TUI 生命周期、流式输出、输入锁定、console 拦截逻辑

import {
  TUI,
  Markdown,
  Input,
  SelectList,
  ProcessTerminal,
} from "@earendil-works/pi-tui";

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
export class TUIManager {
  /** pi-tui TUI 实例 */
  private tui: TUI | null = null;
  /** pi-tui Terminal 实例 */
  private terminal: ProcessTerminal | null = null;

  /** 流式内容区 Markdown 组件 */
  private streamMarkdown: Markdown | null = null;
  /** 流式内容累积文本 */
  private streamContent: string = "";
  /** 底部输入框组件 */
  private inputComponent: Input | null = null;
  /** 执行中输入框锁定标记 */
  private inputLocked: boolean = false;

  /** 保存原始 console 方法 */
  private _originalConsoleLog: typeof console.log | null = null;
  private _originalConsoleWarn: typeof console.warn | null = null;
  private _originalConsoleError: typeof console.error | null = null;

  /** 渲染节流定时器 */
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;

  /** 是否正在运行 */
  private running: boolean = false;

  /** 输入回调 */
  private onInput: ((value: string) => Promise<void>) | null = null;
  /** ESC 回调 */
  private onEscape: (() => void) | null = null;

  /** 获取原始 console.log（供全局错误处理等使用） */
  get originalConsoleLog(): typeof console.log | null {
    return this._originalConsoleLog;
  }

  /** 获取 TUI 实例是否已初始化 */
  get isInitialized(): boolean {
    return this.tui !== null;
  }

  /** 获取输入锁定状态 */
  get isInputLocked(): boolean {
    return this.inputLocked;
  }

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
  async initialize(config: TUIManagerConfig): Promise<void> {
    this.onInput = config.onInput;
    this.onEscape = config.onEscape ?? null;

    if (!process.stdin.isTTY) return;

    try {
      this.terminal = new ProcessTerminal();
      this.tui = new TUI(this.terminal, true); // showHardwareCursor=true

      // 初始化流式内容：欢迎信息
      this.streamContent = [
        `# ${config.appName}`,
        "",
        "✏️ 在下方输入框输入任务，按 Enter 提交",
        "",
        "命令:",
        "- `/type seed` → 小红书风格",
        "- `/type article` → 公众号长文",
        "- `/type newsletter` → Newsletter",
        "- `q` → 退出",
        "",
        "---",
        "",
      ].join("\n");

      // 构建初始组件树
      this.rebuildLayout();

      // 启动 TUI 渲染循环
      this.tui.start();

      // 拦截 console → 防止日志破坏 TUI 渲染
      this.interceptConsole();
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      // 降级：TUI 初始化失败，回退到终端模式
      if (this._originalConsoleLog) {
        this._originalConsoleLog(`⚠️ TUI 初始化失败，回退到终端模式: ${err}`);
      }
      this.tui = null;
      this.terminal = null;
    }
  }

  /**
   * 显示 Overlay 浮层
   *
   * 用于 SelectList 等交互式浮层组件。
   */
  showOverlay(content: SelectList, options?: { width?: string | number; anchor?: string }): void {
    if (!this.tui) return;
    this.tui.showOverlay(content, options as any);
  }

  /**
   * 隐藏 Overlay 浮层
   */
  hideOverlay(): void {
    if (!this.tui) return;
    this.tui.hideOverlay();
  }

  /**
   * 锁定/解锁输入框
   *
   * 执行中锁定输入框，完成后解锁。
   * 每次解锁后重新聚焦 Input 组件，确保键盘事件正确分发。
   */
  setInputLocked(locked: boolean): void {
    this.inputLocked = locked;
    if (this.inputComponent) {
      if (locked) {
        this.inputComponent.setValue("");
      }
      // 重新聚焦 Input 组件（确保键盘事件正确分发）
      if (this.tui) {
        this.tui.setFocus(this.inputComponent);
      }
    }
  }

  /**
   * 追加流式内容到 Markdown 区域
   *
   * 所有 Agent 产出、评估、工具调用、进度信息都通过此方法追加。
   * 自动触发 TUI 重绘。
   */
  appendStream(content: string): void {
    try {
      this.streamContent += content;
      if (this.streamMarkdown) {
        this.streamMarkdown.setText(this.streamContent);
      }
      this.scheduleRender();
    } catch {
      // 静默失败 — appendStream 是最底层渲染方法，绝不能抛出异常
      // 降级：写入原始 console（如果可用）
      if (this._originalConsoleLog) {
        try { this._originalConsoleLog("[appendStream fallback]", content); } catch { /* 彻底放弃 */ }
      }
    }
  }

  /**
   * 清空流式内容区
   */
  clearStream(): void {
    this.streamContent = "";
    if (this.streamMarkdown) {
      this.streamMarkdown.setText("");
    }
  }

  /**
   * 拦截 console.log/warn/error → 静默丢弃
   *
   * TUI 模式下 console.log 直接输出会破坏差分渲染。
   * 关键日志已通过回调机制输出到流式内容区，console.log 全部静默。
   */
  interceptConsole(): void {
    this._originalConsoleLog = console.log;
    this._originalConsoleWarn = console.warn;
    this._originalConsoleError = console.error;

    // TUI 模式下：所有 console.log 静默丢弃
    console.log = function(..._args: unknown[]): void {};
    console.warn = function(..._args: unknown[]): void {};
    console.error = function(..._args: unknown[]): void {};
  }

  /**
   * 恢复原始 console 方法
   *
   * 在退出 TUI 模式前调用，确保后续输出正常。
   */
  restoreConsole(): void {
    if (this._originalConsoleLog) console.log = this._originalConsoleLog;
    if (this._originalConsoleWarn) console.warn = this._originalConsoleWarn;
    if (this._originalConsoleError) console.error = this._originalConsoleError;
    this._originalConsoleLog = null;
    this._originalConsoleWarn = null;
    this._originalConsoleError = null;
  }

  /**
   * 标记运行状态
   */
  setRunning(running: boolean): void {
    this.running = running;
  }

  /**
   * 请求重绘
   */
  requestRender(): void {
    if (this.tui) {
      this.tui.requestRender();
    }
  }

  /**
   * 销毁 TUI（退出时调用）
   */
  destroy(): void {
    this.restoreConsole();
    if (this.tui) {
      try {
        this.tui.stop();
      } catch {
        // 忽略
      }
      this.tui = null;
      this.terminal = null;
    }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 重建整个 TUI 组件树
   *
   * 布局：上方 Markdown 流式区 + 下方 Input 输入框
   */
  private rebuildLayout(): void {
    if (!this.tui) return;

    // 清空旧子组件
    this.tui.clear();

    // 1. 流式内容区（Markdown 组件，动态 setText 更新）
    this.streamMarkdown = new Markdown(this.streamContent, 1, 0, {
      heading: (t) => `\x1b[1;36m${t}\x1b[0m`,
      link: (t) => `\x1b[4;34m${t}\x1b[0m`,
      linkUrl: (t) => `\x1b[2;34m${t}\x1b[0m`,
      code: (t) => `\x1b[33m${t}\x1b[0m`,
      codeBlock: (t) => `\x1b[33m${t}\x1b[0m`,
      codeBlockBorder: (t) => `\x1b[90m${t}\x1b[0m`,
      quote: (t) => `\x1b[36m${t}\x1b[0m`,
      quoteBorder: (t) => `\x1b[90m${t}\x1b[0m`,
      hr: (t) => `\x1b[90m${t}\x1b[0m`,
      listBullet: (t) => `\x1b[90m${t}\x1b[0m`,
      bold: (t) => `\x1b[1m${t}\x1b[0m`,
      italic: (t) => `\x1b[3m${t}\x1b[0m`,
      strikethrough: (t) => `\x1b[9m${t}\x1b[0m`,
      underline: (t) => `\x1b[4m${t}\x1b[0m`,
    });
    this.tui.addChild(this.streamMarkdown);

    // 2. 底部输入框（Input 组件，固定焦点）
    this.inputComponent = new Input();
    this.inputComponent.onSubmit = (value: string) => {
      // 关键：onSubmit 在 pi-tui 的 handleInput 链中被调用，
      // 任何异常都会冒泡到 stdin data handler 导致进程崩溃。
      // 必须用 try-catch 包裹，并用 .catch() 捕获 async rejection。
      try {
        if (this.onInput) {
          const result = this.onInput(value);
          if (result && typeof result === "object" && "catch" in result) {
            (result as Promise<void>).catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              this.appendStream("\n⚠️ 输入处理错误: " + msg + "\n\n");
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.appendStream("\n⚠️ 输入处理错误: " + msg + "\n\n");
      }
    };
    this.inputComponent.onEscape = () => {
      if (this.onEscape) {
        this.onEscape();
      }
    };
    this.tui.addChild(this.inputComponent);

    // 设置焦点到输入框
    this.tui.setFocus(this.inputComponent);
  }

  /** 渲染节流：最多每 200ms 重绘一次 */
  private scheduleRender(): void {
    if (this._renderTimer) return; // 已有待执行的渲染
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      if (this.tui && this.running) {
        // 增量更新：只更新 Markdown 内容，不重建整个组件树
        if (this.streamMarkdown) {
          this.streamMarkdown.setText(this.streamContent);
        }
        this.tui.requestRender();
      }
    }, 200);
  }
}
