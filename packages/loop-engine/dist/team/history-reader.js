/**
 * HistoryReader — Memory 回流读取器
 *
 * 核心职责：读取 self.jsonl / self.md / user.md 中的历史沉淀物，
 * 将其转化为可注入 Writer Agent System Prompt 的前缀文本。
 *
 * 这是「护城河」的**读取端**，与 EvolutionDocsManager 的写入端形成闭环：
 *   写入: EvolutionAgent → addExperience() → self.md + self.jsonl
 *   读取: HistoryReader → getSelfMD() → buildPromptPrefix() → Writer Prompt
 *
 * 护城河公式 = 写入能力 × 读取回流 × 决策影响
 *   当前状态: 写入=100%, 读取=0%(此文件修复), 决策影响=待验证
 *   MVP 目标: 读取回流率 ≥ 50%
 *
 * 文件位置：packages/loop-engine/src/team/history-reader.ts
 */
/** 默认配置 */
export const DEFAULT_HISTORY_READER_CONFIG = {
    maxExperiences: 5,
    maxCapabilities: 8,
    maxLimitations: 3,
    includeUserProfile: true,
    proficiencyWarningThreshold: 40,
};
// ============================================================
// HistoryReader 实现
// ============================================================
/**
 * 历史记忆读取器 — 将 Memory 沉淀物转化为 Writer Prompt 上下文
 *
 * 使用方式：
 * ```typescript
 * const reader = new HistoryReader(evolutionDocsManager);
 * const result = await reader.buildPromptPrefix("写一篇AI文章", { contentType: "article" });
 * // result.promptPrefix → "## 📚 历史经验与能力画像\n\n### 已掌握的能力\n..."
 *
 * // 注入到 WriterAgent:
 * const enhancedPrompt = result.promptPrefix + "\n\n" + originalWriterPrompt;
 * writerAgent.setSystemPrompt(enhancedPrompt);
 * ```
 */
