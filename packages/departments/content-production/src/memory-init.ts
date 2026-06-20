/**
 * 内容产出部 — 记忆初始化脚本
 *
 * 将部门内置的 memory 种子文件（design.mdx / self.jsonl / user.jsonl）
 * 复制到项目运行时目录，供 EvolutionDocsManager 使用。
 *
 * 文件布局：
 *   projectRoot/
 *     design.mdx          ← EvolutionDocsManager 读取位置（项目根目录）
 *     memory/
 *       self.jsonl        ← EvolutionDocsManager JSONL 日志位置
 *       user.jsonl        ← EvolutionDocsManager JSONL 日志位置
 *
 * 策略：append-only — 如果目标文件已存在，不覆盖。
 */
import { readFileSync, existsSync, mkdirSync, copyFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 包内 memory 目录（相对于本文件的路径）
const PACKAGE_MEMORY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "memory");

/** 初始化结果 */
export interface MemoryInitResult {
  designMDX: boolean;
  selfJSONL: boolean;
  userJSONL: boolean;
}

/**
 * 初始化内容产出部的记忆文件到项目根目录
 *
 * @param projectRoot 项目根目录绝对路径（如 /path/to/my-project）
 * @returns 各文件的初始化状态（true = 已写入/已存在，false = 写入失败）
 */
export async function initDepartmentMemory(
  projectRoot: string,
): Promise<MemoryInitResult> {
  const targetMemoryDir = join(projectRoot, "memory");

  // 确保目标 memory/ 目录存在
  if (!existsSync(targetMemoryDir)) {
    mkdirSync(targetMemoryDir, { recursive: true });
  }

  const result: MemoryInitResult = {
    // ★ design.mdx 放在项目根目录（EvolutionDocsManager 通过 "../design.mdx" 读取）
    designMDX: await safeCopyOrSkip(
      join(PACKAGE_MEMORY_DIR, "design.mdx"),
      join(projectRoot, "design.mdx"),
    ),
    // self.jsonl / user.jsonl 放在 memory/ 子目录
    selfJSONL: await safeAppendOrSkip(
      join(PACKAGE_MEMORY_DIR, "self.jsonl"),
      join(targetMemoryDir, "self.jsonl"),
    ),
    userJSONL: await safeAppendOrSkip(
      join(PACKAGE_MEMORY_DIR, "user.jsonl"),
      join(targetMemoryDir, "user.jsonl"),
    ),
  };

  return result;
}

/**
 * 安全复制：目标不存在时复制，已存在则跳过（返回 true 表示目标可用）
 */
async function safeCopyOrSkip(srcPath: string, destPath: string): Promise<boolean> {
  try {
    if (!existsSync(srcPath)) {
      return false;
    }
    if (existsSync(destPath)) {
      // 目标已存在，跳过（append-only 策略）
      return true;
    }
    // 确保父目录存在
    const destDir = dirname(destPath);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    copyFileSync(srcPath, destPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 安全追加：目标不存在时复制，已存在则跳过（返回 true 表示目标可用）
 * JSONL 文件使用追加策略，但初始种子只写入一次
 */
async function safeAppendOrSkip(srcPath: string, destPath: string): Promise<boolean> {
  try {
    if (!existsSync(srcPath)) {
      return false;
    }
    if (existsSync(destPath)) {
      // 目标已存在，跳过（append-only 策略，不重复写入种子数据）
      return true;
    }
    copyFileSync(srcPath, destPath);
    return true;
  } catch {
    return false;
  }
}
