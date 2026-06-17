export declare enum ToolCategory {
    LOCAL = "local",
    MCP = "mcp",
    SKILL = "skill"
}
export interface ToolDefinition {
    name: string;
    category: ToolCategory;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, {
            type: string;
            description: string;
            required?: boolean;
        }>;
        required?: string[];
    };
    mcpServerName?: string;
    mcpOriginalName?: string;
}
export interface ToolExecuteRequest {
    toolName: string;
    params: Record<string, unknown>;
    callerAgent: string;
    taskId: string;
}
export interface ToolExecuteResult {
    success: boolean;
    data: unknown;
    error?: string;
    durationMs: number;
}
export interface ToolHandler {
    category: ToolCategory;
    execute(request: ToolExecuteRequest): Promise<ToolExecuteResult>;
}
//# sourceMappingURL=types.d.ts.map