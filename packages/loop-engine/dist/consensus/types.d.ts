export declare enum ConsensusVote {
    APPROVE = "approve",
    REJECT = "reject",
    ABSTAIN = "abstain"
}
export interface ConsensusResult {
    passed: boolean;
    votes: Array<{
        voter: string;
        vote: ConsensusVote;
        score?: number;
        comment?: string;
        suggestions?: string[];
        error?: string;
    }>;
    round: number;
    totalRounds: number;
    /** 最终裁决描述（如 "APPROVED: Critic scored 82"） */
    verdict?: string;
    /** 平均分数 */
    avgScore?: number;
    /** 主导投票方向 */
    dominantVote?: string;
}
export interface ConsensusConfig {
    threshold: number;
    maxRounds: number;
    requireUnanimous: boolean;
    enableUIUXVoting: boolean;
}
//# sourceMappingURL=types.d.ts.map