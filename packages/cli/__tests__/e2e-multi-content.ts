/**
 * E2E 多内容类型测试 — 验证 article / newsletter / seed 三种格式的完整流程
 *
 * 测试内容：
 * 1. article (长文) — 深度技术文章
 * 2. newsletter (周刊) — AI 周报
 * 3. 对比验证：Memory 沉淀、HTML 质量、迭代轮次
 *
 * 运行: npx tsx packages/cli/__tests__/e2e-multi-content.ts
 */

import { join } from "node:path";
import {
  ContentProductionDepartment,
  initDepartmentMemory,
} from "@aicos/content-production";
import { PiAILLMProvider } from "@aicos/loop-engine";
import type { ContentType, LLMProvider } from "@aicos/loop-engine";
import { ToolRegistry } from "@aicos/loop-engine";
import { WriterAgent } from "@aicos/subagents/writer";
import { CriticAgent } from "@aicos/subagents/critic";
import { LoopHarness } from "@aicos/loop-engine";
import { MCPClientAdapter, EXA_MCP_CONFIG } from "@aicos/mcp";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";

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

interface TestScenario {
  contentType: ContentType;
  topic: string;
  expectedMinWords: number; // 最小字数（用于质量门控）
}

const SCENARIOS: TestScenario[] = [
  {
    contentType: "article",
    topic: "深入分析 AI Agent 架构的演进：从单模型到多智能体协作系统",
    expectedMinWords: 2000,
  },
  {
    contentType: "newsletter",
    topic: "本周 AI 领域重要动态：大模型进展、开源工具推荐、行业观察",
    expectedMinWords: 1500,
  },
];

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
// 核心测试函数（从 e2e-content-production.ts 提取）
// ============================================================

