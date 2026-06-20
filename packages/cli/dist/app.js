// CLI 应用主类
// 整合 TUI 组件、Loop Engine、MCP、Memory 等子系统
import path from "node:path";
import { LoopStateMachine, LoopState, InterrogateEngine, PlanEngine, VerifyEngine, RollbackManager, ArtifactManager, ToolRegistry, LoopHarness, DEFAULT_WRITING_CRITERIA, PiAILLMProvider, WORKER_ROLES, } from "@aicos/loop-engine";
import { MemoryManager } from "@aicos/memory";
import { MCPClientAdapter, EXA_MCP_CONFIG } from "@aicos/mcp";
import { WriterAgent } from "@aicos/subagents/writer";
import { CriticAgent } from "@aicos/subagents/critic";
import { EvolutionAgent, PatternExtractor, DiffGenerator, AutoMerger, AnomalyDetector, } from "@aicos/evolution";
// ★ ADR-005: 内容产出部 — 部门配置
import { ContentProductionDepartment, initDepartmentMemory, OutputPipeline, } from "@aicos/content-production";
import { getModel } from "@earendil-works/pi-ai";
import { InterrogationCoordinator } from "./coordinators/interrogation-coordinator.js";
import { ExecutionCoordinator } from "./coordinators/execution-coordinator.js";
import { EvolutionCoordinator } from "./coordinators/evolution-coordinator.js";
import { getStateDisplay } from "./components/header.js";
import { buildLoopVisualizationData, formatLoopASCII, } from "./components/loop-visualization.js";
import { buildSidebarData, formatSidebarString } from "./components/sidebar.js";
import { buildFooterData } from "./components/footer.js";
import { buildEvolutionPanelData, } from "./components/evolution-panel.js";
// ★ pi-tui 组件库 — 终端 UI 原生组件
import { TUI, Box, Text, Markdown, Input, SelectList, ProcessTerminal, } from "@earendil-works/pi-tui";
/**
 * ★ EvolutionDocAdapter — 将 EvolutionDocsManager 适配为 IEvolutionDocWriter
 *
 * EvolutionDocsManager 的方法返回值与 IEvolutionDocWriter 接口不兼容，
 * 此适配器丢弃返回值实现接口兼容。
 */
class EvolutionDocAdapter {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    async getDesignMDX() { return this.mgr.getDesignMDX(); }
    async getUserMD() { return this.mgr.getUserMD(); }
    async getSelfMD() { return this.mgr.getSelfMD(); }
    async updateDesignBlock(blockType, content, source) {
        await this.mgr.updateDesignBlock(blockType, content, source ?? "evolution");
    }
    async updateUserField(key, value, source, confidence) {
        await this.mgr.updateUserField(key, value, source, confidence);
    }
    async addExperience(entry) {
        await this.mgr.addExperience(entry);
    }
}
/**
 * AI Company OS CLI 应用
 * 负责初始化所有组件、管理应用状态、协调 Loop 执行流程
 */
export class AICOSApp {
    /** TUI 实例（pi-tui 差分渲染引擎） */
    tui = null;
    /** pi-tui Terminal 实例 */
    terminal = null;
    /** 应用状态 */
    state;
    /** Loop 状态机 */
    stateMachine = null;
    /** 可变的 Loop 上下文引用（用于跨方法共享） */
    loopContext = null;
    /** 拷问引擎 */
    interrogateEngine = null;
    /** 拷问阶段协调器 */
    interrogateCoordinator = null;
    /** 规划引擎 */
    planEngine = null;
    /** 编排器 */
    orchestrator = null;
    /** 验证引擎 */
    verifyEngine = null;
    /** 回滚管理器 */
    rollbackManager = null;
    /** 产物管理器 */
    artifactManager;
    /** 记忆管理器（self.jsonl / user.jsonl / self.md / user.md） */
    memoryManager;
    // ★ Claude Code 风格 TUI 组件
    /** 流式内容区 Markdown 组件（动态 setText 更新） */
    streamMarkdown = null;
    /** 流式内容累积文本 */
    streamContent = "";
    /** 底部输入框组件 */
    inputComponent = null;
    /** 执行中输入框锁定标记 */
    inputLocked = false;
    /** Header Text 组件引用（用于增量更新） */
    headerText = null;
    /** StatusBar Text 组件引用（用于增量更新） */
    statusBarText = null;
    /** LLM Provider */
    llmProvider;
    /** 工具注册表 */
    toolRegistry;
    /** Loop Harness（委托给 LoopModule） */
    loopHarness;
    /** 执行阶段协调器 */
    executionCoordinator = null;
    /** Writer Agent 实例 */
    writerAgent = null;
    /** Critic Agent 实例 */
    criticAgent = null;
    /** Evolution Agent 实例 */
    evolutionAgent = null;
    /** 进化阶段协调器 */
    evolutionCoordinator = null;
    /** executeLoop 开始时间（用于进化阶段计算 executionDuration） */
    loopStartTime = 0;
    // ★ ADR-005: 内容类型选择
    /** 当前选中的内容格式 */
    selectedContentType = null;
    /** 当前激活的部门配置 */
    activeDepartmentConfig = null;
    /** 内容产出部实例 */
    contentDept = new ContentProductionDepartment();
    /** 最近一次 Critic 评估摘要（用于进化阶段沉淀） */
    lastCriticSummary;
    /** 最近一次 CompletionGuard 摘要（用于进化阶段沉淀） */
    lastGuardSummary;
    /** 是否正在运行 */
    running = false;
    /** 轻量级证据收集器（从 LoopHarness 回调中收集，供进化阶段构造 IEvidenceReader） */
    collectedDecisions = [];
    collectedToolCalls = [];
    collectedVerifications = [];
    constructor(llmProvider) {
        // 优先使用传入的 provider，否则尝试创建真实 Provider，最后 fallback 到 Mock
        if (llmProvider) {
            this.llmProvider = llmProvider;
        }
        else {
            this.llmProvider = this.createDefaultLLMProvider();
        }
        // 初始化工具注册表
        this.toolRegistry = new ToolRegistry();
        this.toolRegistry.registerLocalTools(this.llmProvider);
        // 初始化 Loop Harness（★ v0.4.0: 默认启用 pi-agent-core 引擎 + 流式回调）
        const usePiCore = process.env.AICOS_USE_LEGACY_ENGINE !== "1";
        const piModel = usePiCore ? this.createPiAiModel() : undefined;
        this.loopHarness = new LoopHarness(this.toolRegistry, this.llmProvider, {
            usePiAgentCore: usePiCore,
            model: piModel,
            // ★ v0.4.0: 执行进度回调 → 流式输出到 TUI
            onIterationStart: (iteration, stepId) => {
                this.appendStream(`\n---\n**⏳ Iteration ${iteration}** \`${stepId}\`\n\n`);
            },
            onWriterOutput: (content, iteration) => {
                // ★ 收集 Writer 决策证据
                this.collectedDecisions.push({
                    agentType: "writer",
                    decisionPoint: `iteration-${iteration}-generation`,
                    finalChoice: "generate",
                    confidence: 0.9,
                    outputReasoning: content.slice(0, 200),
                });
                // Writer 产出：显示前 300 字预览
                const preview = content.slice(0, 300).replace(/\n/g, "\n> ");
                this.appendStream(`\n**📝 Writer 产出** (Iteration ${iteration}):\n\n> ${preview}${content.length > 300 ? "..." : ""}\n\n`);
            },
            onCriticResult: (score, passed, suggestions, iteration) => {
                // ★ 收集 Critic 决策证据
                this.collectedDecisions.push({
                    agentType: "critic",
                    decisionPoint: `iteration-${iteration}-evaluation`,
                    finalChoice: passed ? "pass" : "revise",
                    confidence: score / 100,
                    outputReasoning: suggestions.slice(0, 2).join("; "),
                });
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
                // ★ 收集目标验证证据
                this.collectedVerifications.push({
                    goalId: `goal-${verified}-of-${total}`,
                    verified: verified === total,
                    evidence: reason,
                });
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
            this.loopHarness.setPiEventForwarder((event) => {
                const eventType = event?.type ?? "unknown";
                if (eventType === "agent_start") {
                    this.appendStream("**▶ Agent 启动**\n\n");
                }
                else if (eventType === "turn_end") {
                    this.appendStream("**◆ 迭代完成**\n\n");
                }
                else if (eventType === "tool_execution_start") {
                    this.appendStream(`🔧 \`${event.toolName}\` 执行中...\n`);
                }
                else if (eventType === "tool_execution_end") {
                    const status = event.isError ? " ❌" : " ✅";
                    // ★ 收集工具调用证据
                    this.collectedToolCalls.push({
                        toolName: event.toolName ?? "unknown",
                        success: !event.isError,
                    });
                    this.appendStream(`🔧 \`${event.toolName}\`${status}\n\n`);
                }
                else if (eventType === "agent_end") {
                    this.appendStream("**■ Agent 执行结束**\n\n");
                }
            });
        }
        // 初始化产物管理器
        this.artifactManager = new ArtifactManager();
        // 初始化记忆管理器（self.jsonl / user.jsonl 持久化）
        this.memoryManager = new MemoryManager(process.cwd());
        this.executionCoordinator = new ExecutionCoordinator({
            artifactManager: this.artifactManager,
            memoryManager: this.memoryManager,
            loopHarness: this.loopHarness,
            onLog: (level, source, message) => this.addLog(level, source, message),
            onStream: (content) => this.appendStream(content),
            getTaskId: () => this.state.currentTaskId,
            getTaskInput: () => this.state.currentTaskInput ?? "",
            getLoopContext: () => this.loopContext,
            injectMemoryExamples: (plan) => this.injectMemoryExamples(plan),
            getCollectedVerifications: () => this.collectedVerifications,
        });
        // 初始化应用状态
        this.state = {
            currentTaskId: null,
            loopState: LoopState.IDLE,
            mcpStatus: new Map(),
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
    async initialize() {
        this.addLog("info", "app", "正在初始化 AI Company OS...");
        // 初始化各引擎（使用真实/mock LLM Provider）
        this.interrogateEngine = new InterrogateEngine(this.llmProvider);
        this.interrogateCoordinator = new InterrogationCoordinator({
            engine: this.interrogateEngine,
            onStream: (content) => this.appendStream(content),
            setInputLocked: (locked) => this.setInputLocked(locked),
            closeModal: () => this.closeModal(),
            getTaskId: () => this.state.currentTaskId,
        });
        this.planEngine = new PlanEngine(this.llmProvider);
        this.verifyEngine = new VerifyEngine(this.llmProvider);
        // 创建并注册 Agent（实现 IGeneratorAgent / IEvaluatorAgent 接口）
        this.writerAgent = new WriterAgent(this.toolRegistry, this.llmProvider);
        this.criticAgent = new CriticAgent(this.llmProvider, DEFAULT_WRITING_CRITERIA);
        this.loopHarness.registerAgent("writer", () => this.writerAgent);
        this.loopHarness.registerAgent("critic", () => this.criticAgent);
        this.addLog("info", "app", "WriterAgent + CriticAgent 已注册到 LoopHarness");
        // ★ 创建 EvolutionAgent（自进化引擎）
        const evolutionDocs = new EvolutionDocAdapter(this.memoryManager.evolution);
        this.evolutionAgent = new EvolutionAgent({
            patternExtractor: new PatternExtractor(this.llmProvider),
            diffGenerator: new DiffGenerator(),
            autoMerger: new AutoMerger(evolutionDocs),
            anomalyDetector: new AnomalyDetector({
                persistencePath: path.join(process.cwd(), "memory", "anomaly-history.json"),
            }),
            llmProvider: this.llmProvider,
        });
        this.addLog("info", "app", "EvolutionAgent 已创建（PatternExtractor + DiffGenerator + AutoMerger + AnomalyDetector）");
        this.evolutionCoordinator = new EvolutionCoordinator({
            artifactManager: this.artifactManager,
            memoryManager: this.memoryManager,
            evolutionAgent: this.evolutionAgent,
            onStream: (content) => this.appendStream(content),
            getTaskId: () => this.state.currentTaskId,
            getTaskInput: () => this.state.currentTaskInput ?? "",
            getLoopContext: () => this.loopContext,
            getLoopStartTime: () => this.loopStartTime,
            getUserModificationCount: () => this.interrogateCoordinator?.result.userModificationCount ?? 0,
            getCollectedDecisions: () => this.collectedDecisions,
            getCollectedToolCalls: () => this.collectedToolCalls,
            getCollectedVerifications: () => this.collectedVerifications,
            persistUserPreferences: () => this.persistUserPreferences(),
        });
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
        }
        catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            this.addLog("warn", "mcp", `⚠️ Exa MCP 连接失败（非致命）: ${err}`);
            this.addLog("warn", "mcp", `web_search 工具将不可用，WriterAgent 会跳过搜索步骤`);
            this.state.mcpStatus.set("Exa Server", "error");
        }
        // ★ ADR-005: 初始化内容产出部专用记忆（design.mdx / self.jsonl / user.jsonl）
        try {
            const memResult = await initDepartmentMemory(process.cwd());
            this.addLog("info", "department", `内容产出部记忆初始化: design.mdx=${memResult.designMDX}, self.jsonl=${memResult.selfJSONL}, user.jsonl=${memResult.userJSONL}`);
        }
        catch (e) {
            this.addLog("warn", "department", `部门记忆初始化失败（非致命）: ${e instanceof Error ? e.message : e}`);
        }
    }
    /**
     * 启动 TUI
     * 进入主循环等待用户输入
     */
    async start() {
        if (this.running)
            return;
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
            }
            catch (e) {
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
    rebuildLayout() {
        if (!this.tui)
            return;
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
        this.inputComponent.onSubmit = (value) => {
            // ★ 关键：onSubmit 在 pi-tui 的 handleInput 链中被调用，
            // 任何异常都会冒泡到 stdin data handler 导致进程崩溃。
            // 必须用 try-catch 包裹，并用 .catch() 捕获 async rejection。
            try {
                const result = this.handleInput(value);
                // handleInput 是 async 的，必须捕获 rejection
                if (result && typeof result === "object" && "catch" in result) {
                    result.catch((err) => {
                        const msg = err instanceof Error ? err.message : String(err);
                        this.appendStream("\n⚠️ 输入处理错误: " + msg + "\n\n");
                    });
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.appendStream("\n⚠️ 输入处理错误: " + msg + "\n\n");
            }
        };
        this.inputComponent.onEscape = () => {
            // ★ ESC 跳过当前拷问问题（如果正在拷问阶段）
            if (this.interrogateCoordinator) {
                this.interrogateCoordinator.handleInput("__SKIP__").catch(() => { });
            }
        };
        this.tui.addChild(this.inputComponent);
        // 设置焦点到输入框
        this.tui.setFocus(this.inputComponent);
    }
    /** 构建 Header 文本 */
    buildHeaderText() {
        const stateInfo = getStateDisplay(this.state.loopState);
        const taskIdStr = this.state.currentTaskId ? ` | Task: ${this.state.currentTaskId.slice(0, 8)}` : "";
        return ` AI Company OS v0.1.0 [${stateInfo.label}]${taskIdStr} `;
    }
    /** 构建 StatusBar 文本 */
    buildStatusBarText() {
        const stateInfo = getStateDisplay(this.state.loopState);
        const lockIcon = this.inputLocked ? "🔒" : "✏️";
        return this.inputLocked
            ? ` ${lockIcon} ${stateInfo.label} · Esc: 跳过 · q: 退出 `
            : ` ${lockIcon} Enter: 提交 · /type: 切换类型 · q: 退出 `;
    }
    /** ★ 增量更新 Header 和 StatusBar（更新流式内容的首行和末行） */
    updateHeaderContent() {
        // Header/StatusBar 信息已在 appendStream 中更新，无需额外操作
    }
    updateStatusBarContent() {
        // 同上
    }
    /**
     * 主渲染入口
     * TUI 模式：重建组件树并请求重绘
     * 非TUI模式：回退到终端输出
     */
    render() {
        if (this.tui) {
            // ★ pi-tui 模式：增量更新（不重建组件树！）
            // 只更新 Header 和 StatusBar 的文本内容，不销毁 Input 组件
            this.updateHeaderContent();
            this.updateStatusBarContent();
            this.tui.requestRender();
        }
        else {
            // 回退模式：手写 ASCII art
            this.renderToTerminal();
        }
    }
    // ============================================================
    // ★ pi-tui 组件构建方法（返回 Component 树）
    // ============================================================
    /** 构建顶栏组件: Box + Text（应用名 + 状态 + TaskID） */
    buildHeaderComponent() {
        const stateInfo = getStateDisplay(this.state.loopState);
        const taskIdStr = this.state.currentTaskId ? ` | Task: ${this.state.currentTaskId.slice(0, 8)}` : "";
        const headerText = ` AI Company OS v0.1.0 [${stateInfo.label}]${taskIdStr} `;
        const box = new Box(1, 0, (t) => `\x1b[44;97m${t}\x1b[0m`);
        box.addChild(new Text(headerText, 0, 0));
        return box;
    }
    /** 构建主区域组件: 根据 mode 返回不同内容 */
    buildMainComponent() {
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
                }
                else {
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
    buildModalComponent() {
        const renderResult = this.interrogateCoordinator?.renderModal();
        if (!renderResult || renderResult.type !== "question" || !renderResult.card) {
            return new Text("（无活跃 Modal）", 1, 1);
        }
        const card = renderResult.card;
        const lines = [];
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
    /** ★ 构建执行进度组件（PLANNING/EXECUTING 状态下替代空白 Modal） */
    buildProgressComponent() {
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
    buildStatusBarComponent() {
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
    appendStream(content) {
        try {
            this.streamContent += content;
            if (this.streamMarkdown) {
                this.streamMarkdown.setText(this.streamContent);
            }
            this.scheduleRender();
        }
        catch {
            // ★ 静默失败 — appendStream 是最底层渲染方法，绝不能抛出异常
            // 否则所有 30+ 调用点都会崩溃，包括全局错误处理器（导致递归崩溃）
            // 降级：写入原始 console（如果可用）
            if (this._originalConsoleLog) {
                try {
                    this._originalConsoleLog("[appendStream fallback]", content);
                }
                catch { /* 彻底放弃 */ }
            }
        }
    }
    /**
     * 清空流式内容区
     */
    clearStream() {
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
    setInputLocked(locked) {
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
    buildSidebarComponent() {
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
    buildFooterComponent() {
        const footerData = buildFooterData({ logs: this.state.logs });
        const mdContent = AICOSApp.buildLogMarkdown(footerData);
        return new Markdown(mdContent, 1, 1, {
            heading: function (t) { return "\x1b[1;36m" + t + "\x1b[0m"; },
            link: function (t) { return "\x1b[4;34m" + t + "\x1b[0m"; },
            linkUrl: function (t) { return "\x1b[2;34m" + t + "\x1b[0m"; },
            code: function (t) { return "\x1b[33m" + t + "\x1b[0m"; },
            codeBlock: function (t) { return "\x1b[33m" + t + "\x1b[0m"; },
            codeBlockBorder: function (t) { return "\x1b[90m" + t + "\x1b[0m"; },
            quote: function (t) { return "\x1b[36m" + t + "\x1b[0m"; },
            quoteBorder: function (t) { return "\x1b[90m" + t + "\x1b[0m"; },
            hr: function () { return "\x1b[90m" + "─".repeat(50) + "\x1b[0m"; },
            listBullet: function (t) { return "\x1b[90m" + t + "\x1b[0m"; },
            bold: function (t) { return "\x1b[1m" + t + "\x1b[0m"; },
            italic: function (t) { return "\x1b[3m" + t + "\x1b[0m"; },
            strikethrough: function (t) { return "\x1b[9m" + t + "\x1b[0m"; },
            underline: function (t) { return "\x1b[4m" + t + "\x1b[0m"; },
        });
    }
    /**
     * 构建 Markdown 格式的日志内容（独立静态方法，避免模板字符串中反引号嵌套问题）
     */
    static buildLogMarkdown(footerData) {
        const BT = String.fromCharCode(96); // 反引号
        const recentLogs = footerData.logs.slice(-6);
        let md = "**Logs**\n\n";
        if (recentLogs.length === 0) {
            md += "_暂无日志_\n";
        }
        else {
            for (let i = 0; i < recentLogs.length; i++) {
                const log = recentLogs[i];
                const icon = log.level === "error" ? "\u{1F534}" : log.level === "warn" ? "\u{1F7E1}" : "\u{1F7E2}";
                const time = log.timestamp.slice(11, 19);
                md += "- " + icon + " " + BT + "[" + time + "]" + BT + " **" + log.source + "**: " + log.message + "\n";
            }
        }
        md += "\n---\n";
        for (let i = 0; i < footerData.shortcuts.length; i++) {
            if (i > 0)
                md += " | ";
            const s = footerData.shortcuts[i];
            md += "**" + s.key + "**: " + s.description;
        }
        return md;
    }
    /**
     * 处理用户输入
     * 分发到对应的处理器
     */
    async handleInput(input) {
        const trimmed = input.trim();
        // ★ 清空 Input 组件的值（为下一次输入做准备）
        if (this.inputComponent) {
            this.inputComponent.setValue("");
        }
        // ★★★ 优先级 1：拷问阶段输入（必须在 q/inputLocked 之前判断！）
        // 否则用户在拷问阶段输入 q 会被全局快捷键拦截导致 TUI 退出
        if (this.state.activeModal === "interrogate" && this.interrogateCoordinator) {
            await this.interrogateCoordinator.handleInput(trimmed);
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
            await this.selectContentType(typeMatch[1]);
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
    /** 是否为非交互模式（跳过拷问、不启动 TUI） */
    nonInteractiveMode = false;
    /**
     * 非交互模式入口
     * 跳过 TUI 和拷问，直接执行任务
     */
    async runNonInteractive(taskInput) {
        this.nonInteractiveMode = true;
        this.state.currentTaskId = `task-${Date.now()}`;
        this.state.currentTaskInput = taskInput;
        console.log(`\n📋 任务: ${taskInput}\n`);
        await this.executeLoop(taskInput);
        console.log("\n✅ 完成\n");
    }
    /**
     * 提交新任务（Claude Code 风格：流式显示执行过程）
     *
     * ★ 关键：executeLoop() 在后台运行（不 await），
     * 让 TUI 渲染循环继续工作，这样 appendStream() 的内容才能实时显示。
     */
    async submitTask(input) {
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
    async executeLoop(taskInput) {
        this.loopStartTime = Date.now();
        // ★ 清空证据收集器（每次新任务开始时重置）
        this.collectedDecisions = [];
        this.collectedToolCalls = [];
        this.collectedVerifications = [];
        this.lastCriticSummary = undefined;
        this.lastGuardSummary = undefined;
        // 创建 Loop 上下文和状态机
        const context = {
            taskId: this.state.currentTaskId,
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
                this.addLog("info", "loop", `状态变更: ${event.previousState} → ${event.nextState}${event.reason ? ` (${event.reason})` : ""}`);
                this.render();
            }
            catch (err) {
                // ★ 状态变更回调异常不能中断 executeLoop
                if (this._originalConsoleLog) {
                    this._originalConsoleLog("[stateChange error]", err);
                }
            }
        });
        try {
            // ===== Step 1: INTERROGATING =====
            if (this.nonInteractiveMode) {
                this.appendStream("### 🔍 拷问阶段（已跳过 — 非交互模式）\n\n");
                // 非交互模式：快速通过拷问状态
                await this.stateMachine.transition(LoopState.INTERROGATING, "非交互模式跳过拷问");
                await this.stateMachine.transition(LoopState.PLANNING, "开始规划");
            }
            else {
                this.appendStream("### 🔍 拷问阶段\n\n");
                await this.stateMachine.transition(LoopState.INTERROGATING, "开始拷问");
                await this.runInterrogationPhase(taskInput);
            }
            // ===== Step 2: PLANNING =====
            if (!this.nonInteractiveMode) {
                this.appendStream("### 📋 规划阶段\n\n");
                await this.stateMachine.transition(LoopState.PLANNING, "开始规划");
            }
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
                if (!verified) {
                    context.retryCount++;
                    if (context.retryCount < maxRetries) {
                        this.appendStream("### 🔄 Replan\n\n");
                        if (this.rollbackManager) {
                            await this.rollbackManager.rollback(context.taskId);
                        }
                        await this.stateMachine.transition(LoopState.PLANNING, `Replan (第 ${context.retryCount} 次)`);
                        await this.runPlanningPhase(taskInput);
                    }
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.addLog("error", "loop", `Loop 执行出错: ${message}`);
            this.appendStream("\n❌ Loop 执行出错: " + message + "\n\n");
            // ★ 必须重新抛出，让 submitTask 的 .catch() 正确处理（解锁输入框、显示错误）
            throw error;
        }
    }
    /**
     * 关闭 Modal
     */
    closeModal() {
        this.state.activeModal = null;
        this.render();
    }
    // ★ ADR-005: 内容类型选择（部门路由核心）
    /**
     * 显示可用内容格式菜单
     * ★ TUI 模式：使用 pi-tui SelectList overlay
     * 非TUI模式：回退到 console.log
     */
    showContentTypeMenu() {
        const types = this.contentDept.getAvailableTypes();
        // ★ TUI 模式：用 SelectList overlay 替代 console.log
        if (this.tui) {
            const selectItems = types.map((t) => ({
                value: t.type,
                label: t.label,
                description: t.description,
            }));
            const selectList = new SelectList(selectItems, Math.min(types.length, 8), {
                selectedPrefix: (t) => "\x1b[42;97m▸ " + t + "\x1b[0m",
                selectedText: (t) => "\x1b[1m" + t + "\x1b[0m",
                description: (t) => "\x1b[90m" + t + "\x1b[0m",
                scrollInfo: (t) => "\x1b[2m" + t + "\x1b[0m",
                noMatch: (t) => "\x1b[31m" + t + "\x1b[0m",
            });
            // 选择回调：自动选中并应用
            selectList.onSelect = async (item) => {
                try {
                    await this.selectContentType(item.value);
                    if (this.tui) {
                        this.tui.hideOverlay(); // 关闭选择器
                    }
                }
                catch (err) {
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
                }
                catch (err) {
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
            ? `\n  ✅ 当前选择: ${types.find((t) => t.type === this.selectedContentType)?.label ?? this.selectedContentType}`
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
    async selectContentType(type) {
        // 支持数字快捷键 (1-4)
        const typeMap = {
            "1": "article",
            "2": "seed",
            "3": "short-video",
            "4": "newsletter",
        };
        const resolvedType = typeMap[type] ?? type;
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
            // 5. 部门动态团队组建（Phase F：部门 + 动态团队打通）
            if (deptConfig.teamManager) {
                try {
                    const team = await deptConfig.teamManager.composeTeam(this.state.currentTaskInput ?? "", {
                        contentType: resolvedType,
                        departmentId: deptConfig.departmentId,
                        availableRoles: [...WORKER_ROLES],
                    });
                    const workerTypes = team.workers.map((w) => w.agentType).join(", ");
                    this.addLog("info", "team", `动态团队组建完成: ${team.workers.length} 人 [${workerTypes}] (规则: ${team.matchedRuleId})`);
                }
                catch (teamErr) {
                    this.addLog("warn", "team", `动态团队组建失败（降级到默认双核）: ${teamErr instanceof Error ? teamErr.message : teamErr}`);
                }
            }
            const typeLabel = this.contentDept.getAvailableTypes().find((t) => t.type === resolvedType)?.label ?? resolvedType;
            this.addLog("info", "department", `已切换到内容产出部 → ${typeLabel} (${resolvedType})`);
            console.log(`\n✅ 已切换到: ${typeLabel}\n   Writer Prompt 已注入 | GoalTemplates 已加载 | OutputPipeline 已配置\n`);
            this.render();
        }
        catch (e) {
            this.addLog("error", "department", `部门配置加载失败: ${e instanceof Error ? e.message : e}`);
        }
    }
    // ============================================================
    // ★ Console 拦截（TUI 模式下防止日志泄漏）
    // ============================================================
    /** 保存原始 console 方法 */
    _originalConsoleLog = null;
    _originalConsoleWarn = null;
    _originalConsoleError = null;
    /**
     * ★ 拦截 console.log/warn/error → 静默丢弃
     *
     * TUI 模式下 console.log 直接输出会破坏差分渲染。
     * 关键日志已通过回调机制输出到流式内容区，console.log 全部静默。
     */
    interceptConsoleToStream() {
        this._originalConsoleLog = console.log;
        this._originalConsoleWarn = console.warn;
        this._originalConsoleError = console.error;
        // TUI 模式下：所有 console.log 静默丢弃
        // 关键日志已通过 onIterationStart/onWriterOutput/onCriticResult 回调输出
        console.log = function (..._args) { };
        console.warn = function (..._args) { };
        console.error = function (..._args) { };
    }
    interceptConsole() {
        this.interceptConsoleToStream();
    }
    /**
     * ★ 恢复原始 console 方法
     *
     * 在退出 TUI 模式前调用，确保后续输出正常。
     */
    restoreConsole() {
        if (this._originalConsoleLog)
            console.log = this._originalConsoleLog;
        if (this._originalConsoleWarn)
            console.warn = this._originalConsoleWarn;
        if (this._originalConsoleError)
            console.error = this._originalConsoleError;
        this._originalConsoleLog = null;
        this._originalConsoleWarn = null;
        this._originalConsoleError = null;
    }
    /**
     * 退出应用
     */
    quit() {
        this.addLog("info", "app", "正在退出...");
        this.running = false;
        this.closeModal();
        // ★ 恢复 console（在 stop TUI 之前，确保再见消息能正常输出）
        this.restoreConsole();
        if (this.tui) {
            try {
                this.tui.stop();
            }
            catch {
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
     * 委托给 InterrogationCoordinator，返回的 Promise 等待用户完成所有回答后 resolve。
     */
    async runInterrogationPhase(taskInput) {
        if (!this.interrogateCoordinator)
            return;
        this.state.activeModal = "interrogate";
        return this.interrogateCoordinator.start(taskInput);
    }
    /**
     * 运行规划阶段
     */
    async runPlanningPhase(taskInput) {
        if (!this.planEngine)
            return;
        this.appendStream("正在生成执行计划...\n\n");
        try {
            const result = await this.planEngine.generatePlan({
                taskInput,
                interrogationResults: this.interrogateCoordinator?.result.cachedResults ?? {},
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
                this.loopContext.interrogationResults = this.interrogateCoordinator?.result.cachedResults ?? {};
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.appendStream(`\n❌ 计划生成失败: ${message}\n\n`);
            throw error;
        }
    }
    /**
     * 运行执行阶段
     */
    async runExecutionPhase() {
        const plan = this.stateMachine?.context.plan;
        if (!plan || plan.steps.length === 0) {
            this.addLog("warn", "execute", "无计划步骤，跳过执行");
            return;
        }
        if (!this.executionCoordinator) {
            this.addLog("error", "execute", "ExecutionCoordinator 未初始化");
            return;
        }
        try {
            const result = await this.executionCoordinator.run(plan);
            this.lastCriticSummary = result.criticSummary;
            this.lastGuardSummary = result.guardSummary;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.addLog("error", "execute", `执行失败: ${message}`);
            throw error;
        }
    }
    /**
     * 用户偏好持久化
     *
     * 将拷问结果写入 user.jsonl（用户偏好）。
     * self.jsonl 和 capability 完全由 EvolutionAgent 通过 AutoMerger 负责，
     * 此方法不再硬编码写入 self.jsonl，避免覆盖 EvolutionAgent 的分析结果。
     *
     * 数据来源：
     * - 拷问结果 → user.jsonl 用户偏好字段（带去重检查）
     */
    async persistUserPreferences() {
        const { evolution } = this.memoryManager;
        const cachedResults = this.interrogateCoordinator?.result.cachedResults ?? {};
        try {
            // 记录用户偏好（如有拷问结果）→ user.jsonl
            if (Object.keys(cachedResults).length > 0) {
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
                    // 将拷问结果作为用户偏好字段写入（带去重检查）
                    const existingFields = userData.fields ?? [];
                    const existingFieldMap = new Map(existingFields.map((f) => [f.key, f.value]));
                    let updatedCount = 0;
                    let skippedCount = 0;
                    for (const [key, value] of Object.entries(cachedResults)) {
                        // 如果已存在相同 key 且值相同，跳过
                        if (existingFieldMap.get(key) === value) {
                            skippedCount++;
                            continue;
                        }
                        // 如果已存在相同 key 但值不同，降低置信度（表示偏好可能变化）
                        const confidence = existingFieldMap.has(key) ? 0.85 : 0.9;
                        await evolution.updateUserField(key, value, "interrogate", confidence);
                        updatedCount++;
                    }
                    this.addLog("info", "memory", `✅ user.jsonl 已更新 (${updatedCount} 个偏好字段更新, ${skippedCount} 个去重跳过)`);
                }
                catch (userErr) {
                    this.addLog("warn", "memory", `用户偏好更新失败（非致命）: ${userErr instanceof Error ? userErr.message : userErr}`);
                }
            }
            this.addLog("info", "memory", "📝 用户偏好持久化完成 — user.jsonl 已同步（self.jsonl 由 EvolutionAgent 负责）");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.addLog("error", "memory", `用户偏好持久化失败: ${msg}`);
        }
    }
    /**
     * 运行验证阶段
     */
    async runVerificationPhase() {
        this.appendStream("正在验证结果...\n\n");
        if (!this.verifyEngine)
            return true;
        try {
            // 从 ArtifactManager 获取产物路径
            const allArtifacts = await this.artifactManager.listArtifacts();
            const artifacts = allArtifacts.map((a) => a.path);
            const result = await this.verifyEngine.verify({
                artifacts,
                originalTask: this.stateMachine?.context.taskInput ?? "",
                interrogationResults: this.interrogateCoordinator?.result.cachedResults ?? {},
                plan: this.stateMachine?.context.plan,
            });
            if (result.passed) {
                this.appendStream("**✅ 验证通过**\n\n");
            }
            else {
                this.appendStream("**❌ 验证失败**: " + result.reasons.join("; ") + "\n\n");
            }
            return result.passed;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.appendStream("⚠️ 验证出错: " + message + "\n\n");
            return false;
        }
    }
    /**
     * 运行进化阶段
     */
    async runEvolutionPhase() {
        if (!this.evolutionCoordinator) {
            this.appendStream("⚠️ EvolutionCoordinator 未初始化，跳过进化分析\n\n");
            return;
        }
        await this.evolutionCoordinator.run({
            lastCriticSummary: this.lastCriticSummary,
            lastGuardSummary: this.lastGuardSummary,
        });
    }
    /**
     * 获取主区域显示模式
     */
    getMainMode() {
        if (this.state.activeModal === "interrogate")
            return "modal";
        if (this.state.loopState === LoopState.EVOLVING)
            return "evolution";
        if (this.state.loopState === LoopState.DONE)
            return "summary";
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
    classifyTaskProfile(taskInput) {
        const input = taskInput.toLowerCase();
        const rules = [
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
    async injectMemoryExamples(plan) {
        try {
            const { evolution } = this.memoryManager;
            const experiences = await evolution.getExperiences(30);
            if (experiences.length === 0) {
                this.addLog("info", "memory", "无历史经验记录，跳过样例注入");
                return;
            }
            // 过滤：优先匹配同 taskType 的经验
            const taskProfile = plan.taskProfile ?? "generic";
            const relevant = experiences.filter((e) => e.taskType?.includes(taskProfile) || e.taskType === "content-generation");
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
            const examples = [
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
                this.addLog("info", "memory", `已注入 ${examples.length} 条动态样例（${successes.length} 高分 + ${failures.length} 低分）`);
            }
        }
        catch (e) {
            // 非致命：Memory 查询失败不影响主流程
            this.addLog("warn", "memory", `动态样例注入失败（非致命）: ${e instanceof Error ? e.message : e}`);
        }
    }
    /**
     * 直接渲染到终端（无 TUI 时的回退方案）
     */
    renderToTerminal() {
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
    renderModalToTerminal() {
        const renderResult = this.interrogateCoordinator?.renderModal();
        if (!renderResult)
            return;
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
        }
        else if (renderResult.type === "summary" && renderResult.summary) {
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
    addLog(level, source, message) {
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
    _renderTimer = null;
    scheduleRender() {
        if (this._renderTimer)
            return; // 已有待执行的渲染
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
     * 为 pi-agent-core 的 agentLoop 构造 pi-ai Model。
     *
     * 使用 pi-ai 官方 getModel 获取 OpenAI 标准模型元数据，再覆盖 baseUrl
     * 指向 OPENAI_API_BASE（兼容 LongCat 等 OpenAI-compatible 代理）。
     * 若环境变量未配置或模型 ID 不被 pi-ai 识别，则回退到兼容手搓循环。
     */
    createPiAiModel() {
        const modelId = process.env.OPENAI_MODEL;
        const baseUrl = process.env.OPENAI_API_BASE;
        if (!modelId || !baseUrl) {
            console.warn("[CLI] 未配置 OPENAI_MODEL/OPENAI_API_BASE，agentLoop 将回退到兼容手搓循环");
            return undefined;
        }
        try {
            const model = getModel("openai", modelId);
            return { ...model, baseUrl };
        }
        catch {
            console.warn(`[CLI] pi-ai 不识别模型 "${modelId}"，agentLoop 将回退到兼容手搓循环`);
            return undefined;
        }
    }
    /**
     * 创建默认 LLM Provider
     * 从环境变量读取配置，强制使用真实 API（禁止 Mock）
     */
    createDefaultLLMProvider() {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey || apiKey.trim().length === 0) {
            throw new Error("❌ 未检测到 OPENAI_API_KEY 环境变量。请在 .env 文件中配置或设置环境变量后重试。\n" +
                "   所需变量: OPENAI_API_KEY, OPENAI_API_BASE, OPENAI_MODEL");
        }
        try {
            const provider = PiAILLMProvider.fromEnvSync();
            console.log("✅ 检测到 API 配置，使用真实 LLM Provider (LongCat)");
            // 异步初始化（不阻塞构造）
            provider.init().catch((err) => {
                console.error(`⚠️ LLM Provider 初始化失败: ${err.message}`);
            });
            return provider;
        }
        catch (error) {
            throw new Error(`❌ 创建 LLM Provider 失败: ${error instanceof Error ? error.message : error}`);
        }
    }
}
// ==================== 辅助函数 ====================
/** 生成任务 ID */
function generateTaskId() {
    return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
/** 延迟工具函数 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** 进度动画帧（从 evolution-panel 导入的简化版）*/
function getEvolutionAnimationFrame(frameIndex) {
    const totalFrames = 40;
    if (frameIndex < totalFrames * 0.2) {
        return {
            phase: "analyzing",
            progress: Math.min(20, Math.round((frameIndex / (totalFrames * 0.2)) * 20)),
        };
    }
    else if (frameIndex < totalFrames * 0.5) {
        return {
            phase: "generating",
            progress: Math.min(50, 20 + Math.round(((frameIndex - totalFrames * 0.2) / (totalFrames * 0.3)) * 30)),
        };
    }
    else if (frameIndex < totalFrames * 0.85) {
        return {
            phase: "applying",
            progress: Math.min(85, 50 + Math.round(((frameIndex - totalFrames * 0.5) / (totalFrames * 0.35)) * 35)),
        };
    }
    else {
        return {
            phase: "complete",
            progress: Math.min(100, 85 + Math.round(((frameIndex - totalFrames * 0.85) / (totalFrames * 0.15)) * 15)),
        };
    }
}
/**
 * 格式化欢迎屏幕
 */
function formatWelcomeScreen() {
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
//# sourceMappingURL=app.js.map