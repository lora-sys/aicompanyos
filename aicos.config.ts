// aicos.config.ts
import type { AICOSConfig } from "@aicos/config";

const config: AICOSConfig = {
  mcpServers: {
    exa: {
      url: "https://mcp.exa.ai/mcp",
    },
    // 可扩展更多 MCP Server
  },
  loop: {
    maxRetries: 3,
    consensusRounds: 3,
    consensusThreshold: 75,
  },
  evolution: {
    autoEvolve: true,
    deepEvolveThreshold: 2,
  },
};

export default config;