async function runSingleScenario(
  scenario: TestScenario,
  llmProvider: LLMProvider,
  index: number,
): Promise<{
  success: boolean;
  iterations: number;
  qualityScore: number;
  htmlSize: number;
  mdSize: number;
  memoryFiles: string[];
  durationMs: number;
}> {
  const startTime = Date.now();
  const { contentType, topic } = scenario;

  separator(`场景 ${index + 1}/${SCENARIOS.length}: ${contentType.toUpperCase()} — ${topic.slice(0, 40)}...`);

  // Step 1: 初始化部门记忆（每个场景独立初始化，避免干扰）
  log("MEMORY", `初始化 ${contentType} 记忆...`);
  await initDepartmentMemory(process.cwd());

  // Step 2: 获取部门配置
  const dept = new ContentProductionDepartment();
  const deptConfig = dept.getConfig(contentType);
  log("DEPT", `${deptConfig.departmentName} | Prompt: ${deptConfig.agentProfile.writerSystemPrompt.length} chars | Critic dims: ${deptConfig.agentProfile.criticDimensions?.length ?? 0}`);
  log("DEPT", `QualityGate: pass=${deptConfig.qualityGate?.passThreshold}, excellence=${deptConfig.qualityGate?.excellenceThreshold}`);

  // Step 3: 初始化工具 + Agent
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerLocalTools(llmProvider);

  let mcpConnected = false;
  try {
    const mcpAdapter = new MCPClientAdapter();
    const exaInfo = await mcpAdapter.connect(EXA_MCP_CONFIG);
    toolRegistry.connectMCP(mcpAdapter);
    mcpConnected = true;
    log("MCP", `✅ Connected (${exaInfo.tools.length} tools)`);
  } catch (e) {
    log("MCP", `⚠️ MCP skipped: ${e instanceof Error ? e.message : String(e)}`);
  }

  const writerAgent = new WriterAgent(
    toolRegistry,
    llmProvider,
    deptConfig.agentProfile.writerSystemPrompt,
  );
  const criticAgent = new CriticAgent(llmProvider);
  if (deptConfig.agentProfile.criticDimensions) {
    criticAgent.setCustomDimensions(deptConfig.agentProfile.criticDimensions);
  }
  log("AGENT", `Writer+Critic ready | Tools: ${toolRegistry.listAll().join(", ")}`);

  // Step 4: 构建 PlanStep 并执行 LoopHarness
  const stepId = `step-${contentType}-${Date.now()}`;
  const plan = {
    steps: [
      {
        id: stepId,
        agentType: "writer" as const,
        description: `生成${contentType}内容: ${topic}`,
        expectedOutput: `output/${contentType}-test.md`,
        toolsNeeded: ["web_search"],
        metadata: {
          contentType,
          departmentConfig: deptConfig,
        },
        input: topic,
      },
    ],
  };

  const harness = new LoopHarness(toolRegistry, llmProvider, {
    maxRewrites: 3,
  });

  harness.registerAgent("writer", () => writerAgent);
  harness.registerAgent("critic", () => criticAgent);

  // 注入 outputProcessor
  harness.setOutputProcessor(async (rawContent, ctx) => {
    log("PIPELINE", "OutputPipeline callback triggered");
    return { content: rawContent, format: ctx?.contentType ?? "markdown" };
  });

  if (deptConfig.acceptanceGoals) {
    harness.setAcceptanceCriteria(deptConfig.acceptanceGoals(stepId));
  }

  log("HARNESS", `Executing LoopHarness for ${contentType}...`);

  let result;
  try {
    result = await harness.executeWithLoop(plan, {
      projectRoot: process.cwd(),
      taskInput: topic,
    });
    // 调试：打印完整 result 结构
    log("DEBUG", `result keys: ${Object.keys(result).join(", ")}`);
    log("DEBUG", `stepResults length: ${result.stepResults?.length ?? "N/A"}`);
    if (result.stepResults?.[0]) {
      const sr = result.stepResults[0];
      log("DEBUG", `stepResult keys: ${Object.keys(sr).join(", ")}`);
      log("DEBUG", `iterations: ${sr.iterations?.length ?? "N/A"}`);
      log("DEBUG", `finalScore: ${sr.finalScore ?? "N/A"}`);
      log("DEBUG", `finalOutput length: ${sr.finalOutput?.length ?? "N/A"}`);
      log("DEBUG", `finalOutput preview: ${sr.finalOutput?.slice(0, 200) ?? "N/A"}`);
      // 检查 iterations[0] 的详情
      if (sr.iterations?.[0]) {
        const it = sr.iterations[0];
        log("DEBUG", `iter[0] output length: ${it.output?.length ?? "N/A"}`);
        log("DEBUG", `iter[0] score: ${it.evaluation?.totalScore ?? "N/A"}`);
        log("DEBUG", `iter[0] stopReason: ${it.stopReason ?? "N/A"}`);
        log("DEBUG", `iter[0] error: ${it.error ?? "N/A"}`);
      }
      log("DEBUG", `stopCondition: ${JSON.stringify(sr.stopCondition)}`);
    }
    log("DEBUG", `processedOutput format: ${result.processedOutput?.format ?? "N/A"}`);
    log("DEBUG", `totalDurationMs: ${result.totalDurationMs ?? "N/A"}`);
  } catch (e) {
    log("ERROR", `executeWithLoop threw: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }

  // 提取结果（兼容不同返回结构）
  const stepResult = result.stepResults?.[0];
  const iterations = stepResult?.iterations?.length ?? result.iterations ?? 0;
  const qualityScore = stepResult?.finalScore ?? result.finalScore ?? 0;
  const durationMs = Date.now() - startTime;

  // Step 5: 验证产物
  const mdPath = join(process.cwd(), "artifacts", `${contentType}-test.md`);
  const htmlPath = join(process.cwd(), "artifacts", `${contentType}-test-output.html`);
  const mdExists = existsSync(mdPath);
  const htmlExists = existsSync(htmlPath);

  const mdSize = mdExists ? readFileSync(mdPath, "utf-8").length : 0;
  const htmlSize = htmlExists ? readFileSync(htmlPath, "utf-8").length : 0;

  // Memory 文件检查
  const memDir = join(process.cwd(), "memory");
  const memoryFiles = existsSync(memDir)
    ? readdirSync(memDir).filter((f) => f.endsWith(".jsonl") || f.endsWith(".md") || f.endsWith(".mdx"))
    : [];

  // 结果汇总
  const passed = mdExists && htmlExists && mdSize > scenario.expectedMinWords && qualityScore > 0;

  log("RESULT", `${passed ? "✅ PASS" : "❌ FAIL"} | Iterations: ${iterations} | Score: ${qualityScore}/100`);
  log("RESULT", `MD: ${mdSize} chars (${mdExists ? "exists" : "MISSING"}) | HTML: ${htmlSize} chars (${htmlExists ? "exists" : "MISSING"})`);
  log("RESULT", `Memory files: ${memoryFiles.join(", ") || "none"}`);
  log("RESULT", `Duration: ${(durationMs / 1000).toFixed(1)}s`);

  return {
    success: passed,
    iterations,
    qualityScore,
    htmlSize,
    mdSize,
    memoryFiles,
    durationMs,
  };
}

// ============================================================
// 主函数
// ============================================================

async function main(): Promise<void> {
  const totalStart = Date.now();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  AI Company OS — 多内容类型 E2E 测试                      ║");
  console.log(`║  场景数: ${SCENARIOS.length} (article + newsletter)                    ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  // 环境检查
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("❌ OPENAI_API_KEY 未设置！");
  }
  log("ENV", `API Base: ${process.env.OPENAI_API_BASE} | Model: ${process.env.OPENAI_MODEL}`);

  // 创建 LLM Provider（共享）
  separator("初始化 LLM Provider");
  const llmProvider: LLMProvider = PiAILLMProvider.fromEnvSync();
  await llmProvider.init();
  log("LLM", "✅ LongCat Provider initialized");

  // 逐个运行场景
  const results: Awaited<ReturnType<typeof runSingleScenario>>[] = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const result = await runSingleScenario(SCENARIOS[i], llmProvider, i);
    results.push(result);
  }

  // ============================================================
  // 最终报告
  // ============================================================

  separator("最终测试报告");

  const allPassed = results.every((r) => r.success);
  const totalDuration = Date.now() - totalStart;

  console.log("\n┌────────────┬──────────┬────────┬─────────┬────────┬──────────┬──────────┐");
  console.log("│ 格式       │ 状态     │ 迭代   │ 质量分  │ MD大小 │ HTML大小 │ 耗时(s)  │");
  console.log("├────────────┼──────────┼────────┼─────────┼────────┼──────────┼──────────┤");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const s = SCENARIOS[i];
    console.log(
      `│ ${s.contentType.padEnd(10)}│ ${(r.success ? "✅ PASS" : "❌ FAIL").padEnd(8)} │ ` +
      `${String(r.iterations).padStart(6)} │ ${String(r.qualityScore).padStart(7)} │ ` +
      `${String(r.mdSize).padStart(6)} │ ${String(r.htmlSize).padStart(8)} │ ` +
      `${(r.durationMs / 1000).toFixed(1).padStart(8)} │`
    );
  }

  console.log("├────────────┼──────────┼────────┼─────────┼────────┼──────────┼──────────┤");
  console.log(
    `│ ${"总计".padEnd(10)}│ ${(allPassed ? "✅ ALL PASS" : "❌ SOME FAIL").padEnd(8)} │ ` +
    `-        │ -       │ -      │ -        │ ` +
    `${(totalDuration / 1000).toFixed(1).padStart(8)} │`
  );
  console.log("└────────────┴──────────┴────────┴─────────┴────────┴──────────┴──────────┘");

  // Memory 沉淀验证
  console.log("\n📦 Memory 沉淀物:");
  const memDir = join(process.cwd(), "memory");
  if (existsSync(memDir)) {
    for (const file of readdirSync(memDir)) {
      const filePath = join(memDir, file);
      const stat = statSync(filePath);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n").length;
      console.log(`  📄 ${file} (${(stat.size / 1024).toFixed(1)}KB, ${lines} lines)`);
    }
  }

  // 质量门槛门控验证（R2 修复效果）
  console.log("\n🔍 R2 质量门控验证:");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const s = SCENARIOS[i];
    const iterStatus = r.iterations >= 2 ? "✅ 多轮迭代正常" : "⚠️ 仅1轮（可能质量已达标或需调参）";
    console.log(`  ${s.contentType}: ${r.iterations}轮 → ${iterStatus} (score=${r.qualityScore})`);
  }

  if (!allPassed) {
    throw new Error(`\n❌ ${results.filter((r) => !r.success).length}/${results.length} 个场景未通过`);
  }

  console.log(`\n✅ 所有场景通过！总耗时: ${(totalDuration / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("\n💥 测试失败:", err);
  process.exit(1);
});
