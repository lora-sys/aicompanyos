// 直接测试 PiAILLMProvider
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 加载 .env
const envPath = resolve(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const eqIdx = line.indexOf("=");
  if (eqIdx > 0) {
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key && !key.startsWith("#")) process.env[key] = value;
  }
}

console.log("=== 测试 PiAILLMProvider ===\n");

try {
  const { PiAILLMProvider } = await import(
    resolve(process.cwd(), "packages", "loop-engine", "dist", "index.js")
  );
  
  console.log("1. 创建 Provider...");
  const provider = PiAILLMProvider.fromEnvSync();
  
  console.log("2. 初始化 Provider...");
  await provider.init();
  
  console.log("3. 发送测试请求...");
  const response = await provider.chat([
    { role: "system", content: "你是一个有用的助手。" },
    { role: "user", content: "说'你好，测试成功！'" },
  ]);
  
  console.log("\n=== LLM 响应 ===");
  console.log(response.slice(0, 500));
  console.log("\n✅ 测试通过！");
} catch (error) {
  console.error("\n❌ 测试失败:");
  console.error("类型:", error.constructor.name);
  console.error("消息:", error.message);
  if (error.cause) console.error("原因:", error.cause);
  if (error.stack) console.error("\n堆栈:", error.stack);
  process.exit(1);
}
