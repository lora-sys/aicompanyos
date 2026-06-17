// 拷问问题
export interface InterrogationQuestion {
  questionId: string;
  dimension: string; // 维度标签，如 "主题方向"、"目标读者"
  dimensionEmoji: string; // 如 "🔍"、"👥"
  question: string; // LLM 生成的具体问题
  hints?: string[]; // 引导性提示/示例选项
  required: boolean; // 是否必填
  answer?: string; // 用户回答
  skipped: boolean; // 用户是否跳过
}

// 拷问会话状态
export interface InterrogationSession {
  sessionId: string;
  taskId: string;
  originalInput: string;
  questions: InterrogationQuestion[];
  currentIndex: number;
  collectedContext: Record<string, string>; // 维度 -> 回答的映射
  isComplete: boolean;
  round: number; // 第几轮（支持追问）
  maxRounds: number; // 最大追问轮数，默认3
}

// LLM 调用的抽象接口（因为 pi-ai 可能不可用）
export interface LLMProvider {
  chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<string>;
}
