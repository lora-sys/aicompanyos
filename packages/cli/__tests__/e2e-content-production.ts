/**
 * E2E Test: 内容产出部 — 完整流程验证
 *
 * 验证链路：
 * 1. 用户选择内容格式 → DepartmentConfig 加载
 * 2. LoopHarness 注入部门配置 → WriterAgent 使用部门 Prompt
 * 3. LLM 调用（真实 LongCat API）→ 产出 Markdown
 * 4. OutputPipeline 处理 → 产出 HTML（平台适配）
 * 5. Memory 沉淀 → self.jsonl / user.jsonl 更新
 *
 * 运行方式：
 *   cd /Users/lora/repos/aicompanyos && node packages/cli/__tests__/e2e-content-production.ts
 */

import { PiAILLMProvider } from "@aicos/loop-engine";
import type { LLMProvider } from "@aicos/loop-engine";
import {
  ToolRegistry,
  LoopHarness,
  LoopModule,
  DEFAULT_WRITING_CRITERIA,
  type ExecutionPlan,
  type PlanStep,
  type LoopContext,
  type HarnessExecutionResult,
} from "@aicos/loop-engine";
import { WriterAgent } from "@aicos/subagents/writer";
import { CriticAgent } from "@aicos/subagents/critic";
import {
  ContentProductionDepartment,
  initDepartmentMemory,
  OutputPipeline,
} from "@aicos/content-production";
import { MCPClientAdapter, EXA_MCP_CONFIG } from "@aicos/mcp";
import type { ContentType, ProcessedOutput } from "@aicos/loop-engine";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// 手动加载 .env 文件（不依赖 dotenv）
const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// ============================================================
// 配置
// ============================================================

const TEST_CONTENT_TYPE: ContentType = "seed"; // 切回 seed 验证跨类型 Memory 回流
const TEST_TOPIC = "推荐一款最近改变我工作流的 AI 工具 —— Cursor IDE 的深度使用体验与效率提升";

// ============================================================
// 辅助函数
// ============================================================

function log(header: string, msg: string): void {
  console.log(`\n[${header}] ${msg}`);
}

function separator(title: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}\n`);
}

// ============================================================
// 主测试流程
// ============================================================

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  AI Company OS — 内容产出部 E2E 全流程测试              ║");
  console.log(`║  格式: ${TEST_CONTENT_TYPE} | 模型: LongCat-2.0-Preview           ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  // ===== Step 0: 环境检查 =====
  separator("Step 0: 环境检查");
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("❌ OPENAI_API_KEY 未设置！请确认 .env 文件存在且已加载。");
  }
  log("ENV", `API Base: ${process.env.OPENAI_API_BASE}`);
  log("ENV", `Model: ${process.env.OPENAI_MODEL}`);

  // ===== Step 1: 初始化部门记忆 =====
  separator("Step 1: 初始化部门记忆 (design.mdx / self.jsonl / user.jsonl)");
  const memResult = await initDepartmentMemory(process.cwd());
  log("MEMORY", `design.mdx=${memResult.designMDX}, self.jsonl=${memResult.selfJSONL}, user.jsonl=${memResult.userJSONL}`);

  // ===== Step 2: 创建 LLM Provider =====
  separator("Step 2: 创建 LLM Provider");
  const llmProvider: LLMProvider = PiAILLMProvider.fromEnvSync();
  await llmProvider.init();
  log("LLM", "✅ LongCat Provider 初始化完成");

  // ===== Step 3: 获取部门配置 =====
  separator(`Step 3: 加载内容产出部配置 (${TEST_CONTENT_TYPE})`);
  const dept = new ContentProductionDepartment();
  const deptConfig = dept.getConfig(TEST_CONTENT_TYPE);
  log("DEPT", `部门: ${deptConfig.departmentName}`);
  log("DEPT", `格式: ${deptConfig.contentType}`);
  log("DEPT", `Writer Prompt 长度: ${deptConfig.agentProfile.writerSystemPrompt.length} 字符`);
  log("DEPT", `Critic 维度数: ${deptConfig.agentProfile.criticDimensions?.length ?? 0}`);
  log("DEPT", `GoalTemplate 数: ${deptConfig.goalTemplates?.length ?? 0}`);
  log("DEPT", `OutputPipeline 步骤数: ${deptConfig.outputPipeline?.postProcessors.length ?? 0}`);
  log("DEPT", `质量门槛: pass=${deptConfig.qualityGate?.passThreshold}, excellence=${deptConfig.qualityGate?.excellenceThreshold}`);

  // ===== Step 3.5: Memory 回流 — HistoryReader 读取沉淀物并注入 Writer Prompt =====
  separator("Step 3.5: Memory 回流 (HistoryReader → Prompt 前缀注入)");
  let memoryPromptPrefix = "";
  let historyStats = { experienceCount: 0, capabilityCount: 0, hasUserProfile: false };
  try {
    const { EvolutionDocsManager, FileStore } = await import("@aicos/memory");
    const loopEngine = await import("@aicos/loop-engine");
    // 动态导入时解构可能失败，使用属性访问
    const HistoryReader = (loopEngine as any).HistoryReader;

    const fileStore = new FileStore(join(process.cwd(), "memory"));
    const evoMgr = new EvolutionDocsManager(fileStore);
    const reader = new HistoryReader(
      () => evoMgr.getSelfMD(),
      () => evoMgr.getUserMD(),
      {
        maxExperiences: 5,
        maxCapabilities: 8,
        includeUserProfile: true,
      }
    );

    const historyResult = await reader.buildPromptPrefix(TEST_TOPIC, {
      contentType: TEST_CONTENT_TYPE,
    });
    memoryPromptPrefix = historyResult.promptPrefix;
    historyStats = historyResult.stats;

    if (memoryPromptPrefix) {
      log("HISTORY", `✅ 历史经验已加载: ${historyStats.experienceCount}条经验, ${historyStats.capabilityCount}项能力, 用户画像=${historyStats.hasUserProfile}`);
      log("HISTORY", `Prompt前缀长度: ${memoryPromptPrefix.length} 字符`);
      // 显示前缀预览（前200字符）
      log("HISTORY", `预览: ${memoryPromptPrefix.slice(0, 200)}...`);
    } else {
      log("HISTORY", "⚠️ 无历史经验（首次运行或 Memory 为空）— 这是正常的，后续运行会积累");
    }
  } catch (e) {
    log("HISTORY", `⚠️ HistoryReader 初始化失败（非致命）: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ===== Step 4: 初始化工具和 Agent =====
  separator("Step 4: 初始化 ToolRegistry + Agent");
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerLocalTools(llmProvider);

  // ★ MCP 接入：连接 Exa 搜索服务并注册工具（含 web_search 别名）
  let mcpConnected = false;
  try {
    const mcpAdapter = new MCPClientAdapter();
    log("MCP", `正在连接 Exa MCP Server (${EXA_MCP_CONFIG.url})...`);
    const exaInfo = await mcpAdapter.connect(EXA_MCP_CONFIG);
    log("MCP", `✅ Exa MCP 已连接，发现 ${exaInfo.tools.length} 个工具: ${exaInfo.tools.map(t => t.name).join(", ")}`);

    toolRegistry.connectMCP(mcpAdapter);
    log("MCP", `✅ MCP 工具已注册（含别名: web_search → exa_exa_web_search）`);
    mcpConnected = true;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    log("MCP", `⚠️ Exa MCP 连接失败（非致命）: ${err}`);
    log("MCP", `WriterAgent 会跳过搜索步骤继续工作`);
  }

  // 验证工具注册状态
  log("TOOL", `可用工具: ${toolRegistry.listAll().map(t => t.name).join(", ")}`);
  log("TOOL", `web_search 可用: ${toolRegistry.has("web_search")}`);

  // ★ ADR-005: 使用部门 Prompt 创建 WriterAgent
  // ★ v0.3.1+: 拼接 Memory 回流前缀（历史经验 + 能力画像 + 用户画像）
  const enhancedWriterPrompt = memoryPromptPrefix
    ? `${memoryPromptPrefix}\n\n${deptConfig.agentProfile.writerSystemPrompt}`
    : deptConfig.agentProfile.writerSystemPrompt;

  const writerAgent = new WriterAgent(
    toolRegistry,
    llmProvider,
    enhancedWriterPrompt // 注入部门专属 Prompt + Memory 回流前缀
  );
  log("WRITER", `✅ WriterAgent 已创建（使用 ${TEST_CONTENT_TYPE} 专属 Prompt${memoryPromptPrefix ? " + Memory回流" : ""}）`);
  if (memoryPromptPrefix) {
    log("WRITER", `增强 Prompt 总长: ${enhancedWriterPrompt.length} (原=${deptConfig.agentProfile.writerSystemPrompt.length}, 前缀=${memoryPromptPrefix.length})`);
  }

  // ★ ADR-005: 使用部门维度创建 CriticAgent
  const criticAgent = new CriticAgent(llmProvider, DEFAULT_WRITING_CRITERIA);
  if (deptConfig.agentProfile.criticDimensions) {
    criticAgent.setCustomDimensions(deptConfig.agentProfile.criticDimensions);
  }
  log("CRITIC", `✅ CriticAgent 已创建（使用 ${TEST_CONTENT_TYPE} 专属评估维度）`);

  // ===== Step 5: 创建 LoopHarness 并注入部门配置 =====
  separator("Step 5: 创建 LoopHarness + 注入 DepartmentConfig");
  const harness = new LoopHarness(toolRegistry, llmProvider, {
    maxRewrites: 2, // E2E 测试减少重写次数以节省时间
    qualityThreshold: 70,
    maxReplans: 1,
    enableDegradationGuard: true,
    // ★ 核心注入点
    departmentConfig: deptConfig,
  });
  harness.setCriteria(DEFAULT_WRITING_CRITERIA);

  harness.registerAgent("writer", () => writerAgent);
  harness.registerAgent("critic", () => criticAgent);

  // ★ ADR-005: 注入 outputProcessor 回调（解决循环依赖）
  if (deptConfig.outputPipeline) {
    const pipelineConfig = deptConfig.outputPipeline;
    harness.setOutputProcessor(async (rawContent, ctx) => {
      const pipeline = new OutputPipeline(pipelineConfig);
      return pipeline.process(rawContent, ctx);
    });
    log("HARNESS", "✅ outputProcessor 已注入（OutputPipeline 回调）");
  }

  log("HARNESS", "✅ LoopHarness 已创建并注入 DepartmentConfig");

  // ===== Step 6: 构造执行计划 =====
  separator("Step 6: 构造 ExecutionPlan");
  const plan: ExecutionPlan = {
    steps: [
      {
        stepId: "content-gen-1",
        agentType: "writer",
        description: TEST_TOPIC,
        expectedOutput: `output/${TEST_CONTENT_TYPE}-test.md`,
        toolsNeeded: ["web_search"],
        metadata: {
          acceptanceGoals: undefined, // 让部门 GoalTemplate 自动生成
          contentType: TEST_CONTENT_TYPE,
        },
      },
      // ★ Critic 步骤必须紧跟 Writer 步骤，否则 LoopHarness 走 Orchestrator 路径而非 LoopModule 主路径
      {
        stepId: "content-review-1",
        agentType: "critic",
        description: `审核 ${TEST_CONTENT_TYPE} 内容质量`,
        expectedOutput: undefined,
        toolsNeeded: [],
        metadata: {},
      },
    ] as PlanStep[],
    taskProfile: "technical-blog",
  };

  log("PLAN", `计划步骤数: ${plan.steps.length} (Writer + Critic 配对)`);
  log("PLAN", `步骤1 [writer]: ${plan.steps[0].description.slice(0, 50)}...`);
  log("PLAN", `步骤2 [critic]: ${(plan.steps[1] as PlanStep).description}`);

  // ===== Step 7: 执行 Loop（真实 LLM 调用！）=====
  separator("Step 7: 执行 Loop（调用 LongCat API...）");
  const context: LoopContext = {
    taskId: `e2e-${Date.now()}`,
    taskInput: TEST_TOPIC,
    retryCount: 0,
    consensusRound: 0,
    plan,
    interrogationResults: {},
  };

  log("EXEC", "⏳ 开始执行 Inner Loop...");
  const execStart = Date.now();

  let result: HarnessExecutionResult;
  try {
    result = await harness.executeWithLoop(plan, context);
  } catch (error) {
    log("ERROR", `❌ Loop 执行失败: ${error instanceof Error ? error.message : error}`);
    throw error;
  }

  const execDuration = Math.round((Date.now() - execStart) / 1000);
  log("EXEC", `✅ Loop 执行完成！耗时 ${execDuration}s`);
  log("EXEC", `总迭代次数: ${result.totalIterations}`);
  log("EXEC", `是否通过: ${result.allPassed ? '✅ 是' : '❌ 否'}`);

  // ===== Step 8: 检查产物文件 =====
  separator("Step 8: 验证产物文件");
  const outputs = result.finalOutputs;
  log("OUTPUT", `产物数: ${Object.keys(outputs).length}`);

  for (const [key, value] of Object.entries(outputs)) {
    const content = typeof value === "string" ? value : JSON.stringify(value);
    log("OUTPUT", `[${key}] 长度: ${content.length} 字符`);
    // 显示前 200 字符预览
    console.log("--- 预览 ---");
    console.log(content.slice(0, 200));
    console.log((content.length > 200 ? "\n... (截断)" : "") + "\n");
  }

  // 检查实际写入的文件
  const artifactPath = join(process.cwd(), "artifacts", `${TEST_CONTENT_TYPE}-test.md`);
  if (existsSync(artifactPath)) {
    const stats = statSync(artifactPath);
    const fileContent = readFileSync(artifactPath, "utf-8");
    log("FILE", `✅ 产物文件存在: ${artifactPath}`);
    log("FILE", `大小: ${stats.size} bytes, 字数: ${fileContent.length}`);
  } else {
    log("FILE", `⚠️ 产物文件不存在: ${artifactPath}`);
  }

  // ===== Step 9: 检查 OutputPipeline 结果 =====
  separator("Step 9: 验证 OutputPipeline 处理结果");
  if (result.processedOutput) {
    const po: ProcessedOutput = result.processedOutput;
    log("PIPELINE", `处理后的格式: ${po.format}`);
    log("PIPELINE", `目标平台: ${po.platform ?? "无"}`);
    log("PIPELINE", `处理后长度: ${po.processedContent.length} 字符`);
    log("PIPELINE", `处理器日志:`);
    for (const proc of po.processorLog) {
      log("PIPELINE", `  ${proc.success ? "✅" : "❌"} ${proc.processorType} (${proc.durationMs}ms)${proc.error ? " ERROR: " + proc.error : ""}`);
    }
    // 保存处理后的 HTML
    if (po.format === "html") {
      const htmlPath = join(process.cwd(), "artifacts", `${TEST_CONTENT_TYPE}-test-output.html`);
      import("node:fs").then(({ writeFileSync }) => {
        writeFileSync(htmlPath, po.processedContent, "utf-8");
        log("PIPELINE", `✅ HTML 已保存: ${htmlPath} (${po.processedContent.length} bytes)`);
      });
    }
  } else {
    log("PIPELINE", "⚠️ 无 OutputPipeline 输出（可能未配置或执行失败）");
  }

  // ===== Step 10: 检查 Memory 沉淀 =====
  separator("Step 10: 验证 Memory 沉淀");
  const selfJsonlPath = join(process.cwd(), "memory", "self.jsonl");
  const userJsonlPath = join(process.cwd(), "memory", "user.jsonl");

  if (existsSync(selfJsonlPath)) {
    const selfLines = readFileSync(selfJsonlPath, "utf-8").trim().split("\n").filter(Boolean);
    log("MEMORY", `✅ self.jsonl 存在，条目数: ${selfLines.length}`);
    // 显示最后一条
    if (selfLines.length > 0) {
      const lastEntry = JSON.parse(selfLines[selfLines.length - 1]);
      log("MEMORY", `最新条目: [${lastEntry.type}] ${lastEntry.pattern?.slice(0, 60)}...`);
    }
  } else {
    log("MEMORY", "⚠️ self.jsonl 不存在（Evolution 阶段未执行）");
  }

  if (existsSync(userJsonlPath)) {
    const userLines = readFileSync(userJsonlPath, "utf-8").trim().split("\n").filter(Boolean);
    log("MEMORY", `✅ user.jsonl 存在，条目数: ${userLines.length}`);
  } else {
    log("MEMORY", "⚠️ user.jsonl 不存在");
  }

  // ===== 最终报告 =====
  separator("E2E 测试最终报告");
  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  console.log(`
┌─────────────────────────────────────────────┐
│  测试结果汇总                                │
├─────────────────────────────────────────────┤
│  内容格式:   ${String(TEST_CONTENT_TYPE).padEnd(34)}│
│  总耗时:     ${String(totalDuration + "s").padEnd(34)}│
│  迭代次数:   ${String(result.totalIterations).padEnd(34)}│
│  是否通过:   ${String(result.allPassed ? "✅ YES" : "❌ NO").padEnd(34)}│
│  产物格式:   ${String(result.processedOutput?.format ?? "N/A").padEnd(34)}│
│  平台适配:   ${String(result.processedOutput?.platform ?? "N/A").padEnd(34)}│
│  Pipeline:  ${String(result.processedOutput ? String(result.processedOutput.processorLog.filter(p => p.success).length + "/" + result.processedOutput.processorLog.length + " OK") : "N/A").padEnd(34)}│
│  Memory:     self.jsonl(${existsSync(selfJsonlPath) ? "✅" : "❌"}) user.jsonl(${existsSync(userJsonlPath) ? "✅" : "❌"})       │
└─────────────────────────────────────────────┘

${result.allPassed ? "🎉 E2E 测试通过！" : "⚠️ E2E 测试有异常，请查看上方日志"}
`);
}

// 运行
main().catch((err) => {
  console.error("\n❌ E2E 测试失败:", err);
  process.exit(1);
});
