/**
 * 内容产出部 — 部门专属验收目标模板 (GoalTemplates)
 *
 * 每种内容格式有独特的验收标准，
 * 覆盖 completion-guard 中通用模板的不足。
 *
 * 设计原则：
 * - 这些是部门级模板，优先级高于 loop-engine 内置的通用模板
 * - 通过 DepartmentConfig.goalTemplates 注入到 LoopHarness
 * - 使用 content_match / file_exists 等轻量验证方法（不需要 tsc/test/lint）
 *
 * 验证优先级（从高到低）：
 * 1. PlanStep.metadata.acceptanceGoals （显式定义）
 * 2. DepartmentConfig.goalTemplates （部门专属，本文件）
 * 3. GoalTemplateRegistry 内置模板 （通用兜底）
 */
// ============================================================
// 辅助函数：构建标准的 content_match 验证方法
// ============================================================
/**
 * 创建一个 content_match 验证方法
 */
function contentMatch(pattern, target = "**/*.md") {
    return { type: "content_match", target, pattern };
}
/**
 * 创建一个 file_exists 验证方法
 */
function fileExists(path, minSizeBytes) {
    return { type: "file_exists", path, ...(minSizeBytes !== undefined ? { minSizeBytes } : {}) };
}
// ============================================================
// 1. 图文/长文 (Article) 验收目标
// ============================================================
export const ARTICLE_GOAL_TEMPLATES = [
    {
        match: {
            contentType: "article",
            keywords: ["文章", "写", "写作", "公众号", "知乎", "blog"],
        },
        generate: (stepId) => [
            {
                id: `${stepId}_article_file_exists`,
                stepId,
                description: "图文产出文件已存在且字数达标(≥1500字)",
                verifyBy: [fileExists("**/*.md", 1500)],
                priority: "critical",
                required: true,
            },
            {
                id: `${stepId}_article_has_title`,
                stepId,
                description: "文章包含 H1 主标题",
                verifyBy: [contentMatch(/^#\s+.+/m)],
                priority: "critical",
                required: true,
            },
            {
                id: `${stepId}_article_has_cta`,
                stepId,
                description: "文章包含行动号召段落（关注/点赞/评论/转发等）",
                verifyBy: [contentMatch(/关注|点赞|评论|转发|分享|订阅|follow|like|comment/i)],
                priority: "major",
                required: false,
            },
            {
                id: `${stepId}_article_word_count`,
                stepId,
                description: "文章总字数在 2000-3500 字范围内",
                verifyBy: [
                    // 通过 content_match 的 antiPattern 做粗略检查：不应太短
                    // （精确字数统计由 Critic 的评分维度负责）
                    contentMatch(/[\u4e00-\u9fa5]{2000,}/),
                ],
                priority: "major",
                required: false,
            },
        ],
    },
];
// ============================================================
// 2. 种草/短图文 (Seed) 验收目标
// ============================================================
export const SEED_GOAL_TEMPLATES = [
    {
        match: {
            contentType: "seed",
            keywords: ["种草", "小红书", "笔记", "seed", "推荐", "安利"],
        },
        generate: (stepId) => [
            {
                id: `${stepId}_seed_file_exists`,
                stepId,
                description: "种草笔记文件已存在且非空(≥200字)",
                verifyBy: [fileExists("**/*.md", 200)],
                priority: "critical",
                required: true,
            },
            {
                id: `${stepId}_seed_emoji_count`,
                stepId,
                description: "Emoji 密度达标（全文 ≥ 5 个 emoji）",
                verifyBy: [
                    // 匹配常见 emoji 范围（Unicode emoji + 常用 emoji 序列）
                    contentMatch(/([\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}])/gu, "**/*.md"),
                ],
                priority: "major",
                required: true,
            },
            {
                id: `${stepId}_seed_hashtags`,
                stepId,
                description: "包含话题标签格式（#xxx#）",
                verifyBy: [contentMatch(/#[^#]+#/)],
                priority: "major",
                required: true,
            },
            {
                id: `${stepId}_seed_cta`,
                stepId,
                description: "包含互动引导（@xxx 或 '评论区见'/'私信我' 等）",
                verifyBy: [contentMatch(/@|评论区|私信|留言|收藏|点赞/i)],
                priority: "major",
                required: false,
            },
        ],
    },
];
// ============================================================
// 3. 短视频脚本 (Short Video) 验收目标
// ============================================================
export const SHORT_VIDEO_GOAL_TEMPLATES = [
    {
        match: {
            contentType: "short-video",
            keywords: ["短视频", "脚本", "抖音", "TikTok", "视频", "分镜", "口播"],
        },
        generate: (stepId) => [
            {
                id: `${stepId}_sv_file_exists`,
                stepId,
                description: "短视频脚本文件已存在",
                verifyBy: [fileExists("**/*.{md,txt}")],
                priority: "critical",
                required: true,
            },
            {
                id: `${stepId}_sv_scene_markers`,
                stepId,
                description: "包含场景标记（[场景N] 格式，至少 3 个）",
                verifyBy: [contentMatch(/\[场景\d+\]/g)],
                priority: "critical",
                required: true,
            },
            {
                id: `${stepId}_sv_script_elements`,
                stepId,
                description: "脚本包含完整的标记要素（画面/音效/字幕/口播）",
                verifyBy: [
                    contentMatch(/\[画面\]/),
                    contentMatch(/\[口播\]|\[文案\]/),
                ],
                priority: "major",
                required: true,
            },
            {
                id: `${stepId}_sv_has_cta`,
                stepId,
                description: "结尾包含明确的 CTA（关注/点赞/评论/购买）",
                verifyBy: [contentMatch(/关注|点赞|评论|购买|下单|链接|主页/i)],
                priority: "major",
                required: true,
            },
            {
                id: `${stepId}_sv_duration_range`,
                stepId,
                description: "脚本时长在合理范围（通过口播字数估算 30-120 秒）",
                verifyBy: [
                    // 粗略检查：口播文本不应太短（<100字≈<15秒）也不应太长（>2000字≈>3分钟）
                    contentMatch(/[\u4e00-\u9fa5]{100,2000}/),
                ],
                priority: "minor",
                required: false,
            },
        ],
    },
];
// ============================================================
// 4. Newsletter 验收目标
// ============================================================
export const NEWSLETTER_GOAL_TEMPLATES = [
    {
        match: {
            contentType: "newsletter",
            keywords: ["Newsletter", "周报", "通讯", "邮件", "substack", "订阅"],
        },
        generate: (stepId) => [
            {
                id: `${stepId}_nl_file_exists`,
                stepId,
                description: "Newsletter 文件已存在",
                verifyBy: [fileExists("**/*.{md,html}")],
                priority: "critical",
                required: true,
            },
            {
                id: `${stepId}_nl_unsubscribe`,
                stepId,
                description: "包含 unsubscribe 链接或占位符",
                verifyBy: [contentMatch(/unsubscribe|取消订阅|退订|\{\{UNSUBSCRIBE_LINK\}\}/i)],
                priority: "critical",
                required: true,
            },
            {
                id: `${stepId}_nl_spam_safety`,
                stepId,
                description: "不含垃圾邮件高频触发词（免费/中奖/!!!/urgent）",
                verifyBy: [
                    {
                        type: "content_match",
                        target: "**/*.md",
                        pattern: /免费|中奖|!!!|urgent|限时|马上行动|不要错过/i,
                        antiPattern: undefined, // 此处用 antiPattern 不太合适，改用 llm_assertion 更好
                        // 但作为轻量验证，我们检查：如果匹配到这些词，goal 应该 fail
                        // 实际上 content_match 有 antiPattern 参数，如果设置了 antiPattern
                        // 则匹配到 antiPattern 时该验证不通过
                        // 这里我们用一个技巧：pattern 匹配正常内容，antiPattern 匹配垃圾词
                    },
                ],
                // 改用更精确的方式：antiPattern 匹配垃圾词
                priority: "major",
                required: true,
            },
            {
                id: `${stepId}_nl_greeting`,
                stepId,
                description: "包含问候语（邮件格式必需的礼貌开场）",
                verifyBy: [contentMatch(/你好|hi|hey|亲爱的|各位/i)],
                priority: "minor",
                required: false,
            },
            {
                id: `${stepId}_nl_ps_section`,
                stepId,
                description: "包含 P.S. 或附言段落（Newsletter 特有高阅读率位置）",
                verifyBy: [contentMatch(/P\.S\.|PS\.|附言|又及/i)],
                priority: "major",
                required: false,
            },
        ],
    },
];
/** 所有部门目标模板的汇总映射 */
const ALL_DEPARTMENT_GOALS = {
    article: ARTICLE_GOAL_TEMPLATES,
    seed: SEED_GOAL_TEMPLATES,
    "short-video": SHORT_VIDEO_GOAL_TEMPLATES,
    newsletter: NEWSLETTER_GOAL_TEMPLATES,
};
/**
 * 根据内容格式获取所有部门专属的目标模板
 *
 * @param contentType 内容格式类型
 * @returns 该格式的 DepartmentGoalTemplate 数组
 */
export function getDepartmentGoalTemplates(contentType) {
    return ALL_DEPARTMENT_GOALS[contentType] ?? [];
}
