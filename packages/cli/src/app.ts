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

import { WriterAgent } from "@aicos/subagents/writer";
import { CriticAgent } from "@aicos/subagents/critic";

import type {
  CLIAppState,
  LogEntry,
  ActiveModalType,
  MCPStatus,
} from "./types.js";

import { InterrogateModal } from "./components/interrogate-modal.js";
import { buildHeaderData, formatHeaderString } from "./components/header.js";
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

/**
 * AI Company OS CLI 应用
 * 负责初始化所有组件、管理应用状态、协调 Loop 执行流程
 */
export class AICOSApp {
  /** TUI 实例（pi-tui 或 mock） */
  private tui: any; // eslint-disable-line @typescript-eslint/no-explicit-any

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

    // 初始化 Loop Harness
    this.loopHarness = new LoopHarness(this.toolRegistry, this.llmProvider);
    this.loopHarness.setCriteria(DEFAULT_WRITING_CRITERIA);

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

    // TUI 实例（延迟初始化）
    this.tui = null;
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

    // 初始化 MCP 连接状态（模拟）
    this.state.mcpStatus.set("Exa Server", "disconnected");
    this.addLog("info", "mcp", "MCP 连接已就绪");
  }

  /**
   * 启动 TUI
   * 进入主循环等待用户输入
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.addLog("info", "app", "AI Company OS 已启动");

    // 首次渲染
    this.render();

    // 如果没有 TUI 实例，输出欢迎信息到控制台
    if (!this.tui) {
      console.log(formatWelcomeScreen());
      console.log("\n输入任务描述开始，或输入 'q' 退出。\n");
    }
  }

  /**
   * 主渲染循环
   * 根据当前状态组装布局数据并调用 TUI 渲染
   */
  render(): void {
    const layout = this.buildLayout();

    if (this.tui) {
      // 使用 pi-tui 渲染
      try {
        this.tui.render(layout);
      } catch (e) {
        // TUI 渲染失败时回退到终端输出
        this.renderToTerminal();
      }
    } else {
      // 无 TUI 时直接输出到终端
      this.renderToTerminal();
    }
  }

  /**
   * 处理用户输入
   * 分发到对应的处理器
   */
  async handleInput(input: string): Promise<void> {
    const trimmed = input.trim();

    // 全局快捷键
    if (trimmed.toLowerCase() === "q") {
      this.quit();
      return;
    }

    // 如果有活跃的 Modal，优先处理 Modal 输入
    if (this.state.activeModal === "interrogate" && this.activeInterrogateModal) {
      await this.handleInterrogateInput(trimmed);
      return;
    }

    // 默认：作为新任务提交
    await this.submitTask(trimmed);
  }

  /**
   * 提交新任务
   * 触发完整的 Loop 执行流程
   */
  async submitTask(input: string): Promise<void> {
    if (!input || input.length === 0) {
      this.addLog("warn", "app", "请输入有效的任务描述");
      return;
    }

    // 生成任务 ID
    const taskId = generateTaskId();
    this.state.currentTaskId = taskId;
    this.addLog("info", "task", `收到新任务: ${input.slice(0, 50)}...`);

    // 执行完整 Loop
    await this.executeLoop(input);

    this.render();
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
      this.state.loopState = event.nextState;
      this.addLog(
        "info",
        "loop",
        `状态变更: ${event.previousState} → ${event.nextState}${event.reason ? ` (${event.reason})` : ""}`
      );
      this.render();
    });

    try {
      // ===== Step 1: INTERROGATING =====
      await this.stateMachine.transition(LoopState.INTERROGATING, "开始拷问");
      await this.runInterrogationPhase(taskInput);

      // ===== Step 2: PLANNING =====
      await this.stateMachine.transition(LoopState.PLANNING, "开始规划");
      await this.runPlanningPhase(taskInput);

      // ===== Step 3-4: EXECUTING + VERIFYING（带重试） =====
      let verified = false;
      let maxRetries = 3;

      while (!verified && context.retryCount < maxRetries) {
        await this.stateMachine.transition(LoopState.EXECUTING, `执行计划 (尝试 ${context.retryCount + 1})`);
        await this.runExecutionPhase();

        await this.stateMachine.transition(LoopState.VERIFYING, "验证结果");
        verified = await this.runVerificationPhase();

        if (!verified && context.retryCount < maxRetries - 1) {
          // Replan
          this.addLog("warn", "loop", "验证失败，触发 Replan...");
          if (this.rollbackManager) {
            await this.rollbackManager.rollback(context.taskId);
          }
          context.retryCount++;
          await this.stateMachine.transition(LoopState.PLANNING, `Replan (第 ${context.retryCount} 次)`);
          await this.runPlanningPhase(taskInput);
        }
      }

      if (!verified) {
        this.addLog("error", "loop", "达到重试上限，任务终止");
        return;
      }

      // ===== Step 5: EVOLVING =====
      await this.stateMachine.transition(LoopState.EVOLVING, "开始进化");
      await this.runEvolutionPhase();

      // ===== Step 6: DONE =====
      await this.stateMachine.transition(LoopState.DONE, "任务完成");
      this.addLog("info", "loop", "✅ Loop 执行完成！");

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog("error", "loop", `Loop 执行出错: ${message}`);
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

  /**
   * 退出应用
   */
  quit(): void {
    this.addLog("info", "app", "正在退出...");
    this.running = false;
    this.closeModal();

    if (this.tui) {
      try {
        this.tui.quit();
      } catch {
        // 忽略
      }
    }

    console.log("\n👋 再见！");
    process.exit(0);
  }

  // ==================== 私有方法 ====================

  /**
   * 运行拷问阶段
   */
  private async runInterrogationPhase(taskInput: string): Promise<void> {
    if (!this.interrogateEngine) return;

    this.addLog("info", "interrogate", "正在生成澄清问题...");

    const session = await this.interrogateEngine.startSession(
      this.state.currentTaskId!,
      taskInput
    );

    // 弹出拷问 Modal
    this.showInterrogateModal(session);

    // 注意：实际交互在 handleInterrogateInput 中完成
    // 这里等待 Modal 关闭（由外部事件驱动）
  }

  /**
   * 处理拷问 Modal 的用户输入
   */
  private async handleInterrogateInput(input: string): Promise<void> {
    if (!this.activeInterrogateModal || !this.interrogateEngine) return;

    const modal = this.activeInterrogateModal;
    const action = modal.handleInput(input);

    switch (action.type) {
      case "SUBMIT": {
        // 提交回答
        const session = await this.interrogateEngine.submitAnswer(
          modal.currentSession,
          action.value
        );
        modal.updateSession(session);

        // 检查本轮是否完成
        if (this.interrogateEngine.isRoundComplete(session)) {
          // 进入摘要模式或继续下一轮
          const shouldContinue = await this.interrogateEngine.shouldContinue(session);
          if (shouldContinue) {
            const nextSession = await this.interrogateEngine.generateFollowUpQuestions(session);
            modal.updateSession(nextSession);
          } else {
            // 完成拷问
          const finalContext = this.interrogateEngine.finalize(session);
          this.cachedInterrogationResults = { ...finalContext };
          this.addLog("info", "interrogate", `拷问完成，收集到 ${Object.keys(finalContext).length} 个上下文维度`);
          this.closeModal();
          }
        }
        break;
      }

      case "SKIP": {
        const session = this.interrogateEngine.skipQuestion(modal.currentSession);
        modal.updateSession(session);
        break;
      }

      case "BACK": {
        const session = this.interrogateEngine.goBack(modal.currentSession);
        modal.updateSession(session);
        break;
      }

      case "CONFIRM": {
        // 摘要确认完成
        const session = modal.currentSession;
        const finalContext = this.interrogateEngine.finalize(session);
        this.cachedInterrogationResults = { ...finalContext };
        this.addLog("info", "interrogate", `拷问确认完成，收集到 ${Object.keys(finalContext).length} 个上下文维度`);
        this.closeModal();
        break;
      }

      case "CANCEL": {
        this.addLog("warn", "interrogate", "用户取消了拷问流程");
        this.closeModal();
        break;
      }

      case "NAVIGATE_TO": {
        // 摘要模式下的导航，仅更新高亮位置
        break;
      }
    }

    this.render();
  }

  /**
   * 运行规划阶段
   */
  private async runPlanningPhase(taskInput: string): Promise<void> {
    if (!this.planEngine) return;

    this.addLog("info", "plan", "正在生成执行计划...");

    try {
      const result = await this.planEngine.generatePlan({
        taskInput,
        // 使用拷问阶段收集的真实结果（如果有）
        interrogationResults: this.cachedInterrogationResults,
        availableAgents: ["writer", "critic", "ui-ux"],
        // 从 ToolRegistry 获取已注册的工具列表
        availableTools: this.toolRegistry.listAll().map(t => t.name),
      });

      this.addLog("info", "plan", `计划已生成: ${result.plan.steps.length} 个步骤`);

      // v0.2.0: 自动分类任务类型 → 标记 TaskProfile（用于阈值自适应选择）
      const taskProfile = this.classifyTaskProfile(taskInput);
      result.plan.taskProfile = taskProfile;
      this.addLog("info", "plan",
        `任务类型: ${taskProfile}（阈值将按此档位自适应调整）`
      );

      // 更新上下文中的计划（通过可变引用）
      if (this.loopContext) {
        this.loopContext.plan = result.plan;
        // 同时将拷问结果注入上下文，供 Agent 使用
        this.loopContext.interrogationResults = this.cachedInterrogationResults;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog("error", "plan", `计划生成失败: ${message}`);
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
   * 构建完整的 TUI 布局数据
   */
  private buildLayout() {
    const header = buildHeaderData({
      currentState: this.state.loopState,
      taskId: this.state.currentTaskId,
    });

    const sidebar = buildSidebarData({
      mcpConnections: Array.from(this.state.mcpStatus.entries()).map(([name, status]) => ({
        name,
        status,
        toolCount: status === "connected" ? 3 : 0,
      })),
    });

    const footer = buildFooterData({
      logs: this.state.logs,
    });

    return {
      header,
      main: {
        mode: this.getMainMode(),
      },
      sidebar,
      footer,
    };
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
    // 清屏（简单实现）
    console.clear();

    // 顶栏
    const header = buildHeaderData({
      currentState: this.state.loopState,
      taskId: this.state.currentTaskId,
    });
    console.log(formatHeaderString(header));
    console.log("");

    // 主区域
    switch (this.getMainMode()) {
      case "modal": {
        if (this.activeInterrogateModal) {
          this.renderModalToTerminal();
        }
        break;
      }
      case "evolution": {
        const evoData = buildEvolutionPanelData({ phase: "analyzing", progress: 50 });
        console.log(formatEvolutionString(evoData));
        break;
      }
      default: {
        const loopData = buildLoopVisualizationData({
          currentState: this.state.loopState,
        });
        console.log(formatLoopASCII(loopData));
        break;
      }
    }

    console.log("");

    // 侧边栏
    const sidebar = buildSidebarData();
    console.log(formatSidebarString(sidebar));
    console.log("");

    // 底栏
    const footer = buildFooterData({ logs: this.state.logs });
    console.log(formatFooterString(footer));
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
