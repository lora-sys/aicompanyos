/**
 * 可选依赖类型声明
 *
 * 这些模块不是必须的依赖，但运行时如果安装了会自动启用对应功能：
 * - playwright: BrowserExecutor 的真实浏览器验证
 * - @playwright/test: 备选 Playwright 入口
 */

declare module "playwright" {
  export const chromium: {
    launch(options?: { headless?: boolean }): Promise<{
      newPage(): Promise<{
        goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<{ ok(): boolean } | null>;
        $(selector: string): Promise<unknown>;
        screenshot(options?: { type?: string; fullPage?: boolean }): Promise<Buffer>;
        on(event: string, handler: (msg: { type(): string; text(): string }) => void): void;
        evaluate(expression: string): Promise<unknown>;
        close(): Promise<void>;
      }>;
      close(): Promise<void>;
    }>;
  };
}

declare module "@playwright/test" {
  export const chromium: unknown;
}
