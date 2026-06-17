// 端到端测试脚本
// 加载 .env 并运行 CLI

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 1. 加载 .env 文件
const envPath = resolve(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const eqIdx = line.indexOf("=");
  if (eqIdx > 0) {
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key && !key.startsWith("#")) {
      process.env[key] = value;
    }
  }
}

console.log("=== 环境变量已加载 ===");
console.log(`API_BASE: ${process.env.OPENAI_API_BASE}`);
console.log(`MODEL: ${process.env.OPENAI_MODEL}`);
console.log(`API_KEY: ${process.env.OPENAI_API_KEY?.slice(0, 12)}...`);

// 2. 导入并运行 CLI
const cliPath = resolve(process.cwd(), "packages", "cli", "dist", "index.js");
try {
  const { main } = await import(cliPath);
  console.log("\n=== CLI 模块加载成功，启动 main() ===\n");
  
  // 使用非交互模式运行测试任务
  // 先设置 argv 模拟 --non-interactive 参数
  process.argv = ["node", "index.js", "--non-interactive", "写一篇关于 AI Agent 架构设计的技术博客"];
  
  await main();
} catch (error) {
  console.error("\n=== 运行出错 ===");
  console.error("错误类型:", error.constructor.name);
  console.error("错误消息:", error.message);
  if (error.stack) console.error("堆栈:", error.stack);
  if (error.cause) console.error("原因:", error.cause);
  process.exit(1);
}
