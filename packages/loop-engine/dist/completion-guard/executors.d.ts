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
import type { VerificationMethod, VerificationContext, EvidenceRecord, VerificationExecutor } from "./types.js";
export declare class CommandExecutor implements VerificationExecutor {
    readonly methodType: "command";
    execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord>;
}
export declare class TestExecutor implements VerificationExecutor {
    readonly methodType: "test";
    execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord>;
}
export declare class LintExecutor implements VerificationExecutor {
    readonly methodType: "lint";
    execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord>;
}
/**
 * 浏览器验证执行器
 *
 * 实现策略：
 * 1. 优先使用 Playwright（需安装 @playwright/test 或 playwright）
 * 2. 如果 Playwright 不可用，尝试使用 MCP browser tools
 * 3. 都不可用时优雅降级为 skip（标记跳过而非 fail）
 */
export declare class BrowserExecutor implements VerificationExecutor {
    readonly methodType: "browser_check";
    /** 缓存的 Playwright 实例（懒加载） */
    private playwright;
    private playwrightLoadError;
    /** 尝试加载 Playwright（可选依赖，不安装时优雅降级） */
    private tryLoadPlaywright;
    execute(method: VerificationMethod, _ctx: VerificationContext): Promise<EvidenceRecord>;
}
export declare class FileExistenceExecutor implements VerificationExecutor {
    readonly methodType: "file_exists";
    execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord>;
    /** 使用 glob 库进行文件搜索（支持完整 glob 语法） */
    private globSearch;
}
export declare class ContentMatchExecutor implements VerificationExecutor {
    readonly methodType: "content_match";
    execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord>;
}
/**
 * LLM 断言验证执行器（最后手段）
 *
 * 注意：LLMProvider 通过构造时注入，或通过 context 传递。
 * 当前为占位实现，需要与 loop-engine 的 LLMProvider 对接。
 */
export declare class LLMAssertionExecutor implements VerificationExecutor {
    readonly methodType: "llm_assertion";
    private llmProvider?;
    constructor(llmProvider?: (prompt: string) => Promise<string>);
    execute(method: VerificationMethod, ctx: VerificationContext): Promise<EvidenceRecord>;
}
//# sourceMappingURL=executors.d.ts.map