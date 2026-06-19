/**
 * 集成测试套件 2: VerificationPipeline + 真实命令执行
 *
 * 验证：各 Executor 使用真实的文件系统和 shell 命令
 * - CommandExecutor: 执行 echo, ls 等真实命令
 * - FileExistenceExecutor: 检查项目中的真实文件
 * - ContentMatchExecutor: 匹配真实文件内容
 */

import { describe, it, expect, beforeAll } from "vitest";
import { VerificationPipeline } from "../src/completion-guard/pipeline.js";
import type { VerificationContext, VerificationMethod } from "../src/completion-guard/types.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ============================================================
// 测试环境准备
// ============================================================

const testDir = join(tmpdir(), `aicos-test-${Date.now()}`);
const ctx: VerificationContext = { projectRoot: testDir };

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
  // 创建测试文件
  writeFileSync(join(testDir, "hello.txt"), "Hello World\nThis is a test file\n");
  writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "test-project", version: "1.0.0" }, null, 2));
  mkdirSync(join(testDir, "src"), { recursive: true });
  writeFileSync(join(testDir, "src", "index.ts"), "// Main entry\nexport function main() {\n  console.log('hello');\n}\n");
});

afterAll(() => {
  try { rmSync(testDir, { recursive: true }); } catch { /* cleanup best effort */ }
});

describe("集成测试 2: Pipeline 真实命令执行", () => {

  it("CommandExecutor: echo 命令应通过", async () => {
    const pipeline = new VerificationPipeline();
    const result = await pipeline.execute(
      { type: "command", command: "echo hello" },
      ctx
    );

    expect(result.passed).toBe(true);
    expect(result.evidence.type).toBe("command");
    expect((result.evidence as any).exitCode).toBe(0);
    expect((result.evidence as any).stdout).toContain("hello");
  });

  it("CommandExecutor: 不存在的命令应失败（非零退出码）", async () => {
    const pipeline = new VerificationPipeline();
    const result = await pipeline.execute(
      { type: "command", command: "this-command-does-not-exist-xyz" },
      ctx
    );

    expect(result.passed).toBe(false);
    expect(result.evidence.type).toBe("command");
  });

  it("FileExistenceExecutor: 存在的文件应通过", async () => {
    const pipeline = new VerificationPipeline();
    const result = await pipeline.execute(
      { type: "file_exists", path: "package.json" },
      ctx
    );

    expect(result.passed).toBe(true);
    expect(result.evidence.type).toBe("file_exists");
    expect((result.evidence as any).matchedPaths.length).toBeGreaterThanOrEqual(1);
  });

  it("FileExistenceExecutor: 不存在的文件应失败", async () => {
    const pipeline = new VerificationPipeline();
    const result = await pipeline.execute(
      { type: "file_exists", path: "non-existent-file-xyz.json" },
      ctx
    );

    expect(result.passed).toBe(false);
    expect(result.evidence.type).toBe("file_exists");
    expect((result.evidence as any).matchedPaths.length).toBe(0);
  });

  it("FileExistenceExecutor: glob 模式匹配多个文件", async () => {
    const pipeline = new VerificationPipeline();
    const result = await pipeline.execute(
      { type: "file_exists", path: "**/*.ts" },
      ctx
    );

    expect(result.passed).toBe(true); // src/index.ts 存在
    expect((result.evidence as any).matchedPaths.some((p: string) => p.endsWith(".ts"))).toBe(true);
  });

  it("ContentMatchExecutor: 匹配文件中存在的内容", async () => {
    const pipeline = new VerificationPipeline();
    const result = await pipeline.execute(
      {
        type: "content_match",
        target: "package.json",
        pattern: /name/,
      },
      ctx
    );

    expect(result.passed).toBe(true);
    expect(result.evidence.type).toBe("content_match");
    expect((result.evidence as any).matchedLines.length).toBeGreaterThan(0);
  });

  it("ContentMatchExecutor: 反模式检测 — 文件包含不应有的内容", async () => {
    const pipeline = new VerificationPipeline();
    // package.json 包含 "name"，但不应包含 "FORBIDDEN_TOKEN"
    const result = await pipeline.execute(
      {
        type: "content_match",
        target: "package.json",
        pattern: /name/,
        antiPattern: /FORBIDDEN_TOKEN/,
      },
      ctx
    );

    expect(result.passed).toBe(true); // 有正匹配且无反匹配
    expect((result.evidence as any).antiPatternMatched).toBe(false);
  });

  it("ContentMatchExecutor: 正模式不匹配时应失败", async () => {
    const pipeline = new VerificationPipeline();
    const result = await pipeline.execute(
      {
        type: "content_match",
        target: "hello.txt",
        pattern: /NEVER_APPEARS_IN_THIS_FILE/,
      },
      ctx
    );

    expect(result.passed).toBe(false);
    expect(result.evidence.type).toBe("content_match");
    expect((result.evidence as any).matchedLines.length).toBe(0);
  });

  it("Pipeline 并发执行多个验证", async () => {
    const pipeline = new VerificationPipeline();
    const methods: VerificationMethod[] = [
      { type: "command", command: "echo test-1" },
      { type: "file_exists", path: "package.json" },
      { type: "content_match", target: "hello.txt", pattern: /Hello/ },
    ];

    const results = await pipeline.executeParallel(methods, 3, ctx);

    expect(results).toHaveLength(3);
    // 所有都应该通过
    for (const r of results) {
      expect(r.passed).toBe(true);
    }
  });
});
