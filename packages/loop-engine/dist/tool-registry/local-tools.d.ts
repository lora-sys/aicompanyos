import { ToolCategory, type ToolDefinition, type ToolExecuteRequest, type ToolExecuteResult, type ToolHandler } from "./types.js";
import type { LLMProvider } from "../interrogate/types.js";
declare class LocalToolsHandler implements ToolHandler {
    private llmProvider?;
    category: ToolCategory;
    constructor(llmProvider?: LLMProvider | undefined);
    execute(request: ToolExecuteRequest): Promise<ToolExecuteResult>;
    private handleFileRead;
    private handleFileWrite;
    private handleLLMCall;
}
export declare function createLocalToolsHandler(llmProvider?: LLMProvider): LocalToolsHandler;
export declare function getLocalToolDefinitions(): ToolDefinition[];
export {};
//# sourceMappingURL=local-tools.d.ts.map