export class GenericAgent {
    systemPrompt;
    llmProvider;
    constructor(config) {
        this.systemPrompt = config.systemPrompt;
        this.llmProvider = config.llmProvider;
    }
    async execute(params) {
        const { step, previousOutputs } = params;
        const contextParts = [];
        const deps = step.dependsOn ?? [];
        for (const depId of deps) {
            const dep = previousOutputs[depId];
            if (dep?.content) {
                contextParts.push(`## 上游产物 (${depId})\n${dep.content.slice(0, 2000)}`);
            }
        }
        const userPrompt = [
            `## 当前任务\n${step.description}`,
            ...(contextParts.length > 0 ? ["\n" + contextParts.join("\n\n")] : []),
            "\n请直接输出你的产出内容。",
        ].join("\n");
        const content = await this.llmProvider.chat([
            { role: "system", content: this.systemPrompt },
            { role: "user", content: userPrompt },
        ]);
        return { content, role: step.agentType };
    }
}
//# sourceMappingURL=generic-agent.js.map