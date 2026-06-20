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
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1)
            continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}
catch {
    // .env 不存在则跳过（环境变量可能已通过其他方式设置）
}
import { AICOSApp } from "./app.js";
import { StdinBuffer } from "@earendil-works/pi-tui";
/**
 * CLI 主入口函数
 * 支持的命令行参数：
 *   --help, -h     显示帮助信息
 *   --version, -v  显示版本号
 *   --non-interactive  非交互模式（用于 CI/CD）
 */
export async function main() {
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
        // 如果是非交互模式，跳过 TUI，直接处理任务
        const nonInteractiveIndex = args.indexOf("--non-interactive");
        if (nonInteractiveIndex !== -1 && args[nonInteractiveIndex + 1]) {
            const taskInput = args[nonInteractiveIndex + 1];
            // 非交互模式：直接 await executeLoop（不需要后台运行）
            await app.runNonInteractive(taskInput);
            return;
        }
        // 交互模式：启动 TUI + 监听 stdin 输入
        await app.start();
        setupInteractiveInput(app);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ 启动失败: ${message}`);
        process.exit(1);
    }
}
/**
 * 设置交互式输入监听
 *
 * ★ 双模式统一架构：
 * - TTY 模式：readline 逐行交互（兼容 pi-tui Input 组件）
 * - 管道模式（非 TTY）：StdinBuffer 缓冲 + 行级分发到 handleInput()
 *
 * 两种模式最终都走 app.handleInput()，保证行为一致。
 */
async function setupInteractiveInput(app) {
    // 检查是否在 TTY 环境中
    if (!process.stdin.isTTY) {
        // ★ 非TTY（管道/重定向）模式：读取全部输入后按行分发
        // 修复 Bug: 之前整个 stdin 当成一个字符串 submitTask，
        //        导致 "/type 2\ntopic\nq" 被当成任务内容
        let input = "";
        process.stdin.setEncoding("utf-8");
        // 使用 StdinBuffer 处理原始输入流（处理转义序列等）
        const stdinBuffer = new StdinBuffer({ timeout: 10 });
        process.stdin.on("data", (chunk) => {
            // 先经过 StdinBuffer 处理完整序列
            stdinBuffer.process(typeof chunk === "string" ? chunk : chunk.toString());
            // 同时累积原始文本用于行级解析
            input += typeof chunk === "string" ? chunk : chunk.toString();
        });
        process.stdin.on("end", () => {
            const trimmed = input.trim();
            if (!trimmed) {
                app.quit();
                return;
            }
            // ★ 核心修复：按换行符分割，逐行走 handleInput()（与 TTY 模式同路径）
            const lines = trimmed.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
            console.log(`[CLI] 管道模式: 接收到 ${lines.length} 行输入`);
            // 顺序处理每一行（模拟交互模式的逐行行为）
            (async () => {
                for (const line of lines) {
                    if (!app["running"])
                        break; // 如果已退出则停止
                    await app.handleInput(line);
                }
                // 所有行处理完毕后退出
                app.quit();
            })();
        });
        return;
    }
    // ★★★ TTY 环境：如果 TUIManager 已接管 stdin，不再创建 readline！
    // pi-tui 的 ProcessTerminal.start() 已调用 setRawMode(true) 并注册 data 监听器，
    // 如果同时创建 readline，两者会竞争 stdin 数据，导致：
    // 1. readline close() 恢复 raw mode → pi-tui 无法接收输入
    // 2. readline close() 后事件循环空转 → Node.js 进程退出
    // 3. 两次 handleInput() 调用 → 状态混乱
    if (app.tuiManager?.isInitialized) {
        // pi-tui 已接管输入，不需要 readline
        return;
    }
    // 降级：无 pi-tui 时使用 readline 逐行交互
    const readline = await createReadlineInterface();
    const prompt = "aicos> ";
    readline.question(prompt, async (answer) => {
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
function printHelp() {
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
//# sourceMappingURL=index.js.map