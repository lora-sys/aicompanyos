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
import type { SelfMemoryData, SelfExperienceEntry, Capability } from "@aicos/memory";
/**
 * HistoryReader 配置选项
 */
export interface HistoryReaderConfig {
    /** 最大提取经验条数（避免 Prompt 过长） */
    maxExperiences?: number;
    /** 最大提取能力数 */
    maxCapabilities?: number;
    /** 最大提取限制/短板数 */
    maxLimitations?: number;
    /** 是否包含用户画像信息 */
    includeUserProfile?: boolean;
    /** 能力熟练度阈值（低于此值的能力会以警告形式提示） */
    proficiencyWarningThreshold?: number;
}
/** 默认配置 */
export declare const DEFAULT_HISTORY_READER_CONFIG: Required<HistoryReaderConfig>;
/**
 * 构建结果 — 包含可直接拼接到 System Prompt 的前缀文本
 */
export interface HistoryPromptResult {
    /** 拼接到 System Prompt 前面的前缀文本（Markdown 格式） */
    promptPrefix: string;
    /** 统计信息（用于日志和调试） */
    stats: {
        experienceCount: number;
        capabilityCount: number;
        limitationCount: number;
        hasUserProfile: boolean;
        totalChars: number;
    };
    /** 原始数据引用（用于高级定制） */
    sourceData: {
        experiences: SelfExperienceEntry[];
        capabilities: Capability[];
        limitations: SelfMemoryData["limitations"];
        userProfile?: Record<string, string>;
    };
}
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
export declare class HistoryReader {
    private readSelfMD;
    private readUserMD?;
    private config;
    /**
     * @param readSelfMD 读取 self.md 的函数（依赖注入，解耦 FileStore）
     * @param readUserMD 读取 user.md 的函数（可选）
     * @param config 配置选项
     */
    constructor(readSelfMD: () => Promise<SelfMemoryData | null>, readUserMD?: (() => Promise<import("@aicos/memory").UserMemoryData | null>) | undefined, config?: HistoryReaderConfig);
    /**
     * 核心方法：构建可注入 Writer System Prompt 的历史上下文前缀
     *
     * @param taskInput 当前任务描述（用于相关性过滤）
     * @param options 可选的额外上下文
     * @returns 包含 promptPrefix 和统计信息的对象
     */
    buildPromptPrefix(taskInput: string, options?: {
        contentType?: string;
        domain?: string;
    }): Promise<HistoryPromptResult>;
    /**
     * 选择与当前任务最相关的经验条目
     *
     * 策略：
     * 1. 优先选择 success 类型的经验
     * 2. 按 pattern 与 taskInput 的关键词重叠度排序
     * 3. 限制数量
     */
    private selectRelevantExperiences;
    /**
     * 按与任务的相关性排序能力列表
     *
     * 熟练度高 + 最近使用过 + 名称匹配任务关键词 → 排名靠前
     */
    private sortCapabilitiesByRelevance;
    /**
     * 从 UserMemoryData 中提取用户画像键值对
     */
    private extractUserProfile;
    /** 熟练度等级标签 */
    private proficiencyLevel;
    /** 成功率格式化 */
    private successRate;
}
//# sourceMappingURL=history-reader.d.ts.map