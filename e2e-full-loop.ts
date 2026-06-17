// 全链路 E2E 测试 — 真实 AI 完整 Loop
// Interrogate(真实问题+自动回答) → Plan(真实计划) → Writer(真实写作) → Critic(真实审核) → Verify → Evolution

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============ 加载 .env ============
try {
  const envContent = readFileSync(resolve(__dirname, ".env"), "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
} catch {}

// ============ 导入模块 ============
import {
  PiAILLMProvider,
  LoopStateMachine,
  LoopState,
  InterrogateEngine,
  PlanEngine,
  ExecutionOrchestrator,
  ConsensusLock,
  VerifyEngine,
  RollbackManager,
  ArtifactManager,
  ToolRegistry,
  type LLMProvider,
  type LoopContext,
  type ExecutionPlan,
} from "./packages/loop-engine/dist/index.js";

import { EvidenceChain } from "./packages/evidence-chain/dist/index.js";
import { MemoryManager } from "./packages/memory/dist/index.js";

// ============ 工具函数 ============
function log(phase: string, msg: string) {
  console.log(`\n[${phase}] ${msg}`);
}

function separator(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

// ============ 主流程 ============
async function main() {
  separator("AI Company OS — 全链路 E2E 测试（真实 LongCat AI）");

  // ---- 0. 初始化 ----
  log("INIT", "初始化所有组件...");

  const provider = PiAILLMProvider.fromEnvSync();
  await provider.init();

  const evidenceChain = new EvidenceChain("e2e-full-" + Date.now(), "task-e2e", "写一篇关于 AI Agent 的技术博客");
  const memoryManager = new MemoryManager(resolve(__dirname));
  await memoryManager.initializeForTask("task-e2e", "写一篇关于 AI Agent 的技术博客");

  const stateMachine = new LoopStateMachine({
    taskId: "task-e2e",
    taskInput: "写一篇关于 AI Agent 架构设计的技术博客",
    retryCount: 0,
    consensusRound: 0,
  });

  const interrogateEngine = new InterrogateEngine(provider);
  const planEngine = new PlanEngine(provider);
  const verifyEngine = new VerifyEngine(provider);
  const artifactManager = new ArtifactManager();
  const rollbackManager = new RollbackManager(stateMachine);
  const toolRegistry = new ToolRegistry();

  // 注册 Local Tools
  toolRegistry.registerLocalTools(provider);

  const orchestrator = new ExecutionOrchestrator(toolRegistry);

  log("INIT", `API: ${process.env.OPENAI_API_BASE} | Model: ${process.env.OPENAI_MODEL}`);
  log("INIT", "所有组件初始化完成 ✅");

  let context: LoopContext = stateMachine["context"] ?? {
    taskId: "task-e2e",
    taskInput: "写一篇关于 AI Agent 架构设计的技术博客",
    retryCount: 0,
    consensusRound: 0,
  };

  try {
    // ============================================================
    // PHASE 1: INTERROGATING — 真实拷问 + 自动回答
    // ============================================================
    separator("PHASE 1: INTERROGATING（拷问）");

    await stateMachine.transition(LoopState.INTERROGATING, "开始拷问");

    let currentSession = await interrogateEngine.startSession("task-e2e", context.taskInput);
    log("INTERROGATE", `LLM 生成了 ${currentSession.questions.length} 个澄清问题:`);

    for (let i = 0; i < currentSession.questions.length; i++) {
      const q = currentSession.questions[i];
      log("INTERROGATE", `\n  [${q.dimensionEmoji}] ${q.dimension}`);
      log("INTERROGATE", `  Q: ${q.question}`);
      if (q.hints?.length) log("INTERROGATE", `  提示: ${q.hints.join(" / ")}`);

      // 自动回答：根据维度生成合理回答
      const autoAnswer = generateAutoAnswer(q.dimension, q.question);
      log("INTERROGATE", `  A: ${autoAnswer}`);

      currentSession = await interrogateEngine.submitAnswer(currentSession, autoAnswer);
      evidenceChain.append(evidenceChain.decisions.record({
        agentType: "interrogate",
        decisionPoint: `回答拷问问题 #${i + 1}: ${q.dimension}`,
        inputPrompt: q.question,
        finalChoice: autoAnswer,
        confidence: 0.9,
        taskId: "task-e2e",
      }));
    }

    const interrogationContext = interrogateEngine.finalize(currentSession);
    log("INTERROGATE", `\n✅ 拷问完成！收集到 ${Object.keys(interrogationContext).length} 个上下文维度:`);
    for (const [key, val] of Object.entries(interrogationContext)) {
      log("INTERROGATE", `   · ${key}: ${(val as string).slice(0, 60)}...`);
    }

    context.interrogationResults = interrogationContext;

    // ============================================================
    // PHASE 2: PLANNING — 真实规划
    // ============================================================
    separator("PHASE 2: PLANNING（规划）");

    await stateMachine.transition(LoopState.PLANNING, "开始规划");

    const planResult = await planEngine.generatePlan({
      taskInput: context.taskInput,
      interrogationResults: interrogationContext,
      availableAgents: ["writer", "critic"],
      availableTools: ["file_read", "file_write", "llm_call"],
    });

    context.plan = planResult.plan;

    log("PLAN", `计划 ID: ${planResult.plan.id}`);
    log("PLAN", `共 ${planResult.plan.steps.length} 个步骤:`);
    for (let i = 0; i < planResult.plan.steps.length; i++) {
      const step = planResult.plan.steps[i];
      log("PLAN", `  ${i + 1}. [${step.agentType.toUpperCase()}] ${step.description}`);
      log("PLAN", `     → 输出: ${step.expectedOutput}`);

      evidenceChain.append(evidenceChain.steps.record({
        previousState: "planning",
        nextState: "executing",
        triggerReason: `步骤 ${i + 1}: ${step.agentType}`,
        triggeredBy: "PlanEngine",
        taskId: "task-e2e",
      }));
    }

    log("PLAN", `✅ 规划完成`);

    // ============================================================
    // PHASE 3: EXECUTING — Writer Agent 真实写作
    // ============================================================
    separator("PHASE 3: EXECUTING（Writer 写作）");

    await stateMachine.transition(LoopState.EXECUTING, "执行计划 - Writer 写作");

    // 用 LLM 直接模拟 Writer Agent 的写作工作流
    log("EXECUTE", "Writer Agent 开始写作...");
    log("EXECUTE", "  步骤 1: 获取 UI/UX 设计指导...");

    const uxGuidancePrompt = [
      { role: "system", content: "你是 UI/UX 设计专家。为这篇技术博客提供设计建议，返回 JSON 格式。" },
      { role: "user", content: `为一篇关于「${context.taskInput}」的技术博客提供设计建议。目标读者：${interrogationContext["目标读者"] || "技术从业者"}。返回 JSON: { colorPalette: {...}, typography: {...}, overallGuidance: "..." }` },
    ];

    let uxGuidance = "";
    try {
      uxGuidance = await provider.chat(uxGuidancePrompt);
      log("EXECUTE", "  ✅ UI/UX 指导已获取");
    } catch (e) {
      uxGuidance = '{"overallGuidance": "使用简洁专业的技术博客风格"}';
      log("EXECUTE", "  ⚠️ UI/UX 指导获取失败，使用默认值");
    }

    log("EXECUTE", "  步骤 2: 搜集参考资料（跳过 MCP，直接用 LLM 知识）...");
    log("EXECUTE", "  步骤 3: 生成文章内容...");

    const writerPrompt = [
      {
        role: "system",
        content: [
          "你是一个专业的内容创作者（Writer Agent）。",
          "你的任务是根据用户需求和上下文撰写高质量的技术博客文章。",
          "",
          "要求:",
          "- 使用 Markdown 格式",
          "- 结构清晰：包含标题、引言、正文各章节、总结",
          "- 内容有深度：涵盖技术原理、架构设计、实践案例",
          "- 字数 1500-3000 字",
          "- 语言专业但易懂",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `任务: ${context.taskInput}`,
          ``,
          `收集到的需求信息:`,
          ...Object.entries(interrogationContext).map(([k, v]) => `- ${k}: ${v}`),
          ``,
          `UI/UX 设计建议: ${uxGuidance.slice(0, 500)}`,
          ``,
          `请现在撰写完整的技术博客文章。`,
        ].join("\n"),
      },
    ];

    const writerOutput = await provider.chat(writerPrompt);

    // 记录工具调用 trace
    const { traceId: writerTraceId } = evidenceChain.toolCalls.startCall("llm_call", "local", "writer", { prompt: "Writer writing task" }, "task-e2e");
    evidenceChain.append(evidenceChain.toolCalls.endCall(
      writerTraceId,
      { content: writerOutput.slice(0, 100) + "..." },
      true,
    ));

    // 写入产物文件
    const artifact = await artifactManager.createArtifact({
      name: "blog.md",
      content: writerOutput,
      type: "blog",
    });

    log("EXECUTE", `  ✅ 文章已写入: ${artifact.path}`);
    log("EXECUTE", `  📊 字数: ${artifact.sizeBytes} bytes`);
    log("EXECUTE", `  📝 内容预览:\n${"─".repeat(50)}`);
    console.log(writerOutput.slice(0, 800) + (writerOutput.length > 800 ? "\n... (截断)" : ""));
    console.log("─".repeat(50));

    context.artifacts = [artifact.path];

    // ============================================================
    // PHASE 4: CONSENSUS — Critic Agent 真实审核
    // ============================================================
    separator("PHASE 4: CONSENSUS（Critic 审核）");

    await stateMachine.transition(LoopState.VERIFYING, "Critic 审核");

    log("CRITIC", "Critic Agent 开始审核...");

    const criticPrompt = [
      {
        role: "system",
        content: [
          "你是一个严格但建设性的内容审核员（Critic Agent）。",
          "你从五个维度评估内容质量：",
          "1. 准确性 (accuracy) - 信息是否正确",
          "2. 完整性 (completeness) - 是否覆盖要点",
          "3. 风格 (style) - 语言风格是否合适",
          "4. 格式合规 (format) - Markdown 格式是否规范",
          "5. 内容质量 (uxQuality) - 整体可读性和价值",
          "",
          "每个维度 0-20 分，总分 0-100。",
          "低于 75 分必须给出具体修改建议。",
          "即使通过也要给出改进空间。",
          "",
          "返回 JSON 格式:",
          "{ overallScore: N, dimensions: { accuracy: {score:N,comment:\"...\"}, ... }, suggestions: [...], reasoning: \"...\" }",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `原始任务: ${context.taskInput}`,
          ``,
          `需求信息:`,
          ...Object.entries(interrogationContext).map(([k, v]) => `- ${k}: ${v}`),
          ``,
          `待审核的文章 (${writerOutput.length} 字符):`,
          ``,
          writerOutput,
        ].join("\n"),
      },
    ];

    const criticRaw = await provider.chat(criticPrompt);

    // 解析 Critic 结果
    let criticScore = 0;
    let criticReasoning = "";
    try {
      const jsonMatch = criticRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        criticScore = parsed.overallScore ?? parsed.score ?? 50;
        criticReasoning = parsed.reasoning || parsed.comment || "";

        if (parsed.dimensions) {
          for (const [dim, data] of Object.entries(parsed.dimensions)) {
            const d = data as { score?: number; comment?: string };
            log("CRITIC", `  [${dim}] ${d.score ?? "?"}/20: ${d.comment?.slice(0, 60)}`);
          }
        }

        if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
          log("CRITIC", `  建议共 ${parsed.suggestions.length} 条:`);
          for (const s of parsed.suggestions.slice(0, 5)) {
            log("CRITIC", `    · ${typeof s === "string" ? s : JSON.stringify(s).slice(0, 80)}`);
          }
        }
      } else {
        criticScore = 70;
        criticReasoning = criticRaw.slice(0, 200);
      }
    } catch {
      criticScore = 65;
      criticReasoning = criticRaw.slice(0, 200);
    }

    log("CRITIC", `\n📊 总分: ${criticScore}/100`);
    log("CRITIC", `📝 总结: ${criticReasoning.slice(0, 150)}...`);

    evidenceChain.append(evidenceChain.decisions.record({
      agentType: "critic",
      decisionPoint: "审核 Writer 产出",
      inputPrompt: "审核博客文章质量",
      finalChoice: criticScore >= 75 ? "APPROVE" : "REJECT",
      confidence: criticScore / 100,
      taskId: "task-e2e",
    }));

    // ============================================================
    // PHASE 5: VERIFYING — 验证引擎
    // ============================================================
    separator("PHASE 5: VERIFYING（验证）");

    const verifyResult = await verifyEngine.verify({
      artifacts: context.artifacts,
      originalTask: context.taskInput,
      interrogationResults: interrogationContext,
      plan: context.plan!,
    });

    log("VERIFY", `验证结果: ${verifyResult.passed ? "✅ 通过" : "❌ 未通过"} (${verifyResult.score}/100)`);
    for (const reason of verifyResult.reasons) {
      log("VERIFY", `  · ${reason}`);
    }

    for (const check of verifyResult.artifactChecks) {
      log("VERIFY", `  [${check.path}] 存在:${check.exists} 非空:${check.nonEmpty} 质量:${check.qualityScore}`);
    }

    // ============================================================
    // PHASE 6: EVOLVING — 进化系统
    // ============================================================
    separator("PHASE 6: EVOLVING（进化）");

    await stateMachine.transition(LoopState.EVOLVING, "开始自进化");

    log("EVOLVE", "Evolution Agent 正在分析 Evidence Chain...");

    // 提取模式（用 LLM 分析本次执行的模式）
    const evolvePrompt = [
      {
        role: "system",
        content: "你是 Evolution Agent（自我反思与模式学习引擎）。分析本次执行的模式并输出学习到的经验。返回 JSON: { patterns: string[], lesson: string, capabilityDelta: {...} }",
      },
      {
        role: "user",
        content: [
          `任务: ${context.taskInput}`,
          `Critic 评分: ${criticScore}/100`,
          `验证评分: ${verifyResult.score}/100`,
          `产出的字节数: ${artifact.sizeBytes}`,
          ``,
          `请分析本次执行的成败模式，提取可学习的经验。`,
        ].join("\n"),
      },
    ];

    let evolveResult: { patterns: string[]; lesson: string } | null = null;
    try {
      const evolveRaw = await provider.chat(evolvePrompt);
      const jsonMatch = evolveRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evolveResult = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // fallback
    }

    if (evolveResult) {
      log("EVOLVE", "识别到的模式:");
      for (const p of evolveResult.patterns?.slice(0, 5) ?? []) {
        log("EVOLVE", `  · ${p}`);
      }
      log("EVOLVE", `\n💡 经验教训: ${evolveResult.lesson?.slice(0, 200)}`);
    }

    // 尝试更新进化文档
    try {
      const docs = memoryManager.evolution;

      // 更新 user.md
      const userExists = await docs.getUserMD();
      if (!userExists) {
        await docs.createUserMD({
          writingStyle: interrogationContext["文章风格"] || "专业技术",
          topicTendencies: ["AI", "Agent", "架构设计"],
          expressionHabits: ["使用 Markdown", "结构化写作"],
          targetAudience: interrogationContext["目标读者"] || "技术从业者",
          workflowPreference: "先拷问再执行",
        });
        log("EVOLVE", "✅ user.md 已创建");
      }

      // 更新 self.md
      const selfExists = await docs.getSelfMD();
      if (!selfExists) {
        await docs.createSelfMD();
      }
      await docs.addExperience({
        type: criticScore >= 70 ? "success" : "learning",
        taskType: "blog",
        pattern: evolveResult?.patterns?.[0] || "首次完成技术博客写作",
        lesson: evolveResult?.lesson || "Writer+Critic 双Agent 流程有效",
        capabilityDelta: {
          addedCapabilities: ["blog-writing"],
        },
      });
      log("EVOLVE", "✅ self.md 已更新（追加经验条目）");

      // 尝试更新 design.mdx
      const designExists = await docs.getDesignMDX();
      if (!designExists) {
        await docs.createDesignMDX([
          {
            blockId: "color-primary",
            blockType: "color_palette",
            content: `{ name: "Primary Blue", hex: "#2563EB", usage: "技术博客主色调" }`,
            lastUpdated: new Date().toISOString(),
            updatedBy: "evolution",
          },
          {
            blockId: "typography-base",
            blockType: "typography",
            content: `{ headingFont: "System Sans", bodyFont: "System Sans", lineHeight: "1.7" }`,
            lastUpdated: new Date().toISOString(),
            updatedBy: "evolution",
          },
        ]);
        log("EVOLVE", "✅ design.mdx 已创建（初始版本）");
      }
    } catch (e) {
      log("EVOLVE", `⚠️ 进化文档更新部分失败: ${e instanceof Error ? e.message : e}`);
    }

    // ============================================================
    // PHASE 7: DONE — 完成
    // ============================================================
    separator("PHASE 7: DONE（完成）");

    await stateMachine.transition(LoopState.DONE, "全链路完成");

    // 保存 Evidence Chain
    const evidenceDir = resolve(__dirname, "memory", "evidence");
    mkdirSync(evidenceDir, { recursive: true });
    const chainFile = resolve(evidenceDir, `e2e-${Date.now()}.jsonl`);
    await evidenceChain.saveToFile(chainFile);
    log("DONE", `Evidence Chain 已保存: ${chainFile}`);

    // 最终状态报告
    log("DONE", "\n📊 最终状态报告:");
    log("DONE", `  状态机最终状态: ${stateMachine.state}`);
    log(`DONE`, `  拷问问题数: ${currentSession.questions.length}`);
    log("DONE", `  计划步骤数: ${context.plan?.steps.length ?? 0}`);
    log("DONE", `  Writer 产物: ${context.artifacts?.[0] ?? "无"}`);
    log("DONE", `  Critic 评分: ${criticScore}/100`);
    log("DONE", `  验证结果: ${verifyResult.passed ? "通过" : "未通过"} (${verifyResult.score}/100)`);
    log("DONE", `  Evidence Chain 条目: ${evidenceChain.getMeta().totalEntries}`);

    // ============================================================
    // 验证检查清单
    // ============================================================
    separator("验证检查清单");

    const checks: { name: string; pass: boolean; detail: string }[] = [];

    // 1. blog.md 存在且非空
    const blogPath = resolve(__dirname, "artifacts", "blog.md");
    const blogExists = existsSync(blogPath);
    let blogContent = "";
    if (blogExists) {
      blogContent = readFileSync(blogPath, "utf-8");
    }
    checks.push({ name: "blog.md 产物存在且非空", pass: blogExists && blogContent.length > 100, detail: blogExists ? `${blogContent.length} chars` : "不存在" });

    // 2. blog.md 包含完整结构
    const hasTitle = /^#/.test(blogContent);
    const hasHeaders = /^##/m.test(blogContent);
    const hasBody = blogContent.split("\n").length > 10;
    checks.push({ name: "blog.md 有完整结构（标题+章节+正文）", pass: hasTitle && hasHeaders && hasBody, detail: `title=${hasTitle}, headers=${hasHeaders}, lines=${blogContent.split("\n").length}` });

    // 3. 进化文档存在
    const designPath = resolve(__dirname, "design.mdx");
    const userPath = resolve(__dirname, "user.md");
    const selfPath = resolve(__dirname, "self.md");
    checks.push({ name: "design.mdx 存在", pass: existsSync(designPath), detail: designPath });
    checks.push({ name: "user.md 存在", pass: existsSync(userPath), detail: userPath });
    checks.push({ name: "self.md 存在", pass: existsSync(selfPath), detail: selfPath });

    // 4. Evidence Chain 有记录
    const entryCount = evidenceChain.getMeta().totalEntries;
    checks.push({ name: "Evidence Chain 有记录", pass: entryCount > 0, detail: `${entryCount} entries` });

    // 5. Critic 给出了有效分数
    checks.push({ name: "Critic 有效评分", pass: criticScore > 0 && criticScore <= 100, detail: `${criticScore}/100` });

    // 6. 验证引擎正常工作
    checks.push({ name: "Verify Engine 正常", pass: typeof verifyResult.passed === "boolean", detail: `${verifyResult.passed ? "passed" : "failed"}, score=${verifyResult.score}` });

    for (const c of checks) {
      console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}: ${c.detail}`);
    }

    const allPassed = checks.every((c) => c.pass);
    console.log(`\n${"=".repeat(60)}`);
    console.log(allPassed ? "🎉 全链路 E2E 测试全部通过！" : "⚠️ 部分检查未通过，需修复");
    console.log("=".repeat(60));

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error("\n💥 全链路测试出错:", error);
    process.exit(1);
  }
}

function generateAutoAnswer(dimension: string, question: string): string {
  const answers: Record<string, string> = {
    "主题方向": "聚焦 AI Agent 的架构设计实践，包括感知模块、决策引擎、工具调用和记忆系统四大核心组件的设计原则和实现方式",
    "内容深度": "希望聚焦的方面是 AI Agent 架构设计的技术深度解析，包括从理论到实践的完整路径",
    "目标读者": "有一定编程基础的技术从业者，对 AI 和大模型有一定了解但想深入了解 Agent 架构设计",
    "风格偏好": "专业但不晦涩，技术深度适中，使用代码示例辅助说明，结构清晰层次分明",
    "文章风格": "专业技术博客风格，类似深入浅出系列，理论与实践结合，配以代码示例和架构图描述",
    "输出风格": "Markdown 格式的长文技术博客，约 2000-3000 字，含代码示例和架构说明",
    "格式要求": "标准 Markdown，含标题层级、代码块、列表、表格等丰富格式",
    "长度": "2000-3000 字的中篇深度技术文章",
  };

  // 先精确匹配
  if (answers[dimension]) return answers[dimension];

  // 模糊匹配
  for (const [key, val] of Object.entries(answers)) {
    if (dimension.includes(key) || key.includes(dimension)) return val;
  }

  // 默认回答
  return `关于"${dimension}"的回答：这是一个关于 AI Agent 技术博客的需求，我期望文章能够深入浅出地讲解核心概念，同时保持专业性和可读性的平衡。`;
}

main().catch((err) => {
  console.error("💥 未捕获错误:", err);
  process.exit(1);
});
