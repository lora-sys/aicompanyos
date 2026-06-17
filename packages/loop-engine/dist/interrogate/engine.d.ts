import { LLMProvider, InterrogationSession, InterrogationQuestion } from "./types.js";
export declare class InterrogateEngine {
    private llmProvider;
    private maxQuestionsPerRound;
    private maxRounds;
    constructor(llmProvider: LLMProvider, options?: {
        maxQuestionsPerRound?: number;
        maxRounds?: number;
    });
    /**
     * 开始新一轮拷问
     * 创建 session 并调用 LLM 生成第一轮澄清问题（1-3个）
     */
    startSession(taskId: string, userInput: string): Promise<InterrogationSession>;
    /**
     * 获取当前需要展示的问题卡片数据（用于 CLI 渲染）
     */
    getCurrentQuestion(session: InterrogationSession): InterrogationQuestion | null;
    /**
     * 提交用户回答
     */
    submitAnswer(session: InterrogationSession, answer: string): Promise<InterrogationSession>;
    /**
     * 用户跳过当前问题
     */
    skipQuestion(session: InterrogationSession): InterrogationSession;
    /**
     * 回退到上一题（用于摘要确认卡的修改功能）
     */
    goBack(session: InterrogationSession): InterrogationSession;
    /**
     * 判断本轮是否完成（所有问题都已回答或跳过）
     */
    isRoundComplete(session: InterrogationSession): boolean;
    /**
     * 判断是否需要追加更多问题（LLM 判断信息是否充足）
     */
    shouldContinue(session: InterrogationSession): Promise<boolean>;
    /**
     * 如果需要继续，生成下一轮问题
     */
    generateFollowUpQuestions(session: InterrogationSession): Promise<InterrogationSession>;
    /**
     * 完成拷问，返回收集到的所有上下文
     */
    finalize(session: InterrogationSession): Record<string, string>;
    /**
     * 生成摘要确认卡数据（用于 CLI 展示）
     */
    getSummary(session: InterrogationSession): {
        totalQuestions: number;
        answered: number;
        skipped: number;
        qaPairs: Array<{
            dimension: string;
            question: string;
            answer: string;
            skipped: boolean;
        }>;
    };
}
//# sourceMappingURL=engine.d.ts.map