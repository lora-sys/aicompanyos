import type { LLMProvider } from "../interrogate/types.js";
import type { VerifyInput, VerifyResult, VerifyConfig } from "./types.js";
/**
 * 验证引擎 - 对产物进行文件存在性检查和内容质量审核
 */
export declare class VerifyEngine {
    private llmProvider;
    private config;
    constructor(llmProvider: LLMProvider, config?: Partial<VerifyConfig>);
    /**
     * 执行验证流程
     */
    verify(input: VerifyInput): Promise<VerifyResult>;
    /**
     * 文件存在性检查
     */
    private checkFiles;
    /**
     * LLM 内容质量验证
     * 使用 LLMStructuredOutput 统一提取+验证
     */
    private verifyQuality;
}
//# sourceMappingURL=engine.d.ts.map