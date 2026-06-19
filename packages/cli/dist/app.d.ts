import { type LLMProvider, type InterrogationSession } from "@aicos/loop-engine";
import type { ContentType } from "@aicos/loop-engine";
/**
 * AI Company OS CLI 应用
 * 负责初始化所有组件、管理应用状态、协调 Loop 执行流程
 */
export declare class AICOSApp {
    /** TUI 实例（pi-tui 或 mock） */
    private tui;
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
     * 主渲染循环
     * 根据当前状态组装布局数据并调用 TUI 渲染
     */
    render(): void;
    /**
     * 处理用户输入
     * 分发到对应的处理器
     */
    handleInput(input: string): Promise<void>;
    /**
     * 提交新任务
     * 触发完整的 Loop 执行流程
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
    /**
     * 退出应用
     */
    quit(): void;
    /**
     * 运行拷问阶段
     */
    private runInterrogationPhase;
    /**
     * 处理拷问 Modal 的用户输入
     */
    private handleInterrogateInput;
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
     * 构建完整的 TUI 布局数据
     */
    private buildLayout;
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
    /**
     * 创建默认 LLM Provider
     * 从环境变量读取配置，强制使用真实 API（禁止 Mock）
     */
    private createDefaultLLMProvider;
}
//# sourceMappingURL=app.d.ts.map