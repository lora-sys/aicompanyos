import { type LLMProvider, type InterrogationSession } from "@aicos/loop-engine";
import type { ContentType } from "@aicos/loop-engine";
/**
 * AI Company OS CLI 应用
 * 负责初始化所有组件、管理应用状态、协调 Loop 执行流程
 */
export declare class AICOSApp {
    /** TUI 实例（pi-tui 差分渲染引擎） */
    private tui;
    /** pi-tui Terminal 实例 */
    private terminal;
    /** 应用状态 */
    private state;
    /** Loop 状态机 */
    private stateMachine;
    /** 可变的 Loop 上下文引用（用于跨方法共享） */
    private loopContext;
    /** 拷问引擎 */
    private interrogateEngine;
    /** 规划引擎 */
    private planEngine;
    /** 编排器 */
    private orchestrator;
    /** 验证引擎 */
    private verifyEngine;
    /** 回滚管理器 */
    private rollbackManager;
    /** 产物管理器 */
    private artifactManager;
    /** 记忆管理器（self.jsonl / user.jsonl / self.md / user.md） */
    private memoryManager;
    /** 当前活跃的 Modal */
    private activeInterrogateModal;
    /** 流式内容区 Markdown 组件（动态 setText 更新） */
    private streamMarkdown;
    /** 流式内容累积文本 */
    private streamContent;
    /** 底部输入框组件 */
    private inputComponent;
    /** 执行中输入框锁定标记 */
    private inputLocked;
    /** ★ 拷问阶段等待 Promise 的 resolve 函数 */
    private interrogateResolve;
    /** Header Text 组件引用（用于增量更新） */
    private headerText;
    /** StatusBar Text 组件引用（用于增量更新） */
    private statusBarText;
    /** LLM Provider */
    private llmProvider;
    /** 工具注册表 */
    private toolRegistry;
    /** Loop Harness（委托给 LoopModule） */
    private loopHarness;
    /** Writer Agent 实例 */
    private writerAgent;
    /** Critic Agent 实例 */
    private criticAgent;
    /** 拷问结果缓存（用于传递给规划阶段） */
    private cachedInterrogationResults;
    /** 当前选中的内容格式 */
    private selectedContentType;
    /** 当前激活的部门配置 */
    private activeDepartmentConfig;
    /** 内容产出部实例 */
    private contentDept;
    /** 是否正在运行 */
    private running;
    constructor(llmProvider?: LLMProvider);
    /**
     * 初始化应用
     * 创建各引擎实例、建立事件监听
     */
    initialize(): Promise<void>;
    /**
     * 启动 TUI
     * 进入主循环等待用户输入
     */
    start(): Promise<void>;
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
    private rebuildLayout;
    /** 构建 Header 文本 */
    private buildHeaderText;
    /** 构建 StatusBar 文本 */
    private buildStatusBarText;
    /** ★ 增量更新 Header 和 StatusBar（更新流式内容的首行和末行） */
    private updateHeaderContent;
    private updateStatusBarContent;
    /**
     * 主渲染入口
     * TUI 模式：重建组件树并请求重绘
     * 非TUI模式：回退到终端输出
     */
    render(): void;
    /** 构建顶栏组件: Box + Text（应用名 + 状态 + TaskID） */
    private buildHeaderComponent;
    /** 构建主区域组件: 根据 mode 返回不同内容 */
    private buildMainComponent;
    /** 构建拷问 Modal 组件（Box overlay 风格） */
    private buildModalComponent;
    /** ★ 构建执行进度组件（PLANNING/EXECUTING 状态下替代空白 Modal） */
    private buildProgressComponent;
    /** ★ 构建底部状态栏组件（快捷键提示 + 状态信息） */
    private buildStatusBarComponent;
    /**
     * 追加流式内容到 Markdown 区域
     *
     * 所有 Agent 产出、评估、工具调用、进度信息都通过此方法追加。
     * 自动触发 TUI 重绘。
     */
    private appendStream;
    /**
     * 清空流式内容区
     */
    private clearStream;
    /**
     * ★ 锁定/解锁输入框
     *
     * 执行中锁定输入框，完成后解锁。
     * ★ 每次解锁后重新聚焦 Input 组件，确保键盘事件正确分发。
     */
    private setInputLocked;
    /** 构建侧边栏组件: MCP 状态 + 工具列表 */
    private buildSidebarComponent;
    /** 构建底栏组件: 日志流 + 快捷键提示（★ pi-tui Markdown 富文本渲染） */
    private buildFooterComponent;
    /**
     * 构建 Markdown 格式的日志内容（独立静态方法，避免模板字符串中反引号嵌套问题）
     */
    private static buildLogMarkdown;
    /**
     * 处理用户输入
     * 分发到对应的处理器
     */
    handleInput(input: string): Promise<void>;
    /**
     * 提交新任务（Claude Code 风格：流式显示执行过程）
     *
     * ★ 关键：executeLoop() 在后台运行（不 await），
     * 让 TUI 渲染循环继续工作，这样 appendStream() 的内容才能实时显示。
     */
    submitTask(input: string): Promise<void>;
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
    executeLoop(taskInput: string): Promise<void>;
    /**
     * 显示拷问 Modal
     */
    showInterrogateModal(session: InterrogationSession): void;
    /**
     * 关闭 Modal
     */
    closeModal(): void;
    /**
     * 显示可用内容格式菜单
     * ★ TUI 模式：使用 pi-tui SelectList overlay
     * 非TUI模式：回退到 console.log
     */
    showContentTypeMenu(): void;
    /**
     * 选择内容格式并加载对应部门配置
     *
     * 这是 ADR-005 部门路由的核心方法：
     * 1. 根据 contentType 获取 DepartmentConfig
     * 2. 将配置注入 LoopHarness
     * 3. 将 Writer Prompt 注入 WriterAgent
     * 4. 将 Critic 维度注入 CriticAgent
     */
    selectContentType(type: string | ContentType): void;
    /** 保存原始 console 方法 */
    private _originalConsoleLog;
    private _originalConsoleWarn;
    private _originalConsoleError;
    /**
     * ★ 拦截 console.log/warn/error → 静默丢弃
     *
     * TUI 模式下 console.log 直接输出会破坏差分渲染。
     * 关键日志已通过回调机制输出到流式内容区，console.log 全部静默。
     */
    private interceptConsoleToStream;
    private interceptConsole;
    /**
     * ★ 恢复原始 console 方法
     *
     * 在退出 TUI 模式前调用，确保后续输出正常。
     */
    private restoreConsole;
    /**
     * 退出应用
     */
    quit(): void;
    /**
     * 运行拷问阶段（Claude Code 风格：对话式，问题流式输出到上方）
     *
     * ★ 关键：返回 Promise，等待用户完成所有回答后才 resolve。
     * 这样 executeLoop() 才会暂停在拷问阶段，不会直接跳到规划。
     */
    private runInterrogationPhase;
    /**
     * 显示下一个拷问问题到流式内容区
     */
    private showNextInterrogateQuestion;
    /**
     * 处理拷问对话输入（Claude Code 风格：流式对话）
     *
     * ★ 拷问完成时调用 this.interrogateResolve() 解除 Promise 等待，
     * 让 executeLoop() 继续执行后续阶段。
     */
    private handleInterrogateInput;
    /**
     * ★ 解除拷问阶段 Promise 等待
     *
     * 在 handleInterrogateInput 中拷问完成时调用，
     * 让 executeLoop() 继续执行后续阶段。
     */
    private resolveInterrogate;
    /**
     * 运行规划阶段
     */
    private runPlanningPhase;
    /**
     * 运行执行阶段
     */
    private runExecutionPhase;
    /**
     * 产物后处理管线
     *
     * 将原始 .md 产物转换为多种输出格式。
     * 当前支持：HTML（Markdown → 带样式的独立页面）
     * 可扩展：在此处添加 PDF、DOCX、EPUB 等转换器
     */
    private runArtifactPipeline;
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
    private persistEvolutionMemory;
    /**
     * 运行验证阶段
     */
    private runVerificationPhase;
    /**
     * 运行进化阶段
     */
    private runEvolutionPhase;
    /**
     * 获取主区域显示模式
     */
    private getMainMode;
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
    private classifyTaskProfile;
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
    private injectMemoryExamples;
    /**
     * 直接渲染到终端（无 TUI 时的回退方案）
     */
    private renderToTerminal;
    /**
     * 将 Modal 内容渲染到终端
     */
    private renderModalToTerminal;
    /**
     * 添加日志条目
     */
    private addLog;
    /** ★ 渲染节流：最多每 200ms 重绘一次 */
    private _renderTimer;
    private scheduleRender;
    /**
     * 创建默认 LLM Provider
     * 从环境变量读取配置，强制使用真实 API（禁止 Mock）
     */
    private createDefaultLLMProvider;
}
//# sourceMappingURL=app.d.ts.map