import { type LLMProvider, type ContentType } from "@aicos/loop-engine";
/**
 * AI Company OS CLI 应用
 * 负责初始化所有组件、管理应用状态、协调 Loop 执行流程
 */
export declare class AICOSApp {
    /** TUI 管理器（封装 pi-tui 生命周期） */
    private tuiManager;
    /** 部门设置协调器（封装部门切换、团队组建、Agent 注册） */
    private departmentSetup;
    /** 应用状态 */
    private state;
    /** Loop 状态机 */
    private stateMachine;
    /** 可变的 Loop 上下文引用（用于跨方法共享） */
    private loopContext;
    /** 拷问引擎 */
    private interrogateEngine;
    /** 拷问阶段协调器 */
    private interrogateCoordinator;
    /** 规划引擎 */
    private planEngine;
    /** 验证引擎 */
    private verifyEngine;
    /** 回滚管理器 */
    private rollbackManager;
    /** 产物管理器 */
    private artifactManager;
    /** 记忆管理器（self.jsonl / user.jsonl / self.md / user.md） */
    private memoryManager;
    /** LLM Provider */
    private llmProvider;
    /** 工具注册表 */
    private toolRegistry;
    /** Loop Harness（委托给 LoopModule） */
    private loopHarness;
    /** 执行阶段协调器 */
    private executionCoordinator;
    /** Writer Agent 实例 */
    private writerAgent;
    /** Critic Agent 实例 */
    private criticAgent;
    /** Evolution Agent 实例 */
    private evolutionAgent;
    /** 进化阶段协调器 */
    private evolutionCoordinator;
    /** executeLoop 开始时间（用于进化阶段计算 executionDuration） */
    private loopStartTime;
    /** 最近一次 Critic 评估摘要（用于进化阶段沉淀） */
    private lastCriticSummary?;
    /** 最近一次 CompletionGuard 摘要（用于进化阶段沉淀） */
    private lastGuardSummary?;
    /** 是否正在运行 */
    private running;
    /** 轻量级证据收集器（从 LoopHarness 回调中收集，供进化阶段构造 IEvidenceReader） */
    private collectedDecisions;
    private collectedToolCalls;
    private collectedVerifications;
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
     * 主渲染入口
     * TUI 模式：请求重绘
     * 非TUI模式：回退到终端输出
     */
    render(): void;
    /** 构建主区域组件: 根据 mode 返回不同内容 */
    private buildMainComponent;
    /** 构建拷问 Modal 组件（Box overlay 风格） */
    private buildModalComponent;
    /** ★ 构建执行进度组件（PLANNING/EXECUTING 状态下替代空白 Modal） */
    private buildProgressComponent;
    /**
     * 追加流式内容到 Markdown 区域
     * 委托给 TUIManager.appendStream()
     */
    private appendStream;
    /**
     * ★ 锁定/解锁输入框
     * 委托给 TUIManager.setInputLocked()
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
    /** 是否为非交互模式（跳过拷问、不启动 TUI） */
    private nonInteractiveMode;
    /**
     * 非交互模式入口
     * 跳过 TUI 和拷问，直接执行任务
     */
    runNonInteractive(taskInput: string): Promise<void>;
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
     * 委托给 DepartmentSetup.selectContentType()
     */
    selectContentType(type: string | ContentType): Promise<void>;
    /**
     * ★ 恢复原始 console 方法
     * 委托给 TUIManager.restoreConsole()
     */
    private restoreConsole;
    /**
     * 退出应用
     */
    quit(): void;
    /**
     * 运行拷问阶段（Claude Code 风格：对话式，问题流式输出到上方）
     *
     * 委托给 InterrogationCoordinator，返回的 Promise 等待用户完成所有回答后 resolve。
     */
    private runInterrogationPhase;
    /**
     * 运行规划阶段
     */
    private runPlanningPhase;
    /**
     * 运行执行阶段
     */
    private runExecutionPhase;
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
    private persistUserPreferences;
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
     * 添加日志条目
     */
    private addLog;
}
//# sourceMappingURL=app.d.ts.map