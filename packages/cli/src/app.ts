// CLI 应用主类
// 整合 TUI 组件、Loop Engine、MCP、Memory 等子系统

import {
  LoopStateMachine,
  LoopState,
  InterrogateEngine,
  PlanEngine,
  ExecutionOrchestrator,
  VerifyEngine,
  RollbackManager,
  ArtifactManager,
  type Artifact,
  ToolRegistry,
  LoopHarness,
  type HarnessExecutionResult,
  type DynamicExample,
  type TaskProfile,
  LoopModule,
  DEFAULT_WRITING_CRITERIA,
  type LLMProvider,
  type InterrogationSession,
  PiAILLMProvider,
} from "@aicos/loop-engine";
import { MemoryManager } from "@aicos/memory";
import { MCPClientAdapter, EXA_MCP_CONFIG } from "@aicos/mcp";

import { WriterAgent } from "@aicos/subagents/writer";
import { CriticAgent } from "@aicos/subagents/critic";

// ★ ADR-005: 内容产出部 — 部门配置
import {
  ContentProductionDepartment,
  initDepartmentMemory,
  contentProductionDept,
  OutputPipeline,
} from "@aicos/content-production";
import type { ContentType, DepartmentConfig } from "@aicos/loop-engine";

import type {
  CLIAppState,
  LogEntry,
  ActiveModalType,
  MCPStatus,
} from "./types.js";

import { InterrogateModal } from "./components/interrogate-modal.js";
import { buildHeaderData, formatHeaderString, getStateDisplay } from "./components/header.js";
import {
  buildLoopVisualizationData,
  formatLoopASCII,
} from "./components/loop-visualization.js";
import { buildSidebarData, formatSidebarString } from "./components/sidebar.js";
import { buildFooterData, formatFooterString } from "./components/footer.js";
import {
  buildEvolutionPanelData,
  formatEvolutionString,
} from "./components/evolution-panel.js";

// ★ pi-tui 组件库 — 终端 UI 原生组件
import {
  TUI,
  Box,
  Text,
  Loader,
  Markdown,
  Input,
  SelectList,
  type Component,
  ProcessTerminal,
  StdinBuffer,
} from "@earendil-works/pi-tui";

/**
 * AI Company OS CLI 应用
 * 负责初始化所有组件、管理应用状态、协调 Loop 执行流程
 */
export class AICOSApp {
  /** TUI 实例（pi-tui 差分渲染引擎） */
  private tui: TUI | null = null;
  /** pi-tui Terminal 实例 */
  private terminal: ProcessTerminal | null = null;

  /** 应用状态 */
  private state: CLIAppState;

  /** Loop 状态机 */
  private stateMachine: LoopStateMachine | null = null;

  /** 可变的 Loop 上下文引用（用于跨方法共享） */
  private loopContext: import("@aicos/loop-engine").LoopContext | null = null;

  /** 拷问引擎 */
  private interrogateEngine: InterrogateEngine | null = null;

  /** 规划引擎 */
  private planEngine: PlanEngine | null = null;

  /** 编排器 */
  private orchestrator: ExecutionOrchestrator | null = null;

  /** 验证引擎 */
  private verifyEngine: VerifyEngine | null = null;

  /** 回滚管理器 */
  private rollbackManager: RollbackManager | null = null;

  /** 产物管理器 */
  private artifactManager: ArtifactManager;

  /** 记忆管理器（self.jsonl / user.jsonl / self.md / user.md） */
  private memoryManager: MemoryManager;

  /** 当前活跃的 Modal */
  private activeInterrogateModal: InterrogateModal | null = null;

  // ★ Claude Code 风格 TUI 组件
  /** 流式内容区 Markdown 组件（动态 setText 更新） */
  private streamMarkdown: Markdown | null = null;
  /** 流式内容累积文本 */
  private streamContent: string = "";
  /** 底部输入框组件 */
  private inputComponent: Input | null = null;
  /** 执行中输入框锁定标记 */
  private inputLocked: boolean = false;
  /** ★ 拷问阶段等待 Promise 的 resolve 函数 */
  private interrogateResolve: (() => void) | null = null;
  /** Header Text 组件引用（用于增量更新） */
  private headerText: Text | null = null;
  /** StatusBar Text 组件引用（用于增量更新） */
  private statusBarText: Text | null = null;

  /** LLM Provider */
  private llmProvider: LLMProvider;

  /** 工具注册表 */
  private toolRegistry: ToolRegistry;

  /** Loop Harness（委托给 LoopModule） */
  private loopHarness: LoopHarness;

  /** Writer Agent 实例 */
  private writerAgent: WriterAgent | null = null;

  /** Critic Agent 实例 */
  private criticAgent: CriticAgent | null = null;

  /** 拷问结果缓存（用于传递给规划阶段） */
  private cachedInterrogationResults: Record<string, string> = {};

  // ★ ADR-005: 内容类型选择
  /** 当前选中的内容格式 */
  private selectedContentType: ContentType | null = null;
  /** 当前激活的部门配置 */
  private activeDepartmentConfig: DepartmentConfig | null = null;
  /** 内容产出部实例 */
  private contentDept = new ContentProductionDepartment();

  /** 是否正在运行 */
  private running: boolean = false;

  constructor(llmProvider?: LLMProvider) {
    // 优先使用传入的 provider，否则尝试创建真实 Provider，最后 fallback 到 Mock
    if (llmProvider) {
      this.llmProvider = llmProvider;
    } else {
      this.llmProvider = this.createDefaultLLMProvider();
    }

    // 初始化工具注册表
    this.toolRegistry = new ToolRegistry();
    this.toolRegistry.registerLocalTools(this.llmProvider);

    // 初始化 Loop Harness（★ v0.4.0: 默认启用 pi-agent-core 引擎 + 流式回调）
    const usePiCore = process.env.AICOS_USE_LEGACY_ENGINE !== "1";
    this.loopHarness = new LoopHarness(this.toolRegistry, this.llmProvider, {
      usePiAgentCore: usePiCore,

      // ★ v0.4.0: 执行进度回调 → 流式输出到 TUI
      onIterationStart: (iteration, stepId) => {
        this.appendStream(`\n---\n**⏳ Iteration ${iteration}** \`${stepId}\`\n\n`);
      },
      onWriterOutput: (content, iteration) => {
        // Writer 产出：显示前 300 字预览
        const preview = content.slice(0, 300).replace(/\n/g, "\n> ");
        this.appendStream(`\n**📝 Writer 产出** (Iteration ${iteration}):\n\n> ${preview}${content.length > 300 ? "..." : ""}\n\n`);
      },
      onCriticResult: (score, passed, suggestions, iteration) => {
        const status = passed ? "✅ 通过" : "❌ 未通过";
        this.appendStream(`\n**🔍 Critic 评估** (Iteration ${iteration}): **${score}/100** ${status}\n\n`);
        if (suggestions.length > 0) {
          this.appendStream(`改进建议:\n`);
          for (const s of suggestions.slice(0, 3)) {
            this.appendStream(`- ${s.slice(0, 80)}\n`);
          }
          this.appendStream("\n");
        }
      },
      onGoalProgress: (verified, total, reason) => {
        const bar = "█".repeat(verified) + "░".repeat(total - verified);
        this.appendStream(`**🎯 目标进度**: [${bar}] ${verified}/${total} (${reason})\n\n`);
      },
      onStepComplete: (stepId, score, passed) => {
        const status = passed ? "✅" : "❌";
        this.appendStream(`\n**${status} Step 完成**: \`${stepId}\` — score: ${score}/100\n\n`);
      },
    });
    this.loopHarness.setCriteria(DEFAULT_WRITING_CRITERIA);

    if (usePiCore) {
      // ★ 连接 pi-agent-core 事件到流式内容区
      this.loopHarness.setPiEventForwarder((event: any) => {
        const eventType = event?.type ?? "unknown";
        if (eventType === "agent_start") {
          this.appendStream("**▶ Agent 启动**\n\n");
        } else if (eventType === "turn_end") {
          this.appendStream("**◆ 迭代完成**\n\n");
        } else if (eventType === "tool_execution_start") {
          this.appendStream(`🔧 \`${event.toolName}\` 执行中...\n`);
        } else if (eventType === "tool_execution_end") {
          const status = event.isError ? " ❌" : " ✅";
          this.appendStream(`🔧 \`${event.toolName}\`${status}\n\n`);
        } else if (eventType === "agent_end") {
          this.appendStream("**■ Agent 执行结束**\n\n");
        }
      });
    }

    // 初始化产物管理器
    this.artifactManager = new ArtifactManager();

    // 初始化记忆管理器（self.jsonl / user.jsonl 持久化）
    this.memoryManager = new MemoryManager(process.cwd());

    // 初始化应用状态
    this.state = {
      currentTaskId: null,
      loopState: LoopState.IDLE,
      mcpStatus: new Map<string, MCPStatus>(),
      activeModal: null,
      logs: [],
    };

    // TUI 实例（延迟初始化，在 start() 中根据 TTY 环境决定）
    // this.tui / this.terminal 已在属性声明中初始化为 null
  }

  /**
   * 初始化应用
   * 创建各引擎实例、建立事件监听
   */
  async initialize(): Promise<void> {
    this.addLog("info", "app", "正在初始化 AI Company OS...");

    // 初始化各引擎（使用真实/mock LLM Provider）
    this.interrogateEngine = new InterrogateEngine(this.llmProvider);
    this.planEngine = new PlanEngine(this.llmProvider);
    this.verifyEngine = new VerifyEngine(this.llmProvider);

    // 创建并注册 Agent（实现 IGeneratorAgent / IEvaluatorAgent 接口）
    this.writerAgent = new WriterAgent(this.toolRegistry, this.llmProvider);
    this.criticAgent = new CriticAgent(this.llmProvider, DEFAULT_WRITING_CRITERIA);

    this.loopHarness.registerAgent("writer", () => this.writerAgent!);
    this.loopHarness.registerAgent("critic", () => this.criticAgent!);

    this.addLog("info", "app", "WriterAgent + CriticAgent 已注册到 LoopHarness");
    // RollbackManager 延迟到有 stateMachine 时创建

    this.addLog("info", "app", "引擎初始化完成");

    // ★ 初始化 MCP 连接（Exa 搜索服务）
    try {
      const mcpAdapter = new MCPClientAdapter();
      this.addLog("info", "mcp", `正在连接 Exa MCP Server (${EXA_MCP_CONFIG.url})...`);
      const exaInfo = await mcpAdapter.connect(EXA_MCP_CONFIG);
      this.addLog("info", "mcp", `✅ Exa MCP 已连接，发现 ${exaInfo.tools.length} 个工具: ${exaInfo.tools.map(t => t.name).join(", ")}`);

      // 注册 MCP 工具到 ToolRegistry（自动创建 web_search 等别名）
      this.toolRegistry.connectMCP(mcpAdapter);
      this.addLog("info", "mcp", `✅ MCP 工具已注册到 ToolRegistry（含别名: web_search → exa_exa_web_search）`);

      // 更新状态
      this.state.mcpStatus.set("Exa Server", "connected");
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.addLog("warn", "mcp", `⚠️ Exa MCP 连接失败（非致命）: ${err}`);
      this.addLog("warn", "mcp", `web_search 工具将不可用，WriterAgent 会跳过搜索步骤`);
      this.state.mcpStatus.set("Exa Server", "error");
    }

    // ★ ADR-005: 初始化内容产出部专用记忆（design.mdx / self.jsonl / user.jsonl）
    try {
      const memResult = await initDepartmentMemory(process.cwd());
      this.addLog("info", "department",
        `内容产出部记忆初始化: design.mdx=${memResult.designMDX}, self.jsonl=${memResult.selfJSONL}, user.jsonl=${memResult.userJSONL}`
      );
    } catch (e) {
      this.addLog("warn", "department",
        `部门记忆初始化失败（非致命）: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  /**
   * 启动 TUI
   * 进入主循环等待用户输入
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.addLog("info", "app", "AI Company OS 已启动");

    // ★ 初始化 pi-tui TUI（仅 TTY 环境）
    if (process.stdin.isTTY) {
      try {
        this.terminal = new ProcessTerminal();
        this.tui = new TUI(this.terminal, true); // showHardwareCursor=true

        // ★ 初始化流式内容：欢迎信息
        this.streamContent = [
          "# AI Company OS v0.1.0",
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

        // 启动 TUI 渲染循环（pi-tui 自主管理差分渲染 + 输入分发）
        this.tui.start();

        // ★ 拦截 console.log → 追加到流式内容区（而非破坏 TUI 渲染）
        this.interceptConsoleToStream();

        this.addLog("info", "app", "✅ pi-tui TUI 已启动（差分渲染模式）");
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        this.addLog("warn", "app", `⚠️ TUI 初始化失败，回退到终端模式: ${err}`);
        this.tui = null;
        this.terminal = null;
      }
    }

    // 首次渲染（非 TUI 模式或 TUI 失败时回退）
    if (!this.tui) {
      console.log(formatWelcomeScreen());
      this.showContentTypeMenu();
      console.log("\n输入任务描述开始，或输入 'q' 退出。\n");
    }

    // ★ 全局错误处理：防止未捕获异常导致 TUI 退出
    // ★★★ 绝不能调用 appendStream()！如果 appendStream 本身是崩溃原因，会导致递归崩溃
    process.on("uncaughtException", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      // 降级到原始 console（在 interceptConsoleToStream 之前保存的引用）
      if (this._originalConsoleLog) {
        this._originalConsoleLog("\n⚠️ 未捕获异常:", msg, "\n");
      }
      // 不退出进程，让 TUI 继续运行
    });

    process.on("unhandledRejection", (reason) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      if (this._originalConsoleLog) {
        this._originalConsoleLog("\n⚠️ 未处理的 Promise 拒绝:", msg, "\n");
      }
      // 不退出进程，让 TUI 继续运行
    });
  }

  /**
   * 重建整个 TUI 组件树（Claude Code 风格：上方流式 + 下方输入框）
   *
   * 布局结构：
   * ┌──────────────────────────────────────┐
   * │ Header: 状态栏                        │
   * ├──────────────────────────────────────┤
   * │                                      │
   * │  流式内容区 (Markdown)                │  ← 70%
   * │  - Writer 产出                       │
   * │  - Critic 评估                       │
   * │  - 工具调用过程                       │
   * │  - 目标完成度进度                     │
   * │                                      │
   * ├──────────────────────────────────────┤
   * │ > 输入框 (Input)                     │  ← 底部固定
   * │ 状态提示 + 快捷键                     │
   * └──────────────────────────────────────┘
   */
  private rebuildLayout(): void {
    if (!this.tui) return;

    // 清空旧子组件
    this.tui.clear();

    // ★ 整个 TUI 只有两个组件：Markdown 流式区 + Input 输入框
    // Header 和 StatusBar 信息合并到 Markdown 内容中

    // 1. 流式内容区（Markdown 组件，动态 setText 更新）
    //    包含：Header 状态 + 拷问/规划/执行内容 + StatusBar 提示
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
      // ★ 关键：onSubmit 在 pi-tui 的 handleInput 链中被调用，
      // 任何异常都会冒泡到 stdin data handler 导致进程崩溃。
      // 必须用 try-catch 包裹，并用 .catch() 捕获 async rejection。
      try {
        const result = this.handleInput(value);
        // handleInput 是 async 的，必须捕获 rejection
        if (result && typeof result === "object" && "catch" in result) {
          (result as Promise<void>).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.appendStream("\n⚠️ 输入处理错误: " + msg + "\n\n");
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.appendStream("\n⚠️ 输入处理错误: " + msg + "\n\n");
      }
    };
    this.inputComponent.onEscape = () => {
      // ★ ESC 跳过当前拷问问题（如果正在拷问阶段）
      try {
        if (this.activeInterrogateModal && this.interrogateEngine) {
          this.handleInterrogateInput("__SKIP__");
        }
      } catch {
        // 兜底：直接 resolve interrogate
        this.resolveInterrogate();
      }
    };
    this.tui.addChild(this.inputComponent);

    // 设置焦点到输入框
    this.tui.setFocus(this.inputComponent);
  }

  /** 构建 Header 文本 */
  private buildHeaderText(): string {
    const stateInfo = getStateDisplay(this.state.loopState);
    const taskIdStr = this.state.currentTaskId ? ` | Task: ${this.state.currentTaskId.slice(0, 8)}` : "";
    return ` AI Company OS v0.1.0 [${stateInfo.label}]${taskIdStr} `;
  }

  /** 构建 StatusBar 文本 */
  private buildStatusBarText(): string {
    const stateInfo = getStateDisplay(this.state.loopState);
    const lockIcon = this.inputLocked ? "🔒" : "✏️";
    return this.inputLocked
      ? ` ${lockIcon} ${stateInfo.label} · Esc: 跳过 · q: 退出 `
      : ` ${lockIcon} Enter: 提交 · /type: 切换类型 · q: 退出 `;
  }

  /** ★ 增量更新 Header 和 StatusBar（更新流式内容的首行和末行） */
  private updateHeaderContent(): void {
    // Header/StatusBar 信息已在 appendStream 中更新，无需额外操作
  }

  private updateStatusBarContent(): void {
    // 同上
  }

  /**
   * 主渲染入口
   * TUI 模式：重建组件树并请求重绘
   * 非TUI模式：回退到终端输出
   */
  render(): void {
    if (this.tui) {
      // ★ pi-tui 模式：增量更新（不重建组件树！）
      // 只更新 Header 和 StatusBar 的文本内容，不销毁 Input 组件
      this.updateHeaderContent();
      this.updateStatusBarContent();
      this.tui.requestRender();
    } else {
      // 回退模式：手写 ASCII art
      this.renderToTerminal();
    }
  }

  // ============================================================
  // ★ pi-tui 组件构建方法（返回 Component 树）
  // ============================================================

  /** 构建顶栏组件: Box + Text（应用名 + 状态 + TaskID） */
  private buildHeaderComponent(): Component {
    const stateInfo = getStateDisplay(this.state.loopState);
    const taskIdStr = this.state.currentTaskId ? ` | Task: ${this.state.currentTaskId.slice(0, 8)}` : "";
    const headerText = ` AI Company OS v0.1.0 [${stateInfo.label}]${taskIdStr} `;

    const box = new Box(1, 0, (t) => `\x1b[44;97m${t}\x1b[0m`);
    box.addChild(new Text(headerText, 0, 0));
    return box;
  }

  /** 构建主区域组件: 根据 mode 返回不同内容 */
  private buildMainComponent(): Component {
    const mode = this.getMainMode();

    switch (mode) {
      case "modal":
        return this.buildModalComponent();
      case "evolution": {
        const evoData = buildEvolutionPanelData({ phase: "analyzing", progress: 50 });
        // ★ Markdown 渲染进化面板
        const mdContent = "## Evolution\n\n**Phase**: `" + evoData.phase + "'\n\nProgress: " + "█".repeat(Math.floor(evoData.progress / 5)) + "░".repeat(20 - Math.floor(evoData.progress / 5)) + " " + evoData.progress + "%\n";
        const box = new Box(1, 1);
        box.addChild(new Markdown(mdContent, 1, 1, {
          heading: (t) => "\x1b[1;35m" + t + "\x1b[0m",
          link: (t) => "\x1b[4;34m" + t + "\x1b[0m",
          linkUrl: (t) => "\x1b[2;34m" + t + "\x1b[0m",
          code: (t) => "\x1b[33m" + t + "\x1b[0m",
          codeBlock: (t) => "\x1b[33m" + t + "\x1b[0m",
          codeBlockBorder: (t) => "\x1b[90m" + t + "\x1b[0m",
          quote: (t) => "\x1b[36m" + t + "\x1b[0m",
          quoteBorder: (t) => "\x1b[90m" + t + "\x1b[0m",
          hr: (t) => "\x1b[90m" + t + "\x1b[0m",
          listBullet: (t) => "\x1b[90m" + t + "\x1b[0m",
          bold: (t) => "\x1b[1m" + t + "\x1b[0m",
          italic: (t) => "\x1b[3m" + t + "\x1b[0m",
          strikethrough: (t) => "\x1b[9m" + t + "\x1b[0m",
          underline: (t) => "\x1b[4m" + t + "\x1b[0m",
        }));
        return box;
      }
      case "summary": {
        const box = new Box(1, 1);
        box.addChild(new Text("✅ 任务完成！查看 artifacts/ 目录获取产出物。", 1, 1));
        return box;
      }
      default: {
        // loop 模式 — IDLE 时显示输入提示，其他状态显示循环图+进度
        const box = new Box(1, 1);

        if (this.state.loopState === LoopState.IDLE) {
          // ★ 任务输入提示（IDLE 状态）
          const lines = [
            "",
            "  ┌──────────────────────────────────────────┐",
            "  │                                          │",
            "  │   ✏️  输入你的任务，然后按 Enter 提交       │",
            "  │                                          │",
            "  │   示例: 写一篇关于XX的小红书笔记           │",
            "  │         帮我写一篇公众号文章               │",
            "  │                                          │",
            "  │   /type seed     → 小红书风格             │",
            "  │   /type article  → 公众号长文             │",
            "  │   /type newsletter→ Newsletter           │",
            "  │                                          │",
            "  └──────────────────────────────────────────┘",
            "",
          ];
          box.addChild(new Text(lines.join("\n"), 1, 1));
        } else {
          // 非空闲状态：显示循环执行状态图 + 进度信息
          const loopData = buildLoopVisualizationData({
            currentState: this.state.loopState,
          });
          box.addChild(new Text(formatLoopASCII(loopData), 1, 1));
          // ★ 附加进度信息（从最新日志提取关键状态）
          box.addChild(this.buildProgressComponent());
        }

        return box;
      }
    }
  }

  /** 构建拷问 Modal 组件（Box overlay 风格） */
  private buildModalComponent(): Component {
    if (!this.activeInterrogateModal) {
      return new Text("（无活跃 Modal）", 1, 1);
    }

    const renderResult = this.activeInterrogateModal.render();
    if (renderResult.type === "question" && renderResult.card) {
      const card = renderResult.card;
      const lines: string[] = [];
      lines.push(`┌─ 拷问向导 ─────────────────────────┐`);
      lines.push(`│  ${card.stepLabel.padEnd(34)}│`);
      lines.push(`│  ${card.progressDots.padEnd(34)}│`);
      lines.push("│                                      │");
      lines.push(`│  ${card.dimensionEmoji} ${card.dimensionLabel}`.padEnd(39) + "│");
      lines.push("│                                      │");

      if (card.collectedInfo.length > 0) {
        lines.push("│  已收集信息:                          │");
        for (const info of card.collectedInfo) {
          lines.push(`│    • ${info.slice(0, 30).padEnd(30)}│`);
        }
        lines.push("│                                      │");
      }

      lines.push("│  问题:                                │");
      const words = card.promptText.split(" ");
      let line = "│    ";
      for (const word of words) {
        if ((line + word).length > 37) {
          lines.push(line.padEnd(38) + "│");
          line = "│    ";
        }
        line += word + " ";
      }
      lines.push(line.padEnd(38) + "│");

      if (card.hints.length > 0) {
        lines.push("│                                      │");
        lines.push("│  提示:                                │");
        for (const hint of card.hints.slice(0, 3)) {
          lines.push(`│    - ${hint.slice(0, 30).padEnd(30)}│`);
        }
      }

      lines.push("│                                      │");
      lines.push(`│  > ${"_".repeat(30)}│`);
      lines.push(`│  ${card.footerHints.padEnd(34)}│`);
      lines.push("└──────────────────────────────────────┘");

      return new Text(lines.join("\n"), 1, 1);
    }

    return new Text("（Modal 渲染中...）", 1, 1);
  }

  /** ★ 构建执行进度组件（PLANNING/EXECUTING 状态下替代空白 Modal） */
  private buildProgressComponent(): Component {
    const state = this.state.loopState;
    const stateLabel = {
      [LoopState.INTERROGATING]: "拷问中",
      [LoopState.PLANNING]: "规划中",
      [LoopState.EXECUTING]: "执行中",
      [LoopState.VERIFYING]: "验证中",
      [LoopState.EVOLVING]: "进化中",
      [LoopState.DONE]: "完成",
      [LoopState.IDLE]: "空闲",
    }[state] ?? state;

    const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][Date.now() % 10];

    const lines = [
      "",
      `  ${spinner} ${stateLabel}...`,
      "",
      `  状态: ${state}`,
      `  任务: ${this.state.currentTaskId ?? "-"}`,
      "",
    ];

    return new Text(lines.join("\n"), 1, 1);
  }

  /** ★ 构建底部状态栏组件（快捷键提示 + 状态信息） */
  private buildStatusBarComponent(): Component {
    const stateInfo = getStateDisplay(this.state.loopState);
    const lockIcon = this.inputLocked ? "🔒" : "✏️";
    const statusText = this.inputLocked
      ? ` ${lockIcon} ${stateInfo.label} · Esc: 跳过 · q: 退出 `
      : ` ${lockIcon} Enter: 提交 · /type: 切换类型 · q: 退出 `;
    return new Text(statusText, 0, 0);
  }

  // ============================================================
  // ★ 流式内容管理（Claude Code 风格）
  // ============================================================

  /**
   * 追加流式内容到 Markdown 区域
   *
   * 所有 Agent 产出、评估、工具调用、进度信息都通过此方法追加。
   * 自动触发 TUI 重绘。
   */
  private appendStream(content: string): void {
    try {
      this.streamContent += content;
      if (this.streamMarkdown) {
        this.streamMarkdown.setText(this.streamContent);
      }
      this.scheduleRender();
    } catch {
      // ★ 静默失败 — appendStream 是最底层渲染方法，绝不能抛出异常
      // 否则所有 30+ 调用点都会崩溃，包括全局错误处理器（导致递归崩溃）
      // 降级：写入原始 console（如果可用）
      if (this._originalConsoleLog) {
        try { this._originalConsoleLog("[appendStream fallback]", content); } catch { /* 彻底放弃 */ }
      }
    }
  }

  /**
   * 清空流式内容区
   */
  private clearStream(): void {
    this.streamContent = "";
    if (this.streamMarkdown) {
      this.streamMarkdown.setText("");
    }
  }

  /**
   * ★ 锁定/解锁输入框
   *
   * 执行中锁定输入框，完成后解锁。
   * ★ 每次解锁后重新聚焦 Input 组件，确保键盘事件正确分发。
   */
  private setInputLocked(locked: boolean): void {
    this.inputLocked = locked;
    if (this.inputComponent) {
      if (locked) {
        this.inputComponent.setValue("");
      }
      // ★ 重新聚焦 Input 组件（确保键盘事件正确分发）
      if (this.tui) {
        this.tui.setFocus(this.inputComponent);
      }
    }
  }

  /** 构建侧边栏组件: MCP 状态 + 工具列表 */
  private buildSidebarComponent(): Component {
    const sidebarData = buildSidebarData({
      mcpConnections: Array.from(this.state.mcpStatus.entries()).map(([name, status]) => ({
        name,
        status,
        toolCount: status === "connected" ? 3 : 0,
      })),
    });

    return new Text(formatSidebarString(sidebarData), 1, 1);
  }

  /** 构建底栏组件: 日志流 + 快捷键提示（★ pi-tui Markdown 富文本渲染） */
  private buildFooterComponent(): Component {
    const footerData = buildFooterData({ logs: this.state.logs });
    const mdContent = AICOSApp.buildLogMarkdown(footerData);

    return new Markdown(mdContent, 1, 1, {
      heading: function(t: string) { return "\x1b[1;36m" + t + "\x1b[0m"; },
      link: function(t: string) { return "\x1b[4;34m" + t + "\x1b[0m"; },
      linkUrl: function(t: string) { return "\x1b[2;34m" + t + "\x1b[0m"; },
      code: function(t: string) { return "\x1b[33m" + t + "\x1b[0m"; },
      codeBlock: function(t: string) { return "\x1b[33m" + t + "\x1b[0m"; },
      codeBlockBorder: function(t: string) { return "\x1b[90m" + t + "\x1b[0m"; },
      quote: function(t: string) { return "\x1b[36m" + t + "\x1b[0m"; },
      quoteBorder: function(t: string) { return "\x1b[90m" + t + "\x1b[0m"; },
      hr: function() { return "\x1b[90m" + "─".repeat(50) + "\x1b[0m"; },
      listBullet: function(t: string) { return "\x1b[90m" + t + "\x1b[0m"; },
      bold: function(t: string) { return "\x1b[1m" + t + "\x1b[0m"; },
      italic: function(t: string) { return "\x1b[3m" + t + "\x1b[0m"; },
      strikethrough: function(t: string) { return "\x1b[9m" + t + "\x1b[0m"; },
      underline: function(t: string) { return "\x1b[4m" + t + "\x1b[0m"; },
    });
  }

  /**
   * 构建 Markdown 格式的日志内容（独立静态方法，避免模板字符串中反引号嵌套问题）
   */
  private static buildLogMarkdown(footerData: import("./types.js").FooterArea): string {
    const BT = String.fromCharCode(96); // 反引号
    const recentLogs = footerData.logs.slice(-6);
    let md = "**Logs**\n\n";

    if (recentLogs.length === 0) {
      md += "_暂无日志_\n";
    } else {
      for (let i =  0; i < recentLogs.length; i++) {
        const log = recentLogs[i];
        const icon = log.level === "error" ? "\u{1F534}" : log.level === "warn" ? "\u{1F7E1}" : "\u{1F7E2}";
        const time = log.timestamp.slice(11, 19);
        md += "- " + icon + " " + BT + "[" + time + "]" + BT + " **" + log.source + "**: " + log.message + "\n";
      }
    }

    md += "\n---\n";
    for (let i = 0; i < footerData.shortcuts.length; i++) {
      if (i > 0) md += " | ";
      const s = footerData.shortcuts[i];
      md += "**" + s.key + "**: " + s.description;
    }
    return md;
  }

  /**
   * 处理用户输入
   * 分发到对应的处理器
   */
  async handleInput(input: string): Promise<void> {
    const trimmed = input.trim();

    // ★ 清空 Input 组件的值（为下一次输入做准备）
    if (this.inputComponent) {
      this.inputComponent.setValue("");
    }

    // ★★★ 优先级 1：拷问阶段输入（必须在 q/inputLocked 之前判断！）
    // 否则用户在拷问阶段输入 q 会被全局快捷键拦截导致 TUI 退出
    if (this.state.activeModal === "interrogate" && this.activeInterrogateModal) {
      await this.handleInterrogateInput(trimmed);
      return;
    }

    // ★★★ 优先级 2：执行中锁定（只接受 q 退出）
    if (this.inputLocked) {
      if (trimmed.toLowerCase() === "q") {
        this.quit();
      }
      return;
    }

    // ★★★ 优先级 3：全局快捷键（仅在非拷问、非锁定时生效）
    if (trimmed.toLowerCase() === "q") {
      this.quit();
      return;
    }

    // ★ ADR-005: 内容类型选择命令
    const typeMatch = trimmed.match(/^\/(?:type|格式)\s+(\S+)$/i);
    if (typeMatch) {
      this.selectContentType(typeMatch[1] as ContentType);
      this.appendStream(`\n> 已选择内容类型: **${typeMatch[1]}**\n\n`);
      return;
    }

    // /type 或 /格式 显示可用类型列表
    if (trimmed === "/type" || trimmed === "/格式" || trimmed.toLowerCase() === "help") {
      this.showContentTypeMenu();
      return;
    }

    // 默认：作为新任务提交
    await this.submitTask(trimmed);
  }

  /**
   * 提交新任务（Claude Code 风格：流式显示执行过程）
   *
   * ★ 关键：executeLoop() 在后台运行（不 await），
   * 让 TUI 渲染循环继续工作，这样 appendStream() 的内容才能实时显示。
   */
  async submitTask(input: string): Promise<void> {
    if (!input || input.length === 0) {
      return;
    }

    // 生成任务 ID
    const taskId = generateTaskId();
    this.state.currentTaskId = taskId;
    this.state.currentTaskInput = input;

    // ★ 流式输出：显示用户输入
    this.appendStream(`\n## 任务\n\n> ${input}\n\n`);

    // ★ 锁定输入框
    this.setInputLocked(true);

    // ★ 在后台运行 executeLoop（不 await），让 TUI 渲染循环继续工作
    this.executeLoop(input)
      .then(() => {
        // ★ 解锁输入框
        this.setInputLocked(false);
        this.appendStream("\n---\n\n✅ 任务完成。输入新任务继续，或按 `q` 退出。\n\n");
      })
      .catch((err) => {
        this.setInputLocked(false);
        const msg = err instanceof Error ? err.message : String(err);
        this.appendStream("\n❌ 任务失败: " + msg + "\n\n输入新任务继续，或按 q 退出。\n\n");
      });
  }

  /**
   * 执行完整 Loop 流程
   * 核心编排逻辑：
   * 1. INTERROGATING → 拷问
   * 2. PLANNING → 计划生成
   * 3. EXECUTING → 执行计划
   * 4. VERIFYING → 验证结果
   * 5. EVOLVING → 进化优化
   * 6. DONE → 完成
   */
  async executeLoop(taskInput: string): Promise<void> {
    // 创建 Loop 上下文和状态机
    const context: import("@aicos/loop-engine").LoopContext = {
      taskId: this.state.currentTaskId!,
      taskInput,
      retryCount: 0,
      consensusRound: 0,
    };

    // 保存可变引用供其他方法使用
    this.loopContext = context;

    this.stateMachine = new LoopStateMachine(context);

    // 创建 RollbackManager（需要 stateMachine）
    this.rollbackManager = new RollbackManager(this.stateMachine);

    // 监听状态变更事件
    this.stateMachine.eventEmitter.on("stateChange", (event) => {
      try {
        this.state.loopState = event.nextState;
        this.addLog(
          "info",
          "loop",
          `状态变更: ${event.previousState} → ${event.nextState}${event.reason ? ` (${event.reason})` : ""}`
        );
        this.render();
      } catch (err) {
        // ★ 状态变更回调异常不能中断 executeLoop
        if (this._originalConsoleLog) {
          this._originalConsoleLog("[stateChange error]", err);
        }
      }
    });

    try {
      // ===== Step 1: INTERROGATING =====
      this.appendStream("### 🔍 拷问阶段\n\n");
      await this.stateMachine.transition(LoopState.INTERROGATING, "开始拷问");
      await this.runInterrogationPhase(taskInput);

      // ===== Step 2: PLANNING =====
      this.appendStream("### 📋 规划阶段\n\n");
      await this.stateMachine.transition(LoopState.PLANNING, "开始规划");
      await this.runPlanningPhase(taskInput);

      // ===== Step 3-4: EXECUTING + VERIFYING（带重试） =====
      let verified = false;
      let maxRetries = 3;

      while (!verified && context.retryCount < maxRetries) {
        this.appendStream(`### ⚡ 执行阶段 (尝试 ${context.retryCount + 1})\n\n`);
        await this.stateMachine.transition(LoopState.EXECUTING, `执行计划 (尝试 ${context.retryCount + 1})`);
        await this.runExecutionPhase();

        this.appendStream("### ✅ 验证阶段\n\n");
        await this.stateMachine.transition(LoopState.VERIFYING, "验证结果");
        verified = await this.runVerificationPhase();

        if (!verified && context.retryCount < maxRetries - 1) {
          this.appendStream("### 🔄 Replan\n\n");
          if (this.rollbackManager) {
            await this.rollbackManager.rollback(context.taskId);
          }
          context.retryCount++;
          await this.stateMachine.transition(LoopState.PLANNING, `Replan (第 ${context.retryCount} 次)`);
          await this.runPlanningPhase(taskInput);
        }
      }

      if (!verified) {
        this.appendStream("\n❌ 达到重试上限，任务终止。\n\n");
        return;
      }

      // ===== Step 5: EVOLVING =====
      this.appendStream("### 🧬 进化阶段\n\n");
      await this.stateMachine.transition(LoopState.EVOLVING, "开始进化");
      await this.runEvolutionPhase();

      // ===== Step 6: DONE =====
      await this.stateMachine.transition(LoopState.DONE, "任务完成");
      this.addLog("info", "loop", "✅ Loop 执行完成！");

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog("error", "loop", `Loop 执行出错: ${message}`);
      this.appendStream("\n❌ Loop 执行出错: " + message + "\n\n");
      // ★ 必须重新抛出，让 submitTask 的 .catch() 正确处理（解锁输入框、显示错误）
      throw error;
    }
  }

  /**
   * 显示拷问 Modal
   */
  showInterrogateModal(session: InterrogationSession): void {
    if (!this.interrogateEngine) return;

    this.activeInterrogateModal = new InterrogateModal(session, this.interrogateEngine);
    this.state.activeModal = "interrogate";
    this.render();
  }

  /**
   * 关闭 Modal
   */
  closeModal(): void {
    this.activeInterrogateModal = null;
    this.state.activeModal = null;
    this.render();
  }

  // ★ ADR-005: 内容类型选择（部门路由核心）

  /**
   * 显示可用内容格式菜单
   * ★ TUI 模式：使用 pi-tui SelectList overlay
   * 非TUI模式：回退到 console.log
   */
  showContentTypeMenu(): void {
    const types = this.contentDept.getAvailableTypes();

    // ★ TUI 模式：用 SelectList overlay 替代 console.log
    if (this.tui) {
      const selectItems = types.map((t: { type: string; label: string; description: string }) => ({
        value: t.type,
        label: t.label,
        description: t.description,
      }));

      const selectList = new SelectList(
        selectItems,
        Math.min(types.length, 8),
        {
          selectedPrefix: (t) => "\x1b[42;97m▸ " + t + "\x1b[0m",
          selectedText: (t) => "\x1b[1m" + t + "\x1b[0m",
          description: (t) => "\x1b[90m" + t + "\x1b[0m",
          scrollInfo: (t) => "\x1b[2m" + t + "\x1b[0m",
          noMatch: (t) => "\x1b[31m" + t + "\x1b[0m",
        }
      );

      // 选择回调：自动选中并应用
      selectList.onSelect = (item) => {
        try {
          this.selectContentType(item.value);
          if (this.tui) {
            this.tui.hideOverlay(); // 关闭选择器
          }
        } catch (err) {
          if (this._originalConsoleLog) {
            this._originalConsoleLog("[onSelect error]", err);
          }
        }
      };

      // ESC 取消
      selectList.onCancel = () => {
        try {
          if (this.tui) {
            this.tui.hideOverlay();
          }
        } catch (err) {
          if (this._originalConsoleLog) {
            this._originalConsoleLog("[onCancel error]", err);
          }
        }
      };

      // 显示为居中浮层
      this.tui.showOverlay(selectList, {
        width: "60%",
        anchor: "center",
      });

      this.addLog("info", "department", "已打开格式选择器（pi-tui SelectList）");
      return;
    }

    // 非 TTY 回退：原始 console.log
    const current = this.selectedContentType
      ? `\n  ✅ 当前选择: ${types.find((t: { type: string; label: string }) => t.type === this.selectedContentType)?.label ?? this.selectedContentType}`
      : "\n  ⚪ 未选择（默认使用 article）";

    console.log(`
┌─ 内容产出部 — 格式选择 ──────────────────────────┐
│                                                     │
│  可用内容格式:                                       │${current}
│                                                     │`);

    for (let i = 0; i < types.length; i++) {
      const t = types[i];
      const marker = t.type === this.selectedContentType ? "▸" : " ";
      console.log(`  ${marker} [${i + 1}] ${t.label.padEnd(18)} ${t.description}`);
    }

    console.log(`│                                                     │
│  使用方式:                                            │
│    /type 1 或 /type article     选择图文/长文          │
│    /type 2 或 /type seed        选择种草/短图文        │
│    /type 3 或 /type short-video 选择短视频脚本         │
│    /type 4 或 /type newsletter  选择Newsletter/周报    │
│                                                     │
└─────────────────────────────────────────────────────┘`);
  }

  /**
   * 选择内容格式并加载对应部门配置
   *
   * 这是 ADR-005 部门路由的核心方法：
   * 1. 根据 contentType 获取 DepartmentConfig
   * 2. 将配置注入 LoopHarness
   * 3. 将 Writer Prompt 注入 WriterAgent
   * 4. 将 Critic 维度注入 CriticAgent
   */
  selectContentType(type: string | ContentType): void {
    // 支持数字快捷键 (1-4)
    const typeMap: Record<string, ContentType> = {
      "1": "article",
      "2": "seed",
      "3": "short-video",
      "4": "newsletter",
    };

    const resolvedType = typeMap[type] ?? type as ContentType;
    const validTypes = ContentProductionDepartment.SUPPORTED_TYPES;

    if (!validTypes.includes(resolvedType)) {
      this.addLog("warn", "department", `不支持的内容格式: "${type}"，可用: ${validTypes.join(", ")}`);
      console.log(`\n⚠️ 不支持的内容格式: "${type}"\n   可用: ${validTypes.join(", ")}\n   输入 /type 查看列表\n`);
      return;
    }

    try {
      // 1. 获取部门配置
      const deptConfig = this.contentDept.getConfig(resolvedType);
      this.selectedContentType = resolvedType;
      this.activeDepartmentConfig = deptConfig;

      // 2. 注入 LoopHarness（含 departmentConfig + outputProcessor 回调）
      this.loopHarness.setDepartmentConfig(deptConfig);

      // ★ ADR-005: 注入 outputProcessor 回调 — 解决 loop-engine ↔ content-production 循环依赖
      // CLI 层静态导入 OutputPipeline（cli → content-production 方向，无循环），
      // 通过 setOutputProcessor() 闭包注入到 LoopHarness
      if (deptConfig.outputPipeline) {
        const pipelineConfig = deptConfig.outputPipeline;
        this.loopHarness.setOutputProcessor(async (rawContent, ctx) => {
          const pipeline = new OutputPipeline(pipelineConfig);
          return pipeline.process(rawContent, ctx);
        });
        this.addLog("info", "department", "outputProcessor 回调已通过 setOutputProcessor() 注入");
      }

      // 3. 注入 WriterAgent customSystemPrompt
      if (this.writerAgent) {
        this.writerAgent.setCustomSystemPrompt(deptConfig.agentProfile.writerSystemPrompt);
      }

      // 4. 如果有专属 Critic 维度，更新 CriticAgent
      if (this.criticAgent && deptConfig.agentProfile.criticDimensions) {
        this.criticAgent.setCustomDimensions?.(deptConfig.agentProfile.criticDimensions);
      }

      const typeLabel = this.contentDept.getAvailableTypes().find((t: { type: string; label: string }) => t.type === resolvedType)?.label ?? resolvedType;
      this.addLog("info", "department",
        `已切换到内容产出部 → ${typeLabel} (${resolvedType})`
      );
      console.log(`\n✅ 已切换到: ${typeLabel}\n   Writer Prompt 已注入 | GoalTemplates 已加载 | OutputPipeline 已配置\n`);
      this.render();
    } catch (e) {
      this.addLog("error", "department",
        `部门配置加载失败: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  // ============================================================
  // ★ Console 拦截（TUI 模式下防止日志泄漏）
  // ============================================================

  /** 保存原始 console 方法 */
  private _originalConsoleLog: typeof console.log | null = null;
  private _originalConsoleWarn: typeof console.warn | null = null;
  private _originalConsoleError: typeof console.error | null = null;

  /**
   * ★ 拦截 console.log/warn/error → 静默丢弃
   *
   * TUI 模式下 console.log 直接输出会破坏差分渲染。
   * 关键日志已通过回调机制输出到流式内容区，console.log 全部静默。
   */
  private interceptConsoleToStream(): void {
    this._originalConsoleLog = console.log;
    this._originalConsoleWarn = console.warn;
    this._originalConsoleError = console.error;

    // TUI 模式下：所有 console.log 静默丢弃
    // 关键日志已通过 onIterationStart/onWriterOutput/onCriticResult 回调输出
    console.log = function(..._args: unknown[]): void {};
    console.warn = function(..._args: unknown[]): void {};
    console.error = function(..._args: unknown[]): void {};
  }

  private interceptConsole(): void {
    this.interceptConsoleToStream();
  }

  /**
   * ★ 恢复原始 console 方法
   *
   * 在退出 TUI 模式前调用，确保后续输出正常。
   */
  private restoreConsole(): void {
    if (this._originalConsoleLog) console.log = this._originalConsoleLog;
    if (this._originalConsoleWarn) console.warn = this._originalConsoleWarn;
    if (this._originalConsoleError) console.error = this._originalConsoleError;
    this._originalConsoleLog = null;
    this._originalConsoleWarn = null;
    this._originalConsoleError = null;
  }

  /**
   * 退出应用
   */
  quit(): void {
    this.addLog("info", "app", "正在退出...");
    this.running = false;
    this.closeModal();

    // ★ 恢复 console（在 stop TUI 之前，确保再见消息能正常输出）
    this.restoreConsole();

    if (this.tui) {
      try {
        this.tui.stop();
      } catch {
        // 忽略
      }
    }

    console.log("\n👋 再见！");
    process.exit(0);
  }

  // ==================== 私有方法 ====================

  /**
   * 运行拷问阶段（Claude Code 风格：对话式，问题流式输出到上方）
   *
   * ★ 关键：返回 Promise，等待用户完成所有回答后才 resolve。
   * 这样 executeLoop() 才会暂停在拷问阶段，不会直接跳到规划。
   */
  private async runInterrogationPhase(taskInput: string): Promise<void> {
    if (!this.interrogateEngine) return;

    const session = await this.interrogateEngine.startSession(
      this.state.currentTaskId!,
      taskInput
    );

    // ★ 对话式拷问：将问题流式输出到上方区域
    this.state.activeModal = "interrogate";
    this.activeInterrogateModal = new InterrogateModal(session, this.interrogateEngine);

    // 显示第一个问题
    this.showNextInterrogateQuestion();

    // ★ 解锁输入框让用户回答
    this.setInputLocked(false);

    // ★ 核心：返回 Promise，等待 handleInterrogateInput 中调用 resolve
    return new Promise<void>((resolve) => {
      this.interrogateResolve = resolve;
    });
  }

  /**
   * 显示下一个拷问问题到流式内容区
   */
  private showNextInterrogateQuestion(): void {
    if (!this.activeInterrogateModal) return;
    const renderResult = this.activeInterrogateModal.render();
    if (renderResult.type === "question" && renderResult.card) {
      const card = renderResult.card;
      this.appendStream(`\n**${card.dimensionEmoji} ${card.dimensionLabel}**\n\n`);
      this.appendStream(`${card.promptText}\n\n`);
      if (card.hints.length > 0) {
        this.appendStream(`提示: ${card.hints.slice(0, 3).join(" / ")}\n\n`);
      }
      this.appendStream("*在下方输入框回答，或按 Esc 跳过*\n\n");
    }
  }

  /**
   * 处理拷问对话输入（Claude Code 风格：流式对话）
   *
   * ★ 拷问完成时调用 this.interrogateResolve() 解除 Promise 等待，
   * 让 executeLoop() 继续执行后续阶段。
   */
  private async handleInterrogateInput(input: string): Promise<void> {
    try {
      if (!this.activeInterrogateModal || !this.interrogateEngine) {
        // ★★★ 如果 interrogateResolve 存在，必须 resolve，否则 executeLoop 永久挂起
        this.resolveInterrogate();
        return;
      }

      const modal = this.activeInterrogateModal;

      // ★ 流式输出用户回答
      this.appendStream(`> ${input}\n\n`);

      const action = modal.handleInput(input);

      switch (action.type) {
        case "SUBMIT": {
          const session = await this.interrogateEngine.submitAnswer(
            modal.currentSession,
            action.value
          );
          modal.updateSession(session);

          if (this.interrogateEngine.isRoundComplete(session)) {
            const shouldContinue = await this.interrogateEngine.shouldContinue(session);
            if (shouldContinue) {
              const nextSession = await this.interrogateEngine.generateFollowUpQuestions(session);
              modal.updateSession(nextSession);
              this.showNextInterrogateQuestion();
            } else {
              // ★ 拷问完成
              const finalContext = this.interrogateEngine.finalize(session);
              this.cachedInterrogationResults = { ...finalContext };
              this.appendStream(`\n✅ 拷问完成，收集到 ${Object.keys(finalContext).length} 个上下文维度\n\n`);
              this.closeModal();
              this.setInputLocked(true);
              this.resolveInterrogate();
            }
          } else {
            // ★ 还有下一个问题
            this.showNextInterrogateQuestion();
          }
          break;
        }

        case "SKIP": {
          this.appendStream("*（已跳过）*\n\n");
          const session = this.interrogateEngine.skipQuestion(modal.currentSession);
          modal.updateSession(session);

          // 检查是否还有问题
          const rr = modal.render();
          if (rr.type === "question" && rr.card) {
            this.showNextInterrogateQuestion();
          } else {
            // ★ 所有问题已跳过，拷问结束
            const finalContext = this.interrogateEngine.finalize(session);
            this.cachedInterrogationResults = { ...finalContext };
            this.appendStream("\n✅ 拷问跳过完成\n\n");
            this.closeModal();
            this.setInputLocked(true);
            this.resolveInterrogate();
          }
          break;
        }

        case "CANCEL": {
          this.appendStream("*（已取消拷问）*\n\n");
          this.closeModal();
          this.setInputLocked(true);
          this.resolveInterrogate();
          break;
        }

        default: {
          if (action.type === "CONFIRM") {
            const session = modal.currentSession;
            const finalContext = this.interrogateEngine.finalize(session);
            this.cachedInterrogationResults = { ...finalContext };
            this.appendStream(`\n✅ 拷问确认完成\n\n`);
            this.closeModal();
            this.setInputLocked(true);
            this.resolveInterrogate();
          }
          break;
        }
      }
    } catch (err) {
      // ★★★ 关键兜底：任何异常都必须 resolve interrogateResolve
      // 否则 executeLoop() 的 Promise 永远不会 resolve，TUI 冻结
      const msg = err instanceof Error ? err.message : String(err);
      this.appendStream("\n⚠️ 拷问处理错误: " + msg + " — 自动继续\n\n");
      this.closeModal();
      this.setInputLocked(true);
      this.resolveInterrogate();
    }
  }

  /**
   * ★ 解除拷问阶段 Promise 等待
   *
   * 在 handleInterrogateInput 中拷问完成时调用，
   * 让 executeLoop() 继续执行后续阶段。
   */
  private resolveInterrogate(): void {
    if (this.interrogateResolve) {
      const resolve = this.interrogateResolve;
      this.interrogateResolve = null;
      // 异步 resolve，避免在 handleInput 回调中直接继续 executeLoop
      setImmediate(() => resolve());
    }
  }

  /**
   * 运行规划阶段
   */
  private async runPlanningPhase(taskInput: string): Promise<void> {
    if (!this.planEngine) return;

    this.appendStream("正在生成执行计划...\n\n");

    try {
      const result = await this.planEngine.generatePlan({
        taskInput,
        interrogationResults: this.cachedInterrogationResults,
        availableAgents: ["writer", "critic", "ui-ux"],
        availableTools: this.toolRegistry.listAll().map(t => t.name),
      });

      // v0.2.0: 自动分类任务类型
      const taskProfile = this.classifyTaskProfile(taskInput);
      result.plan.taskProfile = taskProfile;

      // ★ 流式输出计划摘要
      this.appendStream(`**计划已生成**: ${result.plan.steps.length} 个步骤 (${taskProfile})\n\n`);
      for (const step of result.plan.steps) {
        this.appendStream(`- \`${step.agentType}\` ${step.description.slice(0, 60)}\n`);
      }
      this.appendStream("\n\n");

      // 更新上下文中的计划
      if (this.loopContext) {
        this.loopContext.plan = result.plan;
        this.loopContext.interrogationResults = this.cachedInterrogationResults;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.appendStream(`\n❌ 计划生成失败: ${message}\n\n`);
      throw error;
    }
  }

  /**
   * 运行执行阶段
   */
  private async runExecutionPhase(): Promise<void> {
    this.addLog("info", "execute", "正在执行计划（LoopHarness → LoopModule）...");

    const plan = this.stateMachine?.context.plan;
    if (!plan || plan.steps.length === 0) {
      this.addLog("warn", "execute", "无计划步骤，跳过执行");
      return;
    }

    if (!this.loopContext) {
      this.addLog("error", "execute", "LoopContext 未初始化");
      return;
    }

    // 初始化任务记忆（创建任务记录 + 确保 memory/ 目录存在）
    const taskId = this.state.currentTaskId ?? `task-${Date.now()}`;
    try {
      await this.memoryManager.initializeForTask(taskId, this.state.currentTaskInput ?? "");
      this.addLog("info", "memory", `任务记忆已初始化: ${taskId}`);
    } catch (e) {
      this.addLog("warn", "memory", `记忆初始化失败（非致命）: ${e instanceof Error ? e.message : e}`);
    }

    // v0.2.0: 从 Memory 历史数据提取 Few-shot 样例 → 注入 LoopHarness
    await this.injectMemoryExamples(plan);

    try {
      // 使用 LoopHarness 执行（内部委托给 LoopModule）
      const result = await this.loopHarness.executeWithLoop(
        plan,
        this.loopContext
      );

      this.addLog("info", "execute",
        `执行完成: ${result.totalIterations} 轮迭代, ` +
        `allPassed=${result.allPassed}, ` +
        `耗时 ${Math.round(result.totalDurationMs / 1000)}s`
      );

      // 产物后处理管线：将 .md 产物转换为其他格式（可扩展）
      const outputCount = Object.keys(result.finalOutputs).length;
      if (outputCount > 0) {
        this.addLog("info", "execute", `已生成 ${outputCount} 个产物`);
        await this.runArtifactPipeline(result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog("error", "execute", `执行失败: ${message}`);
      throw error;
    }
  }

  /**
   * 产物后处理管线
   *
   * 将原始 .md 产物转换为多种输出格式。
   * 当前支持：HTML（Markdown → 带样式的独立页面）
   * 可扩展：在此处添加 PDF、DOCX、EPUB 等转换器
   */
  private async runArtifactPipeline(result: HarnessExecutionResult): Promise<void> {
    const allArtifacts = await this.artifactManager.listArtifacts();
    const mdArtifacts = allArtifacts.filter((a) => a.name.endsWith(".md"));

    if (mdArtifacts.length === 0) {
      this.addLog("info", "pipeline", "无 Markdown 产物，跳过后处理");
      return;
    }

    this.addLog("info", "pipeline",
      `启动后处理管线: ${mdArtifacts.length} 个 Markdown 产物待转换`
    );

    // === 管线步骤：每种格式一个处理器 ===
    const pipelineSteps: Array<{
      name: string;
      process: (artifact: Artifact) => Promise<void>;
    }> = [
      {
        name: "html",
        process: async (artifact) => {
          const htmlName = artifact.name.replace(/\.md$/, ".html");
          // 避免重复生成已存在的 HTML
          const existing = await this.artifactManager.readArtifact(htmlName);
          if (existing) return;

          const htmlArtifact = await this.artifactManager.createHTMLArtifact({
            name: htmlName,
            markdownContent: artifact.content,
            title: this.state.currentTaskInput?.slice(0, 80) || "AI Company OS Output",
            metadata: {
              generator: "AI Company OS",
              source: artifact.name,
              date: new Date().toISOString().split("T")[0],
            },
          });

          this.addLog("info", "pipeline",
            `  ✅ ${artifact.name} → ${htmlArtifact.name} (${htmlArtifact.sizeBytes} bytes)`
          );
        },
      },
      // 未来可扩展：
      // { name: "pdf", process: async (a) => { ... } },
      // { name: "docx", process: async (a) => { ... } },
    ];

    // 按顺序执行每个管线的每个处理器
    for (const step of pipelineSteps) {
      this.addLog("info", "pipeline", `[${step.name.toUpperCase()}] 转换中...`);
      let successCount = 0;

      for (const artifact of mdArtifacts) {
        try {
          await step.process(artifact);
          successCount++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.addLog("warn", "pipeline",
            `  ⚠️ ${artifact.name} → ${step.name} 转换失败: ${msg}`
          );
        }
      }

      this.addLog("info", "pipeline",
        `[${step.name.toUpperCase()}] 完成: ${successCount}/${mdArtifacts.length}`
      );
    }
  }

  /**
   * 进化记忆持久化
   *
   * 将本次 Loop 执行的经验写入 self.jsonl（系统经验）和 user.jsonl（用户偏好）。
   * 这些 JSONL 文件是增量追加的，可从 self.md / user.md 重建。
   *
   * 数据来源：
   * - 产物数量、迭代轮次、最终评分 → 经验条目
   * - 任务类型、执行耗时 → 能力成熟度更新
   */
  private async persistEvolutionMemory(): Promise<void> {
    const { evolution } = this.memoryManager;
    const taskInput = this.state.currentTaskInput ?? "unknown";
    const now = new Date().toISOString();

    try {
      // 1. 记录系统经验 → self.jsonl
      const allArtifacts = await this.artifactManager.listArtifacts();
      const artifactCount = allArtifacts.length;

      const experienceResult = await evolution.addExperience({
        taskType: "content-generation",
        pattern: `task-complete-${artifactCount}-artifacts`,
        type: "success",
        lesson: [
          `任务: ${taskInput.slice(0, 80)}`,
          `产出: ${artifactCount} 个 Artifact`,
          `完成时间: ${now}`,
        ].join("\n"),
        capabilityDelta: {
          addedCapabilities: ["content-generation", "loop-execution"],
          discoveredLimitations: [],
          improvedStrategies: [],
        },
      });

      this.addLog("info", "memory",
        `✅ self.jsonl 已更新 (deduplicated=${experienceResult.deduplicated})`
      );

      // 2. 更新能力成熟度
      await evolution.addCapability("content-generation", true, artifactCount > 5 ? 8 : 3);
      await evolution.addCapability("loop-execution", true);

      // 3. 记录用户偏好（如有拷问结果）→ user.jsonl
      if (this.cachedInterrogationResults && Object.keys(this.cachedInterrogationResults).length > 0) {
        try {
          // 确保 user.md 存在
          let userData = await evolution.getUserMD();
          if (!userData) {
            userData = await evolution.createUserMD({
              writingStyle: "professional",
              topicTendencies: ["technical"],
              expressionHabits: ["concise"],
              targetAudience: "developer",
              workflowPreference: "iterative",
            });
          }

          // 将拷问结果作为用户偏好字段写入
          for (const [key, value] of Object.entries(this.cachedInterrogationResults)) {
            await evolution.updateUserField(key, value, "interrogate", 0.9);
          }

          this.addLog("info", "memory",
            `✅ user.jsonl 已更新 (${Object.keys(this.cachedInterrogationResults).length} 个偏好字段)`
          );
        } catch (userErr) {
          this.addLog("warn", "memory",
            `用户记忆更新失败（非致命）: ${userErr instanceof Error ? userErr.message : userErr}`
          );
        }
      }

      this.addLog("info", "memory",
        "📝 记忆持久化完成 — self.jsonl + user.jsonl 已同步"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.addLog("error", "memory", `记忆持久化失败: ${msg}`);
    }
  }

  /**
   * 运行验证阶段
   */
  private async runVerificationPhase(): Promise<boolean> {
    this.addLog("info", "verify", "正在验证结果...");

    if (!this.verifyEngine) return true;

    try {
      // 从 ArtifactManager 获取产物路径
      const allArtifacts = await this.artifactManager.listArtifacts();
      const artifacts = allArtifacts.map((a) => a.path);

      const result = await this.verifyEngine.verify({
        artifacts,
        originalTask: this.stateMachine?.context.taskInput ?? "",
        interrogationResults: this.cachedInterrogationResults,
        plan: this.stateMachine?.context.plan!,
      });

      if (result.passed) {
        this.addLog("info", "verify", "✅ 验证通过");
      } else {
        this.addLog("warn", "verify", `❌ 验证失败: ${result.reasons.join("; ")}`);
      }

      return result.passed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog("error", "verify", `验证出错: ${message}`);
      return false;
    }
  }

  /**
   * 运行进化阶段
   */
  private async runEvolutionPhase(): Promise<void> {
    this.addLog("info", "evolve", "正在进行自我进化分析...");

    // 使用 EvolutionAgent 分析迭代趋势（如果 LoopModule 有记录）
    // 注意：EvolutionAgent 在 LoopModule 内部已集成，
    // 这里做额外的独立分析作为补充

    try {
      // 检查是否有 artifacts 可供分析
      const allArtifacts = await this.artifactManager.listArtifacts();

      if (allArtifacts.length > 0) {
        this.addLog("info", "evolve",
          `分析 ${allArtifacts.length} 个产物的进化趋势...`
        );

        // 进度模拟（真实 Evolution 在 LoopModule.run() 中已完成）
        for (let frame = 0; frame <= 10; frame++) {
          this.render();
          await delay(30);
        }

        this.addLog("info", "evolve",
          "✨ 进化完成 — 已识别优化模式并更新策略"
        );
      } else {
        this.addLog("warn", "evolve", "无产物可供进化分析");
      }

      // === 记忆持久化：将本次执行经验写入 self.jsonl / user.jsonl ===
      await this.persistEvolutionMemory();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog("error", "evolve", `进化分析出错: ${message}`);
    }
  }

  /**
   * 获取主区域显示模式
   */
  private getMainMode(): "loop" | "modal" | "evolution" | "summary" {
    if (this.state.activeModal === "interrogate") return "modal";
    if (this.state.loopState === LoopState.EVOLVING) return "evolution";
    if (this.state.loopState === LoopState.DONE) return "summary";
    return "loop";
  }

  /**
   * 任务类型自动分类 (v0.2.0)
   *
   * 基于关键词启发式将任务输入映射到 TaskProfile，
   * 用于选取对应的阈值档位（THRESHOLD_PROFILES）。
   *
   * 分类规则：
   * - tutorial: 含 "教程" "how-to" "入门" "step by step" "指南" "手把手"
   * - design-doc: 含 "设计文档" "架构设计" "API 设计" "方案" "PRD" "技术选型"
   * - code-review: 含 "代码审查" "code review" "CR" "重构建议" "代码质量"
   * - generic: 无明确匹配（使用最宽松的保守阈值）
   * - technical-blog: 默认（其他所有情况，使用标准高标阈值）
   */
  private classifyTaskProfile(taskInput: string): TaskProfile {
    const input = taskInput.toLowerCase();

    const rules: Array<{ keywords: RegExp[]; profile: TaskProfile }> = [
      { keywords: [/教程|how.?to|入门|step\s*by\s*step|指南|手把手|getting\s*started|beginner/], profile: "tutorial" },
      { keywords: [/设计文档|架构设计|api\s*设计|方案|prd|技术选型|design\s*doc|spec/i], profile: "design-doc" },
      { keywords: [/代码审查|code\s*review|\bcr\b|重构建议|代码质量|refactor.*review/], profile: "code-review" },
    ];

    for (const rule of rules) {
      if (rule.keywords.some((re) => re.test(input))) {
        return rule.profile;
      }
    }

    // 默认：technical-blog（标准高标）
    return "technical-blog";
  }

  /**
   * 从 Memory 历史数据提取 Few-shot 样例并注入 LoopHarness (v0.2.0)
   *
   * 流程：
   * 1. 从 self.jsonl 读取最近 N 条经验记录
   * 2. 过滤与当前任务类型相关的条目
   * 3. 转换为 DynamicExample 格式
   * 4. 通过 setDynamicExamples() 注入 GradingCriteria
   *
   * 注意：此方法不阻塞执行——如果 Memory 查询失败则静默跳过。
   */
  private async injectMemoryExamples(plan: import("@aicos/loop-engine").ExecutionPlan): Promise<void> {
    try {
      const { evolution } = this.memoryManager;
      const experiences = await evolution.getExperiences(30);

      if (experiences.length === 0) {
        this.addLog("info", "memory", "无历史经验记录，跳过样例注入");
        return;
      }

      // 过滤：优先匹配同 taskType 的经验
      const taskProfile = plan.taskProfile ?? "generic";
      const relevant = experiences.filter(
        (e) => e.taskType?.includes(taskProfile) || e.taskType === "content-generation"
      );

      if (relevant.length === 0) {
        this.addLog("info", "memory", `无与 ${taskProfile} 相关的历史经验，跳过样例注入`);
        return;
      }

      // 取最近的成功+失败各最多 2 条作为校准样例
      const successes = relevant
        .filter((e) => e.type === "success")
        .slice(0, 2);
      const failures = relevant
        .filter((e) => e.type === "failure")
        .slice(0, 2);

      const examples: DynamicExample[] = [
        ...successes.map((e) => ({
          description: e.pattern,
          score: 88, // 成功经验的近似高分
          reason: e.lesson.split("\n")[0] ?? e.lesson.slice(0, 120),
        })),
        ...failures.map((e) => ({
          description: e.pattern,
          score: 42, // 失败经验的近似低分
          reason: e.lesson.split("\n")[0] ?? e.lesson.slice(0, 120),
        })),
      ];

      if (examples.length > 0) {
        this.loopHarness.setDynamicExamples(examples);
        this.addLog("info", "memory",
          `已注入 ${examples.length} 条动态样例（${successes.length} 高分 + ${failures.length} 低分）`
        );
      }
    } catch (e) {
      // 非致命：Memory 查询失败不影响主流程
      this.addLog("warn", "memory",
        `动态样例注入失败（非致命）: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  /**
   * 直接渲染到终端（无 TUI 时的回退方案）
   */
  private renderToTerminal(): void {
    // ★ Claude Code 风格：流式内容直接输出到终端
    // 非TUI模式下，streamContent 已通过 console.log 拦截输出到终端
    // 这里只输出状态栏信息
    const stateInfo = getStateDisplay(this.state.loopState);
    const lockIcon = this.inputLocked ? "🔒" : "✏️";
    console.log(`\n${lockIcon} [${stateInfo.label}] Enter: 提交 | /type: 切换类型 | q: 退出\n`);
  }

  /**
   * 将 Modal 内容渲染到终端
   */
  private renderModalToTerminal(): void {
    if (!this.activeInterrogateModal) return;

    const renderResult = this.activeInterrogateModal.render();

    console.log("┌─ 拷问向导 ─────────────────────────┐");

    if (renderResult.type === "question" && renderResult.card) {
      const card = renderResult.card;
      console.log(`│  ${card.stepLabel.padEnd(34)}│`);
      console.log(`│  ${card.progressDots.padEnd(34)}│`);
      console.log("│                                      │");
      console.log(`│  ${card.dimensionEmoji} ${card.dimensionLabel}`.padEnd(39) + "│");
      console.log("│                                      │");

      if (card.collectedInfo.length > 0) {
        console.log("│  已收集信息:                          │");
        for (const info of card.collectedInfo) {
          console.log(`│    • ${info.slice(0, 30).padEnd(30)}│`);
        }
        console.log("│                                      │");
      }

      console.log("│  问题:                                │");
      // 折行长问题文本
      const words = card.promptText.split(" ");
      let line = "│    ";
      for (const word of words) {
        if ((line + word).length > 37) {
          console.log(line.padEnd(38) + "│");
          line = "│    ";
        }
        line += word + " ";
      }
      console.log(line.padEnd(38) + "│");

      if (card.hints.length > 0) {
        console.log("│                                      │");
        console.log("│  提示:                                │");
        for (const hint of card.hints.slice(0, 3)) {
          console.log(`│    - ${hint.slice(0, 30).padEnd(30)}│`);
        }
      }

      console.log("│                                      │");
      console.log(`│  > ${"_".repeat(30)}│`);
      console.log(`│  ${card.footerHints.padEnd(34)}│`);
    } else if (renderResult.type === "summary" && renderResult.summary) {
      const summary = renderResult.summary;
      console.log(`│  📋 拷问摘要 · 共 ${summary.totalQuestions} 题`.padEnd(39) + "│");
      console.log("│                                      │");

      for (let i = 0; i < summary.qaPairs.length; i++) {
        const qa = summary.qaPairs[i];
        const prefix = i === summary.currentIndex ? "▸" : " ";
        const statusIcon = qa.skipped ? "(跳过)" : qa.answer ? "✓" : "?";
        console.log(`│  ${prefix} [${statusIcon}] ${qa.dimension}: ${(qa.answer || "(空)").slice(0, 20).padEnd(20)}│`);
      }

      console.log("│                                      │");
      console.log("│  [ Enter 确认 · ←→ 浏览修改 ]       │");
    }

    console.log("└──────────────────────────────────────┘");
  }

  /**
   * 添加日志条目
   */
  private addLog(level: LogEntry["level"], source: string, message: string): void {
    this.state.logs.push({
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
    });

    // 限制日志数量，防止内存无限增长
    if (this.state.logs.length > 200) {
      this.state.logs = this.state.logs.slice(-100);
    }

    // ★ TUI 模式下：日志变化时自动触发重绘（实时更新 Footer）
    // 使用节流避免高频日志导致过度渲染
    if (this.tui && this.running) {
      this.scheduleRender();
    }
  }

  /** ★ 渲染节流：最多每 200ms 重绘一次 */
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleRender(): void {
    if (this._renderTimer) return; // 已有待执行的渲染
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      if (this.tui && this.running) {
        // ★ 增量更新：只更新 Markdown 内容 + 状态栏，不重建整个组件树
        if (this.streamMarkdown) {
          this.streamMarkdown.setText(this.streamContent);
        }
        this.tui.requestRender();
      }
    }, 200);
  }

  /**
   * 创建默认 LLM Provider
   * 从环境变量读取配置，强制使用真实 API（禁止 Mock）
   */
  private createDefaultLLMProvider(): LLMProvider {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(
        "❌ 未检测到 OPENAI_API_KEY 环境变量。请在 .env 文件中配置或设置环境变量后重试。\n" +
        "   所需变量: OPENAI_API_KEY, OPENAI_API_BASE, OPENAI_MODEL"
      );
    }

    try {
      const provider = PiAILLMProvider.fromEnvSync();
      console.log("✅ 检测到 API 配置，使用真实 LLM Provider (LongCat)");
      // 异步初始化（不阻塞构造）
      provider.init().catch((err) => {
        console.error(`⚠️ LLM Provider 初始化失败: ${err.message}`);
      });
      return provider;
    } catch (error) {
      throw new Error(
        `❌ 创建 LLM Provider 失败: ${error instanceof Error ? error.message : error}`
      );
    }
  }
}

// ==================== 辅助函数 ====================

/** 生成任务 ID */
function generateTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 延迟工具函数 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 进度动画帧（从 evolution-panel 导入的简化版）*/
function getEvolutionAnimationFrame(frameIndex: number): {
  phase: "analyzing" | "generating" | "applying" | "complete";
  progress: number;
} {
  const totalFrames = 40;

  if (frameIndex < totalFrames * 0.2) {
    return {
      phase: "analyzing",
      progress: Math.min(20, Math.round((frameIndex / (totalFrames * 0.2)) * 20)),
    };
  } else if (frameIndex < totalFrames * 0.5) {
    return {
      phase: "generating",
      progress: Math.min(50, 20 + Math.round(((frameIndex - totalFrames * 0.2) / (totalFrames * 0.3)) * 30)),
    };
  } else if (frameIndex < totalFrames * 0.85) {
    return {
      phase: "applying",
      progress: Math.min(85, 50 + Math.round(((frameIndex - totalFrames * 0.5) / (totalFrames * 0.35)) * 35)),
    };
  } else {
    return {
      phase: "complete",
      progress: Math.min(100, 85 + Math.round(((frameIndex - totalFrames * 0.85) / (totalFrames * 0.15)) * 15)),
    };
  }
}

/**
 * 格式化欢迎屏幕
 */
function formatWelcomeScreen(): string {
  return `
╔══════════════════════════════════════════╗
║                                          ║
║   🤖  AI Company OS  v0.1.0             ║
║                                          ║
║   智能内容生产与进化平台                  ║
║                                          ║
╚══════════════════════════════════════════╝
`;
}
