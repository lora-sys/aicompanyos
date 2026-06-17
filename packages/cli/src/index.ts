#!/usr/bin/env node
// CLI 入口
// 解析命令行参数，创建并启动 AICOSApp

// 加载 .env 环境变量（必须在其他导入之前）
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const envPath = resolve(process.cwd(), ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env 不存在则跳过（环境变量可能已通过其他方式设置）
}

import { AICOSApp } from "./app.js";

/**
 * CLI 主入口函数
 * 支持的命令行参数：
 *   --help, -h     显示帮助信息
 *   --version, -v  显示版本号
 *   --non-interactive  非交互模式（用于 CI/CD）
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // 解析命令行参数
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log("AI Company OS v0.1.0");
    return;
  }

  // 创建应用实例
  const app = new AICOSApp();

  try {
    // 初始化
    await app.initialize();

    // 启动 TUI
    await app.start();

    // 如果是非交互模式，直接处理传入的任务输入
    const nonInteractiveIndex = args.indexOf("--non-interactive");
    if (nonInteractiveIndex !== -1 && args[nonInteractiveIndex + 1]) {
      const taskInput = args[nonInteractiveIndex + 1];
      await app.submitTask(taskInput);
      app.quit();
      return;
    }

    // 交互模式：监听 stdin 输入
    setupInteractiveInput(app);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ 启动失败: ${message}`);
    process.exit(1);
  }
}

/**
 * 设置交互式输入监听
 * 从 stdin 逐行读取用户输入并分发给 app.handleInput()
 */
async function setupInteractiveInput(app: AICOSApp): Promise<void> {
  // 检查是否在 TTY 环境中
  if (!process.stdin.isTTY) {
    // 非 TTY 环境（如管道输入），读取全部输入后一次性提交
    let input = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      const trimmed = input.trim();
      if (trimmed) {
        app.submitTask(trimmed).finally(() => app.quit());
      } else {
        app.quit();
      }
    });
    return;
  }

  // TTY 环境：逐行交互
  const readline = await createReadlineInterface();
  const prompt = "aicos> ";

  readline.question(prompt, async (answer: string) => {
    await app.handleInput(answer);

    // 继续等待下一次输入（如果应用仍在运行）
    if (process.exitCode === null) {
      // 使用递归保持交互循环
      setImmediate(() => setupInteractiveInput(app));
    }

    readline.close();
  });
}

/**
 * 创建 Readline 接口
 * 动态导入以避免在非交互环境下报错
 */
async function createReadlineInterface() {
  const { createInterface } = await import("node:readline/promises");
  // 兼容旧版 readline API（question 模式）
  const { createInterface: createLegacy } = await import("readline");
  return createLegacy({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * 打印帮助信息
 */
function printHelp(): void {
  const helpText = `
AI Company OS - 智能内容生产与进化平台

用法:
  aicos [选项] [任务描述]

选项:
  -h, --help              显示帮助信息
  -v, --version           显示版本号
  --non-interactive <任务>  非交互模式，直接执行指定任务

示例:
  aicos                                    # 启动交互模式
  aicos "写一篇关于 AI Agent 的技术博客"   # 直接执行任务
  aicos --non-interactive "生成产品文档"    # 非交互模式执行

快捷键:
  Enter    提交/确认
  Esc      跳过当前步骤
  Tab      切换焦点
  q        退出应用

更多文档: https://github.com/aicos/aicompanyos
`;

  console.log(helpText);
}

// 当此文件被直接运行时执行 main
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("index.ts")) {
  main().catch((error) => {
    console.error("未捕获的错误:", error);
    process.exit(1);
  });
}
