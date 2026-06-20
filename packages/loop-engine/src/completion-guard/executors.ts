/**
 * 内置验证执行器
 *
 * 7 种确定性验证方法的具体实现，按优先级排列：
 * 1. CommandExecutor   — Shell 命令执行
 * 2. TestExecutor      — 测试运行器
 * 3. LintExecutor      — 代码检查
 * 4. BrowserExecutor   — 浏览器 UI 检查
 * 5. FileExistenceExecutor — 文件存在性
 * 6. ContentMatchExecutor  — 内容正则匹配
 * 7. LLMAssertionExecutor  — LLM 断言（最后手段）
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { glob } from "glob"; // ★ P0-3a: 使用成熟 glob 库替代手写实现
import type {
  VerificationMethod,
  VerificationContext,
  EvidenceRecord,
  EvidenceContent,
  CommandVerification,
  TestVerification,
  LintVerification,
  BrowserVerification,
  FileExistenceVerification,
  ContentMatchVerification,
  LLMAssertionVerification,
  CommandEvidence,
  TestEvidence,
  LintEvidence,
  BrowserEvidence,
  FileEvidence,
  ContentMatchEvidence,
  LLMEvidence,
  VerificationExecutor,
} from "./types.js";

const execAsync = promisify(exec);

// ============================================================
// 工具函数
// ============================================================

/** 截断字符串至指定长度 */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + `... (truncated, ${str.length} total chars)` : str;
}

/** 创建通用证据记录 */
function makeEvidenceRecord(
  goalId: string,
  methodType: VerificationMethod["type"],
  passed: boolean,
  evidence: EvidenceContent,
  durationMs: number
): EvidenceRecord {
  return {
    goalId,
    method: methodType,
    timestamp: new Date().toISOString(),
    passed,
    evidence,
    durationMs,
  };
}

// ============================================================
// 1. CommandExecutor — Shell 命令执行
// ============================================================

export class CommandExecutor implements VerificationExecutor {
  readonly methodType = "command" as const;

  async execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord> {
    const cmd = method as CommandVerification;
    const start = Date.now();
    const cwd = cmd.cwd ?? ctx.projectRoot;
    const timeout = cmd.timeoutMs ?? 30000;

    try {
      const { stdout, stderr } = await execAsync(cmd.command, {
        cwd,
        timeout,
        env: { ...process.env, ...ctx.env },
        maxBuffer: 1024 * 1024, // 1MB
      });

      const exitCode = 0; // execAsync throws on non-zero
      const expected = cmd.expectExitCode ?? 0;
      const passed = exitCode === expected;

      return makeEvidenceRecord(
        "", // goalId 由调用方填充
        "command",
        passed,
        {
          type: "command",
          command: cmd.command,
          exitCode,
          stdout: truncate(stdout, 10000),
          stderr: truncate(stderr, 10000),
        } satisfies CommandEvidence,
        Date.now() - start
      );
    } catch (error: unknown) {
      const err = error as { code?: string; signal?: string; stdout?: string; stderr?: string; message: string };
      const exitCode = err.code === null ? 1 : (err.code ? parseInt(err.code, 10) : 1);
      const expected = cmd.expectExitCode ?? 0;
      const passed = exitCode === expected;

      return makeEvidenceRecord(
        "",
        "command",
        passed,
        {
          type: "command",
          command: cmd.command,
          exitCode,
          stdout: truncate(err.stdout ?? "", 10000),
          stderr: truncate(err.stderr ?? err.message, 10000),
        } satisfies CommandEvidence,
        Date.now() - start
      );
    }
  }
}

// ============================================================
// 2. TestExecutor — 测试运行器
// ============================================================

export class TestExecutor implements VerificationExecutor {
  readonly methodType = "test" as const;

  async execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord> {
    const cfg = method as TestVerification;
    const start = Date.now();
    const runner = cfg.runner ?? "npx vitest run --reporter=json";
    const timeout = cfg.timeoutMs ?? 60000;

    try {
      const { stdout, stderr } = await execAsync(runner, {
        cwd: ctx.projectRoot,
        timeout,
        maxBuffer: 5 * 1024 * 1024, // 5MB for JSON output
        env: { ...process.env, ...ctx.env },
      });

      let totalTests = 0;
      let passedTests = 0;
      let failedTests = 0;
      const failedTestNames: string[] = [];

      try {
        // 尝试解析 vitest JSON 输出
        const jsonStart = stdout.indexOf("[");
        if (jsonStart !== -1) {
          const jsonStr = stdout.slice(jsonStart);
          const result = JSON.parse(jsonStr);
          if (result?.testResults) {
            for (const suite of result.testResults) {
              totalTests += suite.assertionResults?.length ?? 0;
              for (const assert of suite.assertionResults ?? []) {
                if (assert.status === "passed") passedTests++;
                else { failedTests++; failedTestNames.push(assert.ancestorTitles?.concat(assert.name).join(" > ") ?? assert.name); }
              }
            }
          }
        }
      } catch {
        // JSON 解析失败，从文本中提取关键信息
        const lines = stderr.split("\n");
        for (const line of lines) {
          const passMatch = line.match(/(\d+)\s*(?:pass|passed)/i);
          const failMatch = line.match(/(\d+)\s*(?:fail|failed)/i);
          const testMatch = line.match(/(\d+)\s*(?:test|tests?)/i);
          if (passMatch) passedTests = parseInt(passMatch[1], 10);
          if (failMatch) failedTests = parseInt(failMatch[1], 10);
          if (testMatch && !passMatch && !failMatch) totalTests = parseInt(testMatch[1], 10);
        }
        totalTests = totalTests || (passedTests + failedTests);
      }

      return makeEvidenceRecord(
        "",
        "test",
        failedTests === 0,
        {
          type: "test",
          runner,
          totalTests,
          passedTests,
          failedTests,
          failedTestNames,
        } satisfies TestEvidence,
        Date.now() - start
      );
    } catch (error: unknown) {
      const err = error as Error;
      return makeEvidenceRecord(
        "",
        "test",
        false,
        {
          type: "test",
          runner,
          totalTests: 0,
          passedTests: 0,
          failedTests: 1,
          failedTestNames: [`Execution error: ${err.message}`],
        } satisfies TestEvidence,
        Date.now() - start
      );
    }
  }
}

// ============================================================
// 3. LintExecutor — 代码检查
// ============================================================

export class LintExecutor implements VerificationExecutor {
  readonly methodType = "lint" as const;

  async execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord> {
    const cfg = method as LintVerification;
    const start = Date.now();
    const target = cfg.target ?? ".";
    const baseCmd = `${cfg.tool} ${target} --format=json`;

    try {
      const { stdout, stderr } = await execAsync(baseCmd, {
        cwd: ctx.projectRoot,
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, ...ctx.env },
      });

      let errors = 0;
      let warnings = 0;
      const issues: Array<{ file: string; line: number; rule: string; message: string }> = [];

      try {
        const results = JSON.parse(stdout);
        const files = Array.isArray(results) ? results : [results];
        for (const file of files) {
          for (const msg of file.messages ?? []) {
            const issue = {
              file: file.filePath ?? "unknown",
              line: msg.line ?? 0,
              rule: msg.ruleId ?? "unknown",
              message: msg.message,
            };
            issues.push(issue);
            if (msg.severity === 2) errors++;
            else warnings++;
          }
        }
      } catch {
        // 非 JSON 输出，尝试从文本提取
        const lines = (stdout + stderr).split("\n");
        for (const line of lines) {
          const errMatch = line.match(/(\d+)\s*(?:error|problem)/i);
          const warnMatch = line.match(/(\d+)\s*warning/i);
          if (errMatch) errors += parseInt(errMatch[1], 10);
          if (warnMatch) warnings += parseInt(warnMatch[1], 10);
        }
      }

      const failOnWarning = cfg.failOnWarning ?? false;
      const passed = errors === 0 && (!failOnWarning || warnings === 0);

      return makeEvidenceRecord(
        "",
        "lint",
        passed,
        {
          type: "lint",
          tool: cfg.tool,
          errors,
          warnings,
          issues: issues.slice(0, 20),
        } satisfies LintEvidence,
        Date.now() - start
      );
    } catch (error: unknown) {
      const err = error as Error;
      return makeEvidenceRecord(
        "",
        "lint",
        false,
        {
          type: "lint",
          tool: cfg.tool,
          errors: 1,
          warnings: 0,
          issues: [{ file: "execution", line: 0, rule: "exec", message: err.message }],
        } satisfies LintEvidence,
        Date.now() - start
      );
    }
  }
}

// ============================================================
// 4. BrowserExecutor — 浏览器 UI 检查（P1-1: Playwright 接入）
// ============================================================

/**
 * 浏览器验证执行器
 *
 * 实现策略：
 * 1. 优先使用 Playwright（需安装 @playwright/test 或 playwright）
 * 2. 如果 Playwright 不可用，尝试使用 MCP browser tools
 * 3. 都不可用时优雅降级为 skip（标记跳过而非 fail）
 */
export class BrowserExecutor implements VerificationExecutor {
  readonly methodType = "browser_check" as const;

  /** 缓存的 Playwright 实例（懒加载） */
  private playwright: any = null;
  private playwrightLoadError: string | null = null;

  /** 尝试加载 Playwright（可选依赖，不安装时优雅降级） */
  private async tryLoadPlaywright(): Promise<any> {
    if (this.playwright) return this.playwright;
    if (this.playwrightLoadError) return null;

    try {
      // 动态导入 — playwright 是 optionalDependency，未安装时 catch 降级
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pw = await import("playwright").catch(() => null)
        ?? await (async () => { try { const m = await import("@playwright/test"); return m.chromium; } catch { return null; } })();

      if (!pw) {
        this.playwrightLoadError = "playwright or @playwright/test not installed";
        return null;
      }

      this.playwright = pw;
      return pw;
    } catch (e) {
      this.playwrightLoadError = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async execute(method: VerificationMethod, _ctx: VerificationContext): Promise<EvidenceRecord> {
    const cfg = method as BrowserVerification;
    const start = Date.now();

    // 尝试使用 Playwright 执行浏览器检查
    const pw = await this.tryLoadPlaywright();

    if (!pw) {
      // Playwright 不可用 → 降级：返回 skip 状态而非 fail
      return makeEvidenceRecord(
        "",
        "browser_check",
        false, // 未通过（因为没有实际验证）
        {
          type: "browser_check",
          url: cfg.url,
          assertions: (cfg.selectorExists ?? []).map((sel) => ({
            selector: sel,
            exists: false,
          })),
          consoleErrors: [
            `BrowserExecutor: ${this.playwrightLoadError ?? "No browser runtime available"}`,
            "Install 'playwright' or '@playwright/test' for full browser verification support",
          ],
        } satisfies BrowserEvidence,
        Date.now() - start
      );
    }

    // 使用 Playwright 执行真实浏览器检查
    try {
      const chromium = pw.chromium ?? pw;
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // 收集 console 错误
      const consoleErrors: string[] = [];
      page.on("console", (msg: { type: () => string; text: () => string }) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      // 导航到目标 URL
      const response = await page.goto(cfg.url, { waitUntil: "networkidle", timeout: 30000 });

      // DOM 选择器断言
      const assertions: Array<{ selector: string; exists: boolean }> = [];
      if (cfg.selectorExists && cfg.selectorExists.length > 0) {
        for (const selector of cfg.selectorExists) {
          try {
            const element = await page.$(selector);
            assertions.push({ selector, exists: !!element });
          } catch {
            assertions.push({ selector, exists: false });
          }
        }
      } else {
        // 没有指定选择器 → 仅检查页面是否成功加载
        assertions.push({
          selector: "[page-load]",
          exists: response?.ok() ?? true,
        });
      }

      // 自定义 JS 断言（如果有）
      if (cfg.customAssertion) {
        try {
          const result = await page.evaluate(cfg.customAssertion);
          assertions.push({
            selector: `[custom:${cfg.customAssertion.slice(0, 50)}]`,
            exists: !!result,
          });
        } catch (e) {
          consoleErrors.push(`Custom assertion error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // 截图（可选）
      let screenshot: string | undefined;
      try {
        const buffer = await page.screenshot({ type: "png", fullPage: true });
        screenshot = buffer.toString("base64").slice(0, 500) + "... (truncated)";
      } catch {
        // 截图失败不影响主流程
      }

      await browser.close();

      // 判定结果：所有断言都通过才算 passed
      const allPassed = assertions.every((a) => a.exists);
      const hasConsoleErrors = consoleErrors.length > 0;

      return makeEvidenceRecord(
        "",
        "browser_check",
        allPassed && !hasConsoleErrors,
        {
          type: "browser_check",
          url: cfg.url,
          screenshot,
          assertions,
          consoleErrors: hasConsoleErrors ? consoleErrors : undefined,
        } satisfies BrowserEvidence,
        Date.now() - start
      );
    } catch (error) {
      const err = error as Error;
      return makeEvidenceRecord(
        "",
        "browser_check",
        false,
        {
          type: "browser_check",
          url: cfg.url,
          assertions: [],
          consoleErrors: [`Browser execution error: ${err.message}`],
        } satisfies BrowserEvidence,
        Date.now() - start
      );
    }
  }
}

// ============================================================
// 5. FileExistenceExecutor — 文件存在性
// ============================================================

export class FileExistenceExecutor implements VerificationExecutor {
  readonly methodType = "file_exists" as const;

  async execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord> {
    const cfg = method as FileExistenceVerification;
    const start = Date.now();

    try {
      // 使用 Node.js 内置的递归 readdir（Node 18+）+ 简易模式匹配
      const matchedPaths = await this.globSearch(cfg.path, ctx.projectRoot);

      // 过滤最小文件大小
      const filteredPaths: string[] = [];
      let fileSize: number | undefined;
      for (const p of matchedPaths) {
        try {
          const s = await stat(p);
          if (cfg.minSizeBytes === undefined || s.size >= cfg.minSizeBytes) {
            filteredPaths.push(relative(ctx.projectRoot, p));
            fileSize = s.size;
          }
        } catch {
          // stat 失败的文件跳过
        }
      }

      const passed = filteredPaths.length > 0;

      return makeEvidenceRecord(
        "",
        "file_exists",
        passed,
        {
          type: "file_exists",
          matchedPaths: filteredPaths,
          fileSize,
        } satisfies FileEvidence,
        Date.now() - start
      );
    } catch (error: unknown) {
      const err = error as Error;
      return makeEvidenceRecord(
        "",
        "file_exists",
        false,
        {
          type: "file_exists",
          matchedPaths: [],
        } satisfies FileEvidence,
        Date.now() - start
      );
    }
  }

  /** 使用 glob 库进行文件搜索（支持完整 glob 语法） */
  private async globSearch(pattern: string, root: string): Promise<string[]> {
    try {
      const matches = await glob(pattern, {
        cwd: root,
        absolute: true,
        nodir: true, // 只匹配文件，不匹配目录
      });
      return matches;
    } catch {
      // glob 执行失败（模式无效等），尝试直接检查文件
      const fullPath = join(root, pattern);
      try {
        await stat(fullPath);
        return [fullPath];
      } catch {
        return [];
      }
    }
  }
}

// ============================================================
// 6. ContentMatchExecutor — 内容正则匹配
// ============================================================

export class ContentMatchExecutor implements VerificationExecutor {
  readonly methodType = "content_match" as const;

  async execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord> {
    const cfg = method as ContentMatchVerification;
    const start = Date.now();
    const pattern = typeof cfg.pattern === "string" ? new RegExp(cfg.pattern) : cfg.pattern;
    const antiPattern = cfg.antiPattern
      ? (typeof cfg.antiPattern === "string" ? new RegExp(cfg.antiPattern) : cfg.antiPattern)
      : undefined;

    try {
      // ★ 支持 glob 模式 target（如 "**/*.md"）
      const isGlob = /[*?[{]/.test(cfg.target);
      let filePaths: string[];

      if (isGlob) {
        const matches = await glob(cfg.target, {
          cwd: ctx.projectRoot,
          absolute: true,
          nodir: true,
        });
        filePaths = matches;
      } else {
        filePaths = [join(ctx.projectRoot, cfg.target)];
      }

      const allMatchedLines: Array<{ file: string; line: number; content: string }> = [];
      let allContent = "";

      for (const fp of filePaths) {
        try {
          const content = await readFile(fp, "utf-8");
          allContent += content + "\n";
          const lines = content.split("\n");
          const relPath = relative(ctx.projectRoot, fp);

          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              allMatchedLines.push({
                file: relPath,
                line: i + 1,
                content: truncate(lines[i], 200),
              });
            }
          }
        } catch {
          // 单个文件读取失败不中断整个验证
        }
      }

      let antiPatternMatched = false;
      if (antiPattern) {
        antiPatternMatched = antiPattern.test(allContent);
      }

      const passed = allMatchedLines.length > 0 && !antiPatternMatched;

      return makeEvidenceRecord(
        "",
        "content_match",
        passed,
        {
          type: "content_match",
          matchedLines: allMatchedLines,
          antiPatternMatched,
        } satisfies ContentMatchEvidence,
        Date.now() - start
      );
    } catch (error: unknown) {
      const err = error as Error;
      return makeEvidenceRecord(
        "",
        "content_match",
        false,
        {
          type: "content_match",
          matchedLines: [],
          antiPatternMatched: false,
        } satisfies ContentMatchEvidence,
        Date.now() - start
      );
    }
  }
}

// ============================================================
// 7. LLMAssertionExecutor — LLM 断言（占位实现）
// ============================================================

/**
 * LLM 断言验证执行器（最后手段）
 *
 * 注意：LLMProvider 通过构造时注入，或通过 context 传递。
 * 当前为占位实现，需要与 loop-engine 的 LLMProvider 对接。
 */
export class LLMAssertionExecutor implements VerificationExecutor {
  readonly methodType = "llm_assertion" as const;

  private llmProvider?: (prompt: string) => Promise<string>;

  constructor(llmProvider?: (prompt: string) => Promise<string>) {
    this.llmProvider = llmProvider;
  }

  async execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord> {
    const cfg = method as LLMAssertionVerification;
    const start = Date.now();

    if (!this.llmProvider) {
      return makeEvidenceRecord(
        "",
        "llm_assertion",
        false,
        {
          type: "llm_assertion",
          model: "not-configured",
          judgement: "fail",
          reasoning: "LLMAssertionExecutor: no LLM provider configured",
          confidence: 0,
        } satisfies LLMEvidence,
        Date.now() - start
      );
    }

    try {
      let fileContent = "";
      if (cfg.targetFiles) {
        const targetPath = join(ctx.projectRoot, cfg.targetFiles);
        fileContent = await readFile(targetPath, "utf-8").catch(() => "(file not found)");
      }

      const prompt = [
        cfg.contextPrompt ?? "You are a strict code reviewer.",
        "",
        `Claim to verify: ${cfg.claim}`,
        fileContent ? `\nFile content:\n\`\`\`\n${truncate(fileContent, 8000)}\n\`\`\`` : "",
        "",
        `Respond ONLY with JSON: {"judgement": "pass|fail", "reasoning": "...", "confidence": 0.0-1.0}`,
      ].join("\n");

      const response = await this.llmProvider(prompt);
      const parsed = JSON.parse(response);

      return makeEvidenceRecord(
        "",
        "llm_assertion",
        parsed.judgement === "pass" && (parsed.confidence ?? 0) >= 0.7,
        {
          type: "llm_assertion",
          model: "llm-provider",
          judgement: parsed.judgement ?? "fail",
          reasoning: parsed.reasoning ?? "no reasoning provided",
          confidence: parsed.confidence ?? 0,
        } satisfies LLMEvidence,
        Date.now() - start
      );
    } catch (error: unknown) {
      const err = error as Error;
      return makeEvidenceRecord(
        "",
        "llm_assertion",
        false,
        {
          type: "llm_assertion",
          model: "llm-provider",
          judgement: "fail",
          reasoning: `LLM assertion execution error: ${err.message}`,
          confidence: 0,
        } satisfies LLMEvidence,
        Date.now() - start
      );
    }
  }
}
