// E2E 端到端测试脚本
// 使用真实 AI（LongCat API）跑通完整 Loop

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ============ 1. 加载 .env ============
const envPath = resolve(import.meta.dirname ?? ".", ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  console.warn("⚠️ 未找到 .env 文件，依赖环境变量");
}

// ============ 2. 导入模块 ============
import { PiAILLMProvider } from "./packages/loop-engine/dist/llm/pi-ai-provider.js";
import {
  LoopStateMachine,
  LoopState,
  InterrogateEngine,
  PlanEngine,
  VerifyEngine,
  ArtifactManager,
} from "./packages/loop-engine/dist/index.js";

// ============ 3. 测试函数 ============

async function testLLMConnectivity(provider: InstanceType<typeof PiAILLMProvider>) {
  console.log("\n=== 测试 1: LLM 连通性 ===\n");
  try {
    const result = await provider.chat([
      { role: "system", content: "你是一个测试助手。回复'OK'即可。" },
      { role: "user", content: "你好，请确认你能正常工作。" },
    ]);
    console.log(`✅ LLM 连接成功！响应: ${result.slice(0, 100)}...`);
    return true;
  } catch (error) {
    console.error(`❌ LLM 连接失败: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

async function testInterrogation(engine: InterrogateEngine) {
  console.log("\n=== 测试 2: Interrogate 拷问引擎 ===\n");
  try {
    const session = await engine.startSession("test-task-1", "写一篇关于 AI Agent 的技术博客");
    console.log(`📋 生成了 ${session.questions.length} 个拷问问题:`);
    for (const q of session.questions) {
      console.log(`   [${q.dimensionEmoji}] ${q.dimension}: ${q.question}`);
    }

    // 模拟用户回答
    let currentSession = session;
    for (const q of currentSession.questions) {
      currentSession = await engine.submitAnswer(currentSession, `这是关于"${q.dimension}"的回答 - AI Agent 架构设计实践`);
    }

    const context = engine.finalize(currentSession);
    console.log(`\n✅ 拷问完成！收集到的上下文:`, Object.keys(context));
    return context;
  } catch (error) {
    console.error(`❌ 拷问引擎失败: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function testPlanning(planEngine: PlanEngine, interrogationContext: Record<string, string>) {
  console.log("\n=== 测试 3: Plan Engine 规划引擎 ===\n");
  try {
    const result = await planEngine.generatePlan({
      taskInput: "写一篇关于 AI Agent 的技术博客",
      interrogationResults: interrogationContext,
      availableAgents: ["writer", "critic"],
      availableTools: ["file_read", "file_write", "llm_call", "web_search"],
    });
    console.log(`📋 计划 ID: ${result.plan.id}`);
    console.log(`📋 步骤数: ${result.plan.steps.length}`);
    for (const step of result.plan.steps) {
      console.log(`   → [${step.agentType}] ${step.description} → ${step.expectedOutput}`);
    }
    console.log(`\n✅ 规划完成！理由: ${result.reasoning.slice(0, 100)}...`);
    return result;
  } catch (error) {
    console.error(`❌ 规划引擎失败: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function testVerification(verifyEngine: VerifyEngine) {
  console.log("\n=== 测试 4: Verify Engine 验证引擎 ===\n");
  try {
    // 先创建一个测试产物
    const artifactManager = new ArtifactManager();
    await artifactManager.createArtifact({
      name: "blog.md",
      content: "# AI Agent 技术博客\n\n这是一篇由 AI Company OS 自动生成的技术博客。\n\n## 概述\n\nAI Agent 是自主感知、决策和执行的智能系统。",
      type: "blog",
    });

    const result = await verifyEngine.verify({
      artifacts: ["./artifacts/blog.md"],
      originalTask: "写一篇关于 AI Agent 的技术博客",
      interrogationResults: { topic: "AI Agent" },
      plan: {} as any,
    });
    console.log(`📊 验证结果: ${result.passed ? "✅ 通过" : "❌ 未通过"} (评分: ${result.score}/100)`);
    if (result.reasons.length > 0) {
      console.log(`   原因: ${result.reasons.join(", ")}`);
    }
    return result;
  } catch (error) {
    console.error(`❌ 验证引擎失败: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function testStateMachine() {
  console.log("\n=== 测试 5: State Machine 状态机 ===\n");
  try {
    const sm = new LoopStateMachine({ taskId: "test-sm", taskInput: "测试任务", retryCount: 0 });

    // 测试所有状态转换
    const transitions = [
      [LoopState.IDLE, LoopState.INTERROGATING],
      [LoopState.INTERROGATING, LoopState.PLANNING],
      [LoopState.PLANNING, LoopState.EXECUTING],
      [LoopState.EXECUTING, LoopState.VERIFYING],
      [LoopState.VERIFYING, LoopState.EVOLVING],
      [LoopState.EVOLVING, LoopState.DONE],
    ];

    for (const [from, to] of transitions) {
      await sm.transition(to, `测试转换 ${from} → ${to}`);
      console.log(`   ✅ ${from} → ${to} (当前: ${sm.state})`);
    }

    console.log("\n✅ 状态机全部转换通过！");
    return true;
  } catch (error) {
    console.error(`❌ 状态机失败: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

// ============ 4. 主流程 ============
async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  🧪 AI Company OS — E2T 端到端测试       ║");
  console.log("║  使用真实 LongCat API                    ║");
  console.log("╚══════════════════════════════════════════╝");

  // 检查环境变量
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ 缺少 OPENAI_API_KEY，请检查 .env 文件");
    process.exit(1);
  }
  console.log(`🔑 API Key: ${process.env.OPENAI_API_KEY.slice(0, 10)}...`);
  console.log(`🌐 API Base: ${process.env.OPENAI_API_BASE}`);
  console.log(`🤖 Model: ${process.env.OPENAI_MODEL}`);

  // 创建 Provider
  const provider = PiAILLMProvider.fromEnvSync();
  await provider.init();

  // 测试 1: LLM 连通性
  const llmOk = await testLLMConnectivity(provider);
  if (!llmOk) {
    console.error("\n💥 LLM 连接失败，终止测试");
    process.exit(1);
  }

  // 测试 2: 状态机
  const smOk = await testStateMachine();

  // 测试 3: 拷问引擎
  const interrogateEngine = new InterrogateEngine(provider);
  const interrogationContext = await testInterrogation(interrogateEngine);

  // 测试 4: 规划引擎
  const planEngine = new PlanEngine(provider);
  const planResult = await testPlanning(planEngine, interrogationContext ?? {});

  // 测试 5: 验证引擎
  const verifyEngine = new VerifyEngine(provider);
  const verifyResult = await testVerification(verifyEngine);

  // 总结
  console.log("\n══════════════════════════════════════════");
  console.log("📊 E2E 测试总结:");
  console.log(`   LLM 连通性:     ${llmOk ? "✅ 通过" : "❌ 失败"}`);
  console.log(`   状态机:          ${smOk ? "✅ 通过" : "❌ 失败"}`);
  console.log(`   拷问引擎:        ${interrogationContext ? "✅ 通过" : "❌ 失败"}`);
  console.log(`   规划引擎:        ${planResult ? "✅ 通过" : "❌ 失败"}`);
  console.log(`   验证引擎:        ${verifyResult ? "✅ 通过" : "❌ 失败"}`);

  const allPassed = llmOk && smOk && !!interrogationContext && !!planResult && !!verifyResult;
  console.log(`\n   总体结果: ${allPassed ? "🎉 全部通过！" : "⚠️ 部分失败，请查看上方日志"}`);
  
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("💥 未捕获错误:", err);
  process.exit(1);
});