export class HistoryReader {
    readSelfMD;
    readUserMD;
    config;
    /**
     * @param readSelfMD 读取 self.md 的函数（依赖注入，解耦 FileStore）
     * @param readUserMD 读取 user.md 的函数（可选）
     * @param config 配置选项
     */
    constructor(readSelfMD, readUserMD, config) {
        this.readSelfMD = readSelfMD;
        this.readUserMD = readUserMD;
        this.config = { ...DEFAULT_HISTORY_READER_CONFIG, ...config };
    }
    /**
     * 核心方法：构建可注入 Writer System Prompt 的历史上下文前缀
     *
     * @param taskInput 当前任务描述（用于相关性过滤）
     * @param options 可选的额外上下文
     * @returns 包含 promptPrefix 和统计信息的对象
     */
    async buildPromptPrefix(taskInput, options) {
        // Step 1: 读取原始数据
        const selfData = await this.readSelfMD();
        const userData = this.config.includeUserProfile && this.readUserMD
            ? await this.readUserMD()
            : null;
        // 如果没有历史数据，返回空前缀
        if (!selfData || selfData.experiences.length === 0) {
            return {
                promptPrefix: "",
                stats: {
                    experienceCount: 0,
                    capabilityCount: 0,
                    limitationCount: 0,
                    hasUserProfile: false,
                    totalChars: 0,
                },
                sourceData: {
                    experiences: [],
                    capabilities: [],
                    limitations: [],
                },
            };
        }
        // Step 2: 提取并筛选相关数据
        const experiences = this.selectRelevantExperiences(selfData.experiences, taskInput, this.config.maxExperiences);
        const capabilities = this.sortCapabilitiesByRelevance(selfData.capabilities, taskInput).slice(0, this.config.maxCapabilities);
        const limitations = selfData.limitations
            .slice(0, this.config.maxLimitations);
        // Step 3: 提取用户画像关键词
        const userProfile = this.extractUserProfile(userData);
        // Step 4: 构建 Markdown 前缀
        const sections = [];
        // --- 标题 ---
        sections.push(`## 📚 历史经验与能力画像`);
        sections.push(`> 以下内容基于你过往任务的沉淀经验，请在写作时参考这些已知能力和注意事项。\n`);
        // --- 能力清单 ---
        if (capabilities.length > 0) {
            sections.push(`### ✅ 已掌握的能力`);
            for (const cap of capabilities) {
                const level = this.proficiencyLevel(cap.proficiency);
                const warning = cap.proficiency < this.config.proficiencyWarningThreshold
                    ? ` ⚠️ 熟练度偏低，需注意质量`
                    : "";
                sections.push(`- **${cap.name}** [${level}] (成功率: ${this.successRate(cap)})${warning}`);
            }
            sections.push("");
        }
        // --- 经验教训 ---
        if (experiences.length > 0) {
            sections.push(`### 💡 相关经验教训`);
            for (const exp of experiences) {
                const icon = exp.type === "success" ? "✅" : "⚠️";
                sections.push(`${icon} **${exp.pattern}** (${exp.type}): ${exp.lesson}`);
            }
            sections.push("");
        }
        // --- 高效策略库（从成功经验的 capabilityDelta.improvedStrategies 提取）---
        const topStrategies = this.extractTopStrategies(experiences, 3);
        if (topStrategies.length > 0) {
            sections.push(`### 🏆 高效策略库`);
            for (const strategy of topStrategies) {
                sections.push(`- ${strategy}`);
            }
            sections.push("");
        }
        // --- 已知限制 ---
        if (limitations.length > 0) {
            sections.push(`### 🚫 已知限制 / 注意事项`);
            for (const lim of limitations) {
                const severityIcon = lim.severity === "high" ? "🔴" : lim.severity === "medium" ? "🟡" : "🟢";
                sections.push(`${severityIcon} ${lim.limitation} (出现${lim.count}次)`);
            }
            sections.push("");
        }
        // --- 用户画像 ---
        if (userProfile && Object.keys(userProfile).length > 0) {
            sections.push(`### 👤 目标用户画像`);
            for (const [key, value] of Object.entries(userProfile)) {
                sections.push(`- **${key}**: ${value}`);
            }
            sections.push("");
        }
        const promptPrefix = sections.join("\n");
        return {
            promptPrefix,
            stats: {
                experienceCount: experiences.length,
                capabilityCount: capabilities.length,
                limitationCount: limitations.length,
                hasUserProfile: Object.keys(userProfile ?? {}).length > 0,
                totalChars: promptPrefix.length,
            },
            sourceData: {
                experiences,
                capabilities,
                limitations,
                userProfile,
            },
        };
    }
    // ============================================================
    // 私有方法：数据筛选和格式化
    // ============================================================
    /**
     * 选择与当前任务最相关的经验条目
     *
     * 策略：
     * 1. 优先选择 success 类型的经验
     * 2. 按 pattern 与 taskInput 的关键词重叠度排序
     * 3. 限制数量
     */
    selectRelevantExperiences(experiences, taskInput, maxCount) {
        if (experiences.length === 0)
            return [];
        // 关键词提取（简单分词）
        const taskKeywords = new Set(taskInput.toLowerCase().split(/\s+|[,，。！？、]/).filter((w) => w.length >= 2));
        // 计算每条经验的相关性得分
        const scored = experiences.map((exp) => {
            let score = 0;
            // type 权重
            if (exp.type === "success")
                score += 10;
            // pattern 关键词重叠
            const patternLower = exp.pattern.toLowerCase();
            for (const kw of taskKeywords) {
                if (patternLower.includes(kw))
                    score += 3;
                if (exp.lesson.toLowerCase().includes(kw))
                    score += 2;
            }
            // 时间衰减（越新越相关）
            const ageDays = (Date.now() - new Date(exp.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 5 - Math.floor(ageDays / 30)); // 每月减1分，最低0
            // Q-Value 权重（经验效用值，越高说明这条经验越有用）
            const qValue = exp.qValue ?? (exp.type === "success" ? 1.0 : exp.type === "learning" ? 0.7 : 0.4);
            score += qValue * 5;
            return { exp, score };
        });
        // 按得分降序排列，取前 N 条
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, maxCount).map((s) => s.exp);
    }
    /**
     * 按与任务的相关性排序能力列表
     *
     * 熟练度高 + 最近使用过 + 名称匹配任务关键词 → 排名靠前
     */
    sortCapabilitiesByRelevance(capabilities, taskInput) {
        const taskLower = taskInput.toLowerCase();
        return [...capabilities].sort((a, b) => {
            // 1. 熟练度降序
            if (a.proficiency !== b.proficiency)
                return b.proficiency - a.proficiency;
            // 2. 名称匹配任务关键词
            const aMatch = taskLower.includes(a.name.toLowerCase()) ? 1 : 0;
            const bMatch = taskLower.includes(b.name.toLowerCase()) ? 1 : 0;
            if (aMatch !== bMatch)
                return bMatch - aMatch;
            // 3. 最近使用时间降序
            return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
        });
    }
    /**
     * 从 UserMemoryData 中提取用户画像键值对
     */
    extractUserProfile(userData) {
        if (!userData?.profile)
            return undefined;
        const profile = {};
        const fields = ["targetAudience", "tone", "stylePreference", "contentLanguage", "niche"];
        for (const field of fields) {
            const value = userData.profile[field];
            if (value && typeof value === "string" && value.length > 0) {
                profile[field] = value;
            }
        }
        // 也从 fields 数组中提取自定义字段
        if (userData.fields && userData.fields.length > 0) {
            for (const f of userData.fields.slice(0, 5)) {
                if (f.confidence >= 0.7 && !profile[f.key]) {
                    profile[f.key] = f.value;
                }
            }
        }
        return Object.keys(profile).length > 0 ? profile : undefined;
    }
    // ============================================================
    // 私有方法：格式化辅助
    // ============================================================
    /** 熟练度等级标签 */
    proficiencyLevel(proficiency) {
        if (proficiency >= 80)
            return "精通";
        if (proficiency >= 60)
            return "熟练";
        if (proficiency >= 40)
            return "入门";
        return "初学";
    }
    /** 成功率格式化 */
    successRate(cap) {
        const total = cap.successCount + cap.failureCount;
        if (total === 0)
            return "暂无数据";
        const rate = ((cap.successCount / total) * 100).toFixed(0);
        return `${rate}% (${cap.successCount}/${total})`;
    }
    /**
     * 从成功经验的 capabilityDelta.improvedStrategies 中提取 top-N 策略
     *
     * 按出现频率排序，返回前 N 条不重复的策略。
     */
    extractTopStrategies(experiences, maxCount) {
        const freq = new Map();
        for (const exp of experiences) {
            if (exp.type !== "success")
                continue;
            const strategies = exp.capabilityDelta?.improvedStrategies ?? [];
            for (const s of strategies) {
                freq.set(s, (freq.get(s) ?? 0) + 1);
            }
        }
        // 按频率降序，取前 N 条
        return [...freq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxCount)
            .map(([strategy]) => strategy);
    }
}
//# sourceMappingURL=history-reader.js.map