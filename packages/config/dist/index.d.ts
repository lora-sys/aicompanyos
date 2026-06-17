export interface MCPServer {
    url: string;
    [key: string]: unknown;
}
export interface LoopConfig {
    maxRetries: number;
    consensusRounds: number;
    consensusThreshold: number;
}
export interface EvolutionConfig {
    autoEvolve: boolean;
    deepEvolveThreshold: number;
}
export interface AICOSConfig {
    mcpServers: Record<string, MCPServer>;
    loop: LoopConfig;
    evolution: EvolutionConfig;
}
//# sourceMappingURL=index.d.ts.map