// 共识投票枚举
export enum ConsensusVote {
  APPROVE = "approve",
  REJECT = "reject",
  ABSTAIN = "abstain",
}

// 共识结果
export interface ConsensusResult {
  passed: boolean;
  votes: Array<{
    voter: string; // Agent 名称
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

// 共识锁配置
export interface ConsensusConfig {
  threshold: number; // 通过阈值分数 0-100
  maxRounds: number; // 最大轮次
  requireUnanimous: boolean; // 是否需要一致通过
  enableUIUXVoting: boolean; // 是否启用 UI-UX Agent 投票
}
