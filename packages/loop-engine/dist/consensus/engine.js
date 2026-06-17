import { ConsensusVote, } from "./types.js";
import { z } from "zod";
import { createLLMParser, FallbackStrategy, } from "../utils/llm-structured-output.js";
import { THRESHOLDS } from "../config/thresholds.js";
// 默认配置
const DEFAULT_CONFIG = {
    threshold: THRESHOLDS.CONSENSUS_PASS,
    maxRounds: 3,
    requireUnanimous: false,
    enableUIUXVoting: false,
};
// Zod Schema: 投票结果（兼容对象和数组格式）
const singleVoteSchema = z.object({
    vote: z.string().optional(),
    score: z.number().optional(),
    comment: z.string().optional(),
    suggestions: z.array(z.string()).optional(),
});
const voteResultSchema = z.union([
    singleVoteSchema,
    z.array(singleVoteSchema), // LLM 可能返回数组
]);
// 解析器实例：投票解析失败返回 ABSTAIN（保守策略）
const voteParser = createLLMParser({
    schema: voteResultSchema,
    fallback: { vote: ConsensusVote.ABSTAIN },
    strategy: FallbackStrategy.RETURN_FALLBACK,
    logPrefix: "ConsensusLock.parseVote",
});
// System Prompt：Critic 审核者
const CRITIC_REVIEW_PROMPT = `你是一位严格的代码/内容审核专家（Critic）。
请对 Writer 的产出进行审核评分。

返回 JSON 格式：
{
  "vote": "approve|reject|abstain",
  "score": 0-100,
  "comment": "审核意见",
  "suggestions": ["改进建议1", "改进建议2"]
}`;
// System Prompt：Writer 自评
const WRITER_SELF_REVIEW_PROMPT = `你是刚才完成写作任务的 Writer Agent。请对自己的产出进行客观自评。

注意：
- 不要偏袒自己的作品，要像第三方审核员一样严格
- 如果发现任何问题（篇幅超限、内容缺失、格式错误），必须诚实指出
- 只有真正高质量的作品才应该投 approve

返回 JSON 格式：
{
  "vote": "approve|reject|abstain",
  "score": 0-100,
  "comment": "自评意见（含自我反思）",
  "suggestions": ["如果重做会改进的地方"]
}`;
// System Prompt：UI-UX 审核者
const UIUX_REVIEW_PROMPT = `你是一位 UI/UX 设计审核专家。
请从用户体验和界面设计角度对产出进行审核。

返回 JSON 格式：
{
  "vote": "approve|reject|abstain",
  "score": 0-100,
  "comment": "UI/UX 审核意见",
  "suggestions": ["改进建议1", "改进建议2"]
}`;
/**
 * 共识锁 - 多 Agent 投票审核机制
 */
export class ConsensusLock {
    config;
    writerReviewer; // 使用 IEvaluatorAgent 替代 AgentExecutor
    uiuxReviewer; // UI-UX Agent（可选，保留 AgentExecutor 向后兼容）
    llmProvider;
    criteria; // IEvaluatorAgent.evaluate() 需要的评估标准
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * 设置 Critic 审核 Agent (IEvaluatorAgent 接口)
     */
    setWriterReviewer(reviewer) {
        this.writerReviewer = reviewer;
    }
    /**
     * 设置 GradingCriteria（IEvaluatorAgent.evaluate() 需要）
     */
    setCriteria(criteria) {
        this.criteria = criteria;
    }
    /**
     * 设置 UI-UX 审核 Agent
     */
    setUIUXReviewer(reviewer) {
        this.uiuxReviewer = reviewer;
    }
    /**
     * 设置 LLM Provider（用于无 Agent 时的降级审核）
     */
    setLLMProvider(provider) {
        this.llmProvider = provider;
    }
    /**
     * 执行共识流程
     */
    async reachConsensus(params) {
        let lastResult;
        for (let round = 1; round <= this.config.maxRounds; round++) {
            const result = await this.conductRound(params.writerOutput, round, params.context);
            lastResult = result; // 保存每轮结果
            if (result.passed) {
                return result;
            }
            // 未通过，进入下一轮（实际重做由外部 Loop 引擎触发）
        }
        // 复用已执行的最后一轮结果，不再重复调用 conductRound
        if (lastResult) {
            const evalResult = this.evaluateVotes(lastResult.votes);
            return {
                ...lastResult,
                passed: false,
                verdict: evalResult.verdict ?? `EXHAUSTED: ${this.config.maxRounds} 轮后仍未达成共识`,
                avgScore: evalResult.avgScore,
                dominantVote: evalResult.dominantVote,
            };
        }
        // 理论上不会到达这里（maxRounds >= 1 时循环至少执行一次）
        return {
            passed: false,
            votes: [],
            round: 0,
            totalRounds: 0,
            verdict: "NO_ROUNDS_EXECUTED",
            avgScore: 0,
            dominantVote: ConsensusVote.ABSTAIN,
        };
    }
    /**
     * 执行一轮投票
     */
    async conductRound(writerOutput, round, context) {
        const votes = [];
        // Critic 审核（使用 IEvaluatorAgent 接口）
        if (this.writerReviewer) {
            try {
                const writerOutputObj = typeof writerOutput === "string"
                    ? { content: writerOutput }
                    : writerOutput;
                if (!this.criteria) {
                    throw new Error("ConsensusLock: 未设置 GradingCriteria，请先调用 setCriteria()");
                }
                // 使用 IEvaluatorAgent.evaluate() 替代 AgentExecutor.execute()
                const gradingResult = await this.writerReviewer.evaluate(writerOutputObj, this.criteria, context.taskInput ?? "");
                votes.push(this.parseGradingVote(gradingResult, "critic"));
            }
            catch (error) {
                votes.push({ voter: "critic", vote: ConsensusVote.ABSTAIN, error: String(error) });
            }
        }
        else if (this.llmProvider) {
            // 降级：使用 LLM 直接审核
            votes.push(await this.llmVote(writerOutput, "critic", CRITIC_REVIEW_PROMPT));
        }
        // Writer 自评（使共识更有意义：writer 自评 + critic 他评 = 双方视角）
        if (this.llmProvider) {
            votes.push(await this.llmVote(writerOutput, "writer-self", WRITER_SELF_REVIEW_PROMPT));
        }
        // UI-UX 审核（可选）
        if (this.config.enableUIUXVoting && this.uiuxReviewer) {
            try {
                const uiuxOutput = await this.uiuxReviewer.execute({
                    step: {
                        stepId: `consensus-uiux-${round}`,
                        agentType: "ui-ux",
                        description: "UI/UX 审核",
                        expectedOutput: "UI/UX 审核结果",
                        toolsNeeded: [],
                    },
                    tools: {},
                    context,
                    previousOutputs: { writerOutput: { content: String(writerOutput ?? "") } },
                });
                votes.push(this.parseVote(uiuxOutput, "ui-ux"));
            }
            catch (error) {
                votes.push({ voter: "ui-ux", vote: ConsensusVote.ABSTAIN, error: String(error) });
            }
        }
        else if (this.config.enableUIUXVoting && this.llmProvider) {
            votes.push(await this.llmVote(writerOutput, "ui-ux", UIUX_REVIEW_PROMPT));
        }
        // 判定是否通过
        const evaluation = this.evaluateVotes(votes);
        return {
            passed: evaluation.passed,
            votes,
            round,
            totalRounds: this.config.maxRounds,
            verdict: evaluation.verdict,
            avgScore: evaluation.avgScore,
            dominantVote: evaluation.dominantVote,
        };
    }
    /**
     * 使用 LLM 进行投票（降级方案）
     */
    async llmVote(writerOutput, voterName, systemPrompt) {
        if (!this.llmProvider) {
            return { voter: voterName, vote: ConsensusVote.ABSTAIN };
        }
        try {
            const response = await this.llmProvider.chat([
                { role: "system", content: systemPrompt },
                { role: "user", content: `请审核以下产出：\n\n${JSON.stringify(writerOutput, null, 2)}` },
            ]);
            return this.parseVote(response, voterName);
        }
        catch {
            return { voter: voterName, vote: ConsensusVote.ABSTAIN };
        }
    }
    /**
     * 解析投票结果
     * 使用 LLMStructuredOutput 统一提取+验证
     */
    parseVote(raw, voter) {
        if (typeof raw !== "string") {
            return { voter, vote: ConsensusVote.ABSTAIN };
        }
        const result = voteParser.parse(raw);
        if (!result.success) {
            // Schema 验证失败 → 尝试从原始文本中手动提取关键字段
            return this.fallbackParseVote(raw, voter);
        }
        // 兼容 LLM 返回数组格式：取第一个元素
        const parsed = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!parsed)
            return this.fallbackParseVote(raw, voter);
        // 确保关键字段存在
        return {
            voter,
            vote: parsed.vote || ConsensusVote.ABSTAIN,
            score: typeof parsed.score === "number" ? parsed.score : undefined,
            comment: parsed.comment,
            suggestions: parsed.suggestions ?? undefined,
        };
    }
    /**
     * 将 IEvaluatorAgent 的 GradingResult 转换为共识投票格式
     */
    parseGradingVote(grading, voter) {
        return {
            voter,
            vote: grading.passed
                ? (grading.excellent ? ConsensusVote.APPROVE : ConsensusVote.APPROVE)
                : ConsensusVote.REJECT,
            score: grading.totalScore,
            comment: `评分: ${grading.totalScore}/100, passed=${grading.passed}, excellent=${grading.excellent}`,
        };
    }
    /**
     * 兜底解析：当 Zod schema 验证失败时，用正则从原始文本中提取 vote/score
     * 处理 LLM 返回非标准格式（如嵌套数组、markdown 混合等）
     */
    fallbackParseVote(raw, voter) {
        try {
            // 尝试找任何包含 vote/approve/reject 的 JSON 对象
            const objMatch = raw.match(/\{[^{}]*"vote"[^{}]*\}/);
            if (objMatch) {
                const parsed = JSON.parse(objMatch[0]);
                return {
                    voter,
                    vote: parsed.vote ||
                        (String(parsed.vote ?? "").includes("approve") ? ConsensusVote.APPROVE :
                            String(parsed.vote ?? "").includes("reject") ? ConsensusVote.REJECT : ConsensusVote.ABSTAIN),
                    score: typeof parsed.score === "number" ? parsed.score : undefined,
                    comment: parsed.comment,
                };
            }
        }
        catch { /* ignore */ }
        // 最终兜底：从文本中判断倾向
        const lower = raw.toLowerCase();
        if (lower.includes("approve") || lower.includes("通过")) {
            return { voter, vote: ConsensusVote.APPROVE, score: 75 };
        }
        if (lower.includes("reject") || lower.includes("不通过")) {
            return { voter, vote: ConsensusVote.REJECT, score: 25 };
        }
        return { voter, vote: ConsensusVote.ABSTAIN };
    }
    /**
     * 综合评估投票结果
     */
    evaluateVotes(votes) {
        if (votes.length === 0) {
            return { passed: false, verdict: "NO_VOTES: 无有效投票" };
        }
        // 一致通过模式
        if (this.config.requireUnanimous) {
            const allApprove = votes.every((v) => v.vote === ConsensusVote.APPROVE);
            return {
                passed: allApprove,
                verdict: allApprove
                    ? "APPROVED: 全票通过"
                    : `REJECTED: 未达成一致 (${votes.filter((v) => v.vote !== ConsensusVote.APPROVE).map((v) => v.voter).join(", ")} 反对)`,
                dominantVote: allApprove ? "approve" : "reject",
            };
        }
        // 阈值模式：计算平均分或投票比例
        const scoredVotes = votes.filter((v) => v.score !== undefined);
        if (scoredVotes.length > 0) {
            const avgScore = scoredVotes.reduce((sum, v) => sum + (v.score ?? 0), 0) / scoredVotes.length;
            const passed = avgScore >= this.config.threshold;
            // 确定主导投票方向
            const voteCounts = { approve: 0, reject: 0, abstain: 0 };
            for (const v of votes) {
                voteCounts[v.vote]++;
            }
            const dominantVote = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0][0];
            const topScorer = [...scoredVotes].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
            return {
                passed,
                verdict: passed
                    ? `APPROVED: ${topScorer.voter} scored ${topScorer.score} (avg=${Math.round(avgScore)})`
                    : `REJECTED: avg score ${Math.round(avgScore)} < threshold ${this.config.threshold}`,
                avgScore: Math.round(avgScore),
                dominantVote,
            };
        }
        // 无分数时按投票比例
        const approveCount = votes.filter((v) => v.vote === ConsensusVote.APPROVE).length;
        const passed = (approveCount / votes.length) * 100 >= this.config.threshold;
        const voteCounts = { approve: approveCount, reject: votes.filter((v) => v.vote === ConsensusVote.REJECT).length, abstain: votes.filter((v) => v.vote === ConsensusVote.ABSTAIN).length };
        const dominantVote = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0][0];
        return {
            passed,
            verdict: passed
                ? `APPROVED: ${approveCount}/${votes.length} 票同意`
                : `REJECTED: 仅 ${approveCount}/${votes.length} 票同意`,
            dominantVote,
        };
    }
}
//# sourceMappingURL=engine.js.map