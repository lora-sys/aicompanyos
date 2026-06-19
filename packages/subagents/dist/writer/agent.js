// Writer Agent 实现
// 内容写手，负责高质量内容生成
import { UIUXProMaxSkill } from "../ui-ux-pro-max/skill.js";
export class WriterAgent {
    tools;
    llmProvider;
    static AGENT_TYPE = "writer";
    static SYSTEM_PROMPT = `你是一个专业的内容创作者。你的任务是高质量地完成写作任务。

写作原则：
1. 严格遵循用户的需求和偏好
2. 参考 UI/UX 设计指导来决定内容的呈现风格
3. 使用工具搜集必要的参考资料
4. 输出结构化的 Markdown 内容
5. 保持内容准确、有价值、易读

**【硬性篇幅约束 — 违反将导致审核不通过】**
- 目标输出 2500-3500 字（中文，约 10000-14000 字符），绝对禁止超过 15000 字符
- 每个章节控制在 300-500 字以内
- 代码示例每个不超过 40 行，总计不超过 3 个代码块
- 如果内容较长，必须删减而非扩充：删除冗余解释、合并相似段落、精简过渡句
- 宁可深度聚焦核心主题（3-4 个要点深入展开），也不要面面俱到导致篇幅失控
- 输出前自查：总字数是否在目标范围内？如超限，立即删减至合规

**【主题约束 — 违反将导致审核不通过】**
- 必须紧密围绕用户的原始任务主题展开，禁止偏题到其他技术领域
- 如果用户要求写"AI Agent 架构"，就不能写"RAG"或"LLM推理优化"
- 每个章节的内容都必须与任务主题直接相关
- 代码示例的技术栈必须与任务主题匹配

**代码示例语言规范：**
- 代码示例默认使用 TypeScript / JavaScript，与项目技术栈保持一致
- 仅当用户明确指定其他编程语言时，才使用该语言编写示例
- 即使引用第三方库的官方文档是 Python 示例，也应将其转写为 TypeScript 等价实现`;
    customSystemPrompt;
    constructor(tools, llmProvider, customSystemPrompt) {
        this.tools = tools;
        this.llmProvider = llmProvider;
        // 防御性检查：确保 llmProvider 已正确传入
        if (!llmProvider) {
            throw new Error("WriterAgent 构造失败：llmProvider 参数不能为空");
        }
        this.customSystemPrompt = customSystemPrompt;
    }
    /**
     * 设置自定义 System Prompt（运行时动态切换 Writer 风格）
     * @param prompt 自定义 system prompt 内容
     */
    setCustomSystemPrompt(prompt) {
        this.customSystemPrompt = prompt;
    }
    // 实现 AgentExecutor 接口
    async execute(params) {
        // #2.4 类型安全：context 现在是 StandardAgentContext，无需 as cast
        const selfExperience = params.context.selfExperience;
        const lengthConstraint = this.extractLengthConstraint(selfExperience);
        // 检测用户在拷问阶段指定的编程语言偏好
        const userLangPreference = this.detectLanguagePreference(params.context.interrogationResults);
        // === Loop Engineering: 从 extensions 中提取 Critic 反馈 ===
        const criticFeedback = params.context.extensions?.criticFeedback;
        const rewriteRound = params.context.extensions?.rewriteRound;
        const input = {
            taskId: params.context.taskId,
            planStep: {
                stepId: params.step.stepId,
                description: params.step.description,
                expectedOutput: params.step.expectedOutput,
                toolsNeeded: params.step.toolsNeeded,
            },
            context: {
                interrogationResults: params.context.interrogationResults ?? {},
                userPreferences: params.context.userPreferences,
                designMDX: params.context.designMDX,
                uiuxGuidance: params.context.uiuxGuidance,
                previousOutputs: params.previousOutputs,
            },
            // 注入动态约束
            lengthConstraint,
            languagePreference: userLangPreference,
            // === Loop Engineering 注入 ===
            criticFeedback,
            rewriteRound,
        };
        return this.writingWorkflow(input);
    }
    // 实现 IGeneratorAgent 接口
    async generate(plan, feedback, handoff) {
        const input = {
            taskId: plan.stepId,
            planStep: {
                stepId: plan.stepId,
                description: plan.description,
                expectedOutput: plan.expectedOutput,
                toolsNeeded: plan.toolsNeeded,
            },
            context: {
                interrogationResults: {},
                userPreferences: undefined,
                designMDX: undefined,
                uiuxGuidance: undefined,
                previousOutputs: handoff?.accumulatedSuggestions
                    ? { suggestions: { content: JSON.stringify(handoff.accumulatedSuggestions) } }
                    : {},
            },
            criticFeedback: feedback,
            rewriteRound: handoff?.round,
        };
        return this.writingWorkflow(input);
    }
    /**
     * 从 selfExperience 中提取关于篇幅的经验约束
     */
    extractLengthConstraint(selfExperience) {
        if (!selfExperience)
            return undefined;
        const sources = [
            ...(selfExperience.lessons ?? []),
            ...(selfExperience.content ? [selfExperience.content] : []),
        ];
        // 匹配类似 "控制在 8000-10000 字节内" / "篇幅应控制在" / "字数不超过" 等模式
        const lengthPatterns = sources.find((s) => /(\d+)\s*[-~至]\s*(\d+)\s*(字节|字符|字|bytes?|chars?)|(篇幅|字数|长度).{0,20}(控制|限制|不超过|以内)/i.test(s));
        return lengthPatterns ?? undefined;
    }
    /**
     * 从拷问结果中检测用户指定的编程语言偏好
     */
    detectLanguagePreference(interrogationResults) {
        if (!interrogationResults)
            return undefined;
        // 检查常见的语言偏好维度
        const langDimensions = [
            "编程语言",
            "programmingLanguage",
            "language",
            "技术栈",
            "techStack",
            "代码语言",
            "codeLanguage",
        ];
        for (const dim of langDimensions) {
            const value = interrogationResults[dim];
            if (value) {
                // 提取具体的语言名称
                const match = value.match(/(TypeScript|JavaScript|Python|Java|Go|Rust|C\+\+|Kotlin|Swift)/i);
                if (match)
                    return match[1];
            }
        }
        return undefined;
    }
    // 内部：完整的写作工作流
    async writingWorkflow(input) {
        const usedTools = [];
        // 步骤1：获取 UI/UX 设计指导
        let uiGuidance;
        try {
            uiGuidance = await this.getUIGuidance(input);
            usedTools.push("ui-ux-pro-max");
        }
        catch (error) {
            console.warn("获取 UI/UX 指导失败，使用默认值:", error);
            uiGuidance = {};
        }
        // 步骤2：搜集资料
        let researchResults = [];
        if (input.planStep.toolsNeeded.includes("web_search")) {
            researchResults = await this.research(input.planStep.description, input.context, input.taskId);
            usedTools.push("web_search");
        }
        // 步骤3：生成内容（核心 LLM 调用）
        const content = await this.generateContent(input, researchResults, uiGuidance);
        // 步骤4：写入文件
        const artifactPath = await this.writeArtifact(content, input.planStep.expectedOutput, input.taskId);
        usedTools.push("file_write");
        return {
            content,
            artifactPath,
            wordCount: content.length,
            references: researchResults,
            usedTools,
        };
    }
    // 步骤1：获取 UI/UX 设计指导
    async getUIGuidance(input) {
        // 如果上下文中已有 UI/UX 指导，直接使用
        if (input.context.uiuxGuidance) {
            return input.context.uiuxGuidance;
        }
        // 调用 ui-ux-pro-max skill 获取设计建议
        const skill = new UIUXProMaxSkill(this.llmProvider);
        return skill.execute({
            taskType: input.planStep.expectedOutput.split("/").pop() ?? "general",
            contentType: input.planStep.description,
            currentDesignMDX: input.context.designMDX,
            userPreferences: input.context.userPreferences,
        });
    }
    // 步骤2：搜集资料（调用 web_search）
    async research(topic, context, taskId) {
        if (!this.tools.has("web_search")) {
            console.warn("[WriterAgent] web_search 工具不可用，跳过搜索步骤");
            return [];
        }
        console.log(`[WriterAgent] 开始搜索: "${topic.slice(0, 60)}..."`);
        // 提取关键词用于搜索
        const keywords = topic
            .split(/[，。！？；\s]+/)
            .filter((w) => w.length > 1)
            .slice(0, 5)
            .join(" ");
        console.log(`[WriterAgent] 搜索关键词: "${keywords}"`);
        const result = await this.tools.execute({
            toolName: "web_search",
            params: { query: keywords },
            callerAgent: WriterAgent.AGENT_TYPE,
            taskId,
        });
        if (!result.success || !result.data) {
            console.warn(`[WriterAgent] 搜索失败: ${result.error ?? "无数据返回"}`);
            return [];
        }
        console.log(`[WriterAgent] ✅ 搜索成功! 返回数据类型: ${typeof result.data}, 长度: ${String(result.data).length} 字符`);
        // ★ 解析搜索结果为字符串数组（防御性处理 MCP 返回的各种格式）
        const data = result.data;
        // 情况1：期望格式 Array<{ title, url }>
        if (Array.isArray(data)) {
            const parsed = data.map((item) => {
                if (typeof item === "string")
                    return item;
                const obj = item;
                return `${obj.title ?? ""} - ${obj.url ?? ""}`;
            }).filter(Boolean);
            console.log(`[WriterAgent] 解析到 ${parsed.length} 条搜索结果 (Array格式)`);
            return parsed;
        }
        // 情况2：MCP 返回纯文本（拼接后返回）
        if (typeof data === "string") {
            const parsed = data.split("\n").filter((line) => line.trim().length > 0);
            console.log(`[WriterAgent] 解析到 ${parsed.length} 条搜索结果 (文本格式)`);
            return parsed;
        }
        // 情况3：未知格式，转为字符串
        console.warn(`[WriterAgent] 搜索返回数据格式异常: ${typeof data}, 尝试字符串化处理`);
        return [String(data)];
    }
    // 步骤3：生成内容（核心 LLM 调用）
    async generateContent(input, researchResults, uiGuidance) {
        // 构造包含所有上下文的 prompt
        let prompt = "";
        // === ★ P0 主题防漂移：原始任务锚定（物理层焊死在 prompt 最顶部）===
        // 无论 planStep.description 如何演变，原始任务是不可偏离的绝对参照系
        const originalTopic = this.extractOriginalTopic(input);
        if (originalTopic) {
            prompt += `${"═".repeat(60)}\n`;
            prompt += `## ★ 原始任务锚定（绝对不可偏离）\n`;
            prompt += `${"═".repeat(60)}\n\n`;
            prompt += `**用户的原始任务是：**\n> ${originalTopic}\n\n`;
            prompt += `**【强制规则 — 违反将直接导致审核不通过】**\n`;
            prompt += `- 你产出的所有内容必须紧密围绕上述原始任务展开\n`;
            prompt += `- 禁止将主题偏移到其他技术领域或产品，即使该领域看起来"相关"\n`;
            prompt += `- 每个章节、每个段落、每个例子都必须与原始任务直接相关\n`;
            prompt += `- 如果发现自己在写与原始任务无关的内容，立即停止并拉回主题\n`;
            prompt += `- 下方的"任务描述"只是执行建议，原始任务才是最高优先级\n\n`;
        }
        prompt += `## 任务描述\n${input.planStep.description}\n\n`;
        // === Loop Engineering: 重写模式标注 ===
        if (input.rewriteRound && input.rewriteRound > 1) {
            prompt += `> **⚠️ 这是第 ${input.rewriteRound} 轮重写 — 你必须根据下面的 Critic 反馈修改你的产出**\n\n`;
        }
        // 添加拷问结果
        if (input.context.interrogationResults &&
            Object.keys(input.context.interrogationResults).length > 0) {
            prompt += `## 用户需求与偏好\n`;
            for (const [key, value] of Object.entries(input.context.interrogationResults)) {
                prompt += `- ${key}: ${value}\n`;
            }
            prompt += "\n";
        }
        // 添加参考资料
        if (researchResults.length > 0) {
            prompt += `## 参考资料\n`;
            researchResults.forEach((ref, i) => {
                prompt += `${i + 1}. ${ref}\n`;
            });
            prompt += "\n";
        }
        // 添加 UI/UX 设计指导
        if (uiGuidance && Object.keys(uiGuidance).length > 0) {
            prompt += `## UI/UX 设计指导\n\`\`\`json\n${JSON.stringify(uiGuidance, null, 2)}\n\`\`\`\n\n`;
        }
        // 添加 design.mdx 参考
        if (input.context.designMDX) {
            prompt += `## 当前视觉 DNA (design.mdx)\n\`\`\`mdx\n${input.context.designMDX}\n\`\`\`\n\n`;
        }
        // 添加前序步骤输出
        if (input.context.previousOutputs &&
            Object.keys(input.context.previousOutputs).length > 0) {
            prompt += `## 前序步骤产出\n`;
            for (const [key, value] of Object.entries(input.context.previousOutputs)) {
                prompt += `### ${key}\n${typeof value === "string" ? value : JSON.stringify(value)}\n\n`;
            }
        }
        // 注入 selfExperience 篇幅约束（如有）
        if (input.lengthConstraint) {
            prompt += `\n**【来自历史经验的篇幅约束】** ${input.lengthConstraint}\n`;
            prompt += "请务必严格遵守此约束，这是基于过往生成内容过长问题的经验总结。\n\n";
        }
        // 注入用户指定的编程语言偏好（如有）
        if (input.languagePreference) {
            prompt += `\n**【用户指定的编程语言】** ${input.languagePreference}\n`;
            prompt += `所有代码示例必须使用 ${input.languagePreference} 编写。\n\n`;
        }
        // === Loop Engineering: 完整 Critic 报告注入（物理层焊死）===
        if (input.criticFeedback) {
            prompt += `\n${"═".repeat(60)}\n`;
            prompt += `## 🔴 CRITIC 审核反馈（上一轮审核结果 — 必须逐条回应）\n`;
            prompt += `${"═".repeat(60)}\n\n`;
            prompt += input.criticFeedback;
            prompt += `\n\n**【重写要求】**\n`;
            prompt += `- 你必须针对上面的每一条 Critic 建议进行修改\n`;
            prompt += `- 保留上一版中评分高的部分，只改进被指出的问题\n`;
            prompt += `- 不要改变文章的整体结构，除非 Critic 明确要求\n`;
            prompt += `- 确保修改后的内容仍然满足所有篇幅和主题约束\n\n`;
        }
        prompt +=
            "\n请基于以上信息生成高质量的 Markdown 内容，确保内容完整、准确、易读。";
        // 调用 LLM 生成内容
        const systemPrompt = input.customSystemPrompt ?? this.customSystemPrompt ?? WriterAgent.SYSTEM_PROMPT;
        const rawContent = await this.llmProvider.chat([
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
        ]);
        // Topic Drift 防漂移检测
        const finalContent = this.checkTopicDrift(rawContent, input);
        // 后处理：硬性长度裁剪（LLM 可能忽略篇幅约束）
        return this.enforceLengthLimit(finalContent);
    }
    // 后处理：硬性长度裁剪（LLM 可能忽略篇幅约束）
    enforceLengthLimit(content, maxChars = 15000) {
        if (content.length <= maxChars)
            return content;
        console.warn(`[WriterAgent] 内容超限: ${content.length} chars > ${maxChars} chars，执行智能裁剪`);
        // 策略：按章节（## 标题）裁剪，保留前 N 个完整章节
        const sections = content.split(/\n(?=##\s)/);
        let trimmed = "";
        for (const section of sections) {
            if ((trimmed + section).length > maxChars)
                break;
            trimmed += (trimmed ? "\n" : "") + section;
        }
        // 如果按章节裁剪后仍然超长，基于 trimmed 内容截断到最近的换行符
        if (trimmed.length > maxChars) {
            const lastNewline = trimmed.lastIndexOf("\n", maxChars); // 使用 trimmed 而非 content
            trimmed = trimmed.slice(0, Math.max(lastNewline, maxChars * 0.9)); // 从 trimmed 截断
        }
        // 添加截断标记
        if (trimmed.length < content.length) {
            trimmed += `\n\n> [WriterAgent 自动裁剪：原文 ${content.length} 字符 → 裁剪至 ${trimmed.length} 字符]`;
        }
        return trimmed;
    }
    /**
     * Topic Drift 防漂移检测
     *
     * 从任务描述和拷问结果中提取关键词，
     * 检查生成的内容是否包含这些核心关键词。
     * 如果检测到严重偏题，在内容头部注入警告和纠正指令。
     *
     * 注意：这是软检测，不会阻止内容输出，但会通过 prompt 强化约束
     */
    checkTopicDrift(content, input) {
        // 从任务描述中提取核心主题词
        const taskDesc = input.planStep.description.toLowerCase();
        const taskInput = input.context.interrogationResults
            ? Object.values(input.context.interrogationResults).join(" ").toLowerCase()
            : "";
        // 提取关键主题词（优先从任务描述中提取）
        const topicKeywords = this.extractTopicKeywords(taskDesc + " " + taskInput);
        if (topicKeywords.length === 0)
            return content; // 无法提取关键词，跳过检测
        // 检查内容是否覆盖了关键主题词
        const contentLower = content.toLowerCase();
        const matchedKeywords = topicKeywords.filter((kw) => contentLower.includes(kw.toLowerCase()));
        const matchRatio = matchedKeywords.length / topicKeywords.length;
        // 如果匹配率低于 50%，认为可能存在 topic drift
        if (matchRatio < 0.5) {
            console.warn(`[WriterAgent] Topic Drift 检测: 只匹配 ${matchedKeywords.length}/${topicKeywords.length} 个关键词 (${Math.round(matchRatio * 100)}%)`);
            console.warn(`[WriterAgent]   期望主题关键词: [${topicKeywords.join(", ")}]`);
            console.warn(`[WriterAgent]   实际匹配关键词: [${matchedKeywords.join(", ") || "无"}]`);
            // 不再注入 HTML comment 到产物中，仅记录警告日志
            // 下一次迭代时 Writer 会看到 Critic 反馈中的 topic_accuracy 低分而自行修正
        }
        return content; // 始终返回纯净内容
    }
    /**
     * 从文本中提取核心主题关键词
     */
    extractTopicKeywords(text) {
        // 常见的技术主题词模式
        const patterns = [
            /ai\s*agent|agent\s*架构|智能体/gi,
            /rag|检索增强/gi,
            /llm|大语言模型|大模型/gi,
            /transformer|注意力机制/gi,
            /微服务|microservice/gi,
            /kubernetes|k8s|容器/gi,
            /react|vue|前端/gi,
            /nodejs|node\.js|后端/gi,
            /python|机器学习|深度学习/gi,
            /区块链|blockchain/gi,
        ];
        const found = [];
        for (const pattern of patterns) {
            const matches = text.match(pattern);
            if (matches) {
                // 取第一个匹配的标准化形式
                found.push(matches[0].toLowerCase());
            }
        }
        // 去重并返回最多 5 个关键词
        return [...new Set(found)].slice(0, 5);
    }
    /**
     * ★ P0 主题防漂移：从输入上下文中提取原始任务主题
     *
     * 优先级：
     * 1. interrogationResults 中的"原始任务"/"task"/"任务描述" 等维度
     * 2. planStep.description（作为降级）
     * 3. interrogationResults 的所有值拼接（最后手段）
     *
     * @returns 原始任务字符串，如果无法提取则返回 null
     */
    extractOriginalTopic(input) {
        // 优先 1: 从拷问结果中查找明确的"任务"相关维度
        if (input.context.interrogationResults) {
            const taskKeys = [
                "原始任务", "task", "任务描述", "taskInput",
                "task_description", "用户需求", "你的需求", "你想写什么",
                "topic", "主题", "写作主题",
            ];
            for (const key of taskKeys) {
                const value = input.context.interrogationResults[key];
                if (value && typeof value === "string" && value.trim().length > 2) {
                    return value.trim();
                }
            }
        }
        // 优先 2: planStep.description 本身（至少比没有强）
        if (input.planStep.description && input.planStep.description.trim().length > 5) {
            return input.planStep.description.trim();
        }
        // 优先 3: 拷问结果的所有值拼接（取第一个有实质内容的）
        if (input.context.interrogationResults) {
            for (const [, value] of Object.entries(input.context.interrogationResults)) {
                if (typeof value === "string" && value.trim().length > 5) {
                    return value.trim();
                }
            }
        }
        return null;
    }
    // 步骤4：写入文件
    async writeArtifact(content, expectedOutput, taskId) {
        if (!this.tools.has("file_write")) {
            throw new Error("file_write 工具不可用");
        }
        const artifactPath = `./artifacts/${expectedOutput}`;
        const result = await this.tools.execute({
            toolName: "file_write",
            params: { path: artifactPath, content },
            callerAgent: WriterAgent.AGENT_TYPE,
            taskId,
        });
        if (!result.success) {
            throw new Error(`写入文件失败: ${result.error}`);
        }
        return artifactPath;
    }
}
//# sourceMappingURL=agent.js.map