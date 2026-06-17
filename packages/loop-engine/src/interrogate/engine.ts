import {
  LLMProvider,
  InterrogationSession,
  InterrogationQuestion,
} from "./types.js";
import {
  INTERROGATE_SYSTEM_PROMPT,
  buildQuestionGenerationPrompt,
  buildSufficiencyCheckPrompt,
  buildFollowUpPrompt,
} from "./prompts.js";
import { z } from "zod";
import {
  LLMStructuredOutput,
  FallbackStrategy,
  createLLMParser,
  type ParseResult,
} from "../utils/llm-structured-output.js";

// 生成唯一 ID 的辅助函数
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Zod Schema: 单个问题（原始格式，LLM 可能返回多种字段名）
const rawQuestionSchema = z.object({
  dimension: z.string().optional(),
  field: z.string().optional(),
  dimensionEmoji: z.string().optional(),
  emoji: z.string().optional(),
  question: z.string().optional(),
  q: z.string().optional(),
  hints: z.array(z.unknown()).optional(),
  options: z.array(z.unknown()).optional(),
  examples: z.array(z.unknown()).optional(),
  required: z.boolean().optional(),
});

// Zod Schema: 问题数组或包装对象
const questionsResponseSchema = z.union([
  z.array(rawQuestionSchema),
  z.object({ questions: z.array(rawQuestionSchema) }),
  rawQuestionSchema, // 单问题对象
]);

// Zod Schema: 充分性检查
const sufficiencySchema = z.object({
  sufficient: z.boolean().optional(),
});

// 解析器实例：复用四级回退提取 + Zod 验证
const questionParser = createLLMParser({
  schema: questionsResponseSchema,
  fallback: [] as z.infer<typeof questionsResponseSchema>,
  strategy: FallbackStrategy.RETURN_FALLBACK,
  logPrefix: "InterrogateEngine.parseQuestions",
});

const sufficiencyParser = createLLMParser({
  schema: sufficiencySchema,
  fallback: { sufficient: true },
  strategy: FallbackStrategy.RETURN_FALLBACK,
  logPrefix: "InterrogateEngine.shouldContinue",
});

/**
 * 从 LLM 返回的文本中解析问题列表
 * 使用 LLMStructuredOutput 统一提取+验证，然后映射为 InterrogationQuestion[]
 */
function parseQuestions(raw: string): InterrogationQuestion[] {
  const result: ParseResult<z.infer<typeof questionsResponseSchema>> = questionParser.parse(raw);

  if (result.success) {
    // 标准化为数组
    const items: Record<string, unknown>[] = normalizeToArray(result.data);
    return items.map((item, index) => ({
      questionId: generateId(),
      dimension: String(item.dimension || item.field || `维度${index + 1}`),
      dimensionEmoji: String(item.dimensionEmoji || item.emoji || getEmojiForDimension(String(item.dimension || ""))),
      question: String(item.question || item.q || ""),
      hints: Array.isArray(item.hints)
        ? (item.hints as unknown[]).map((h) => String(h))
        : Array.isArray(item.options)
          ? (item.options as unknown[]).map((h) => String(h))
          : Array.isArray(item.examples)
            ? (item.examples as unknown[]).map((h) => String(h))
            : undefined,
      required: Boolean(item.required ?? true),
      skipped: false,
    }));
  }

  // Zod 解析失败 → 最终兜底：按行文本解析
  const lineParsed = parseLinesAsQuestions(raw.trim());
  if (lineParsed.length > 0) return lineParsed;

  console.warn(`[InterrogateEngine] 无法从 LLM 响应中解析问题: ${result.error}`);
  return [];
}

/** 将 union schema 的结果统一归一化为数组 */
function normalizeToArray(
  data: z.infer<typeof questionsResponseSchema>
): Record<string, unknown>[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as Record<string, unknown>).questions)) {
    return (data as { questions: Record<string, unknown>[] }).questions;
  }
  // 单对象包装为数组
  return [data as Record<string, unknown>];
}

function getEmojiForDimension(dimension: string): string {
  const lower = dimension.toLowerCase();
  if (lower.includes("主题") || lower.includes("topic") || lower.includes("方向")) return "📌";
  if (lower.includes("读者") || lower.includes("目标") || lower.includes("audience")) return "👥";
  if (lower.includes("风格") || lower.includes("style")) return "🎨";
  if (lower.includes("格式") || lower.includes("format")) return "📋";
  if (lower.includes("长度") || lower.includes("字数")) return "📏";
  return "❓";
}

// 从多行文本中尝试解析为问题列表
function parseLinesAsQuestions(text: string): InterrogationQuestion[] {
  const questions: InterrogationQuestion[] = [];
  const lines = text.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    // 匹配 "1." / "Q:" / "- " / "* " 开头的行
    if (/^\d+[\.\、]/.test(trimmed) || /^[Qq][\:\：]/.test(trimmed) || /^[-*]\s/.test(trimmed)) {
      const questionText = trimmed.replace(/^\d+[\.\、]\s*/, "").replace(/^[Qq][\:\：]\s*/, "").replace(/^[-*]\s*/, "");
      if (questionText.length > 3) {
        questions.push({
          questionId: generateId(),
          dimension: `维度${questions.length + 1}`,
          dimensionEmoji: "❓",
          question: questionText,
          hints: undefined,
          required: true,
          skipped: false,
        });
      }
    }
  }

  return questions;
}

export class InterrogateEngine {
  private llmProvider: LLMProvider;
  private maxQuestionsPerRound: number;
  private maxRounds: number;

  constructor(
    llmProvider: LLMProvider,
    options?: { maxQuestionsPerRound?: number; maxRounds?: number }
  ) {
    this.llmProvider = llmProvider;
    this.maxQuestionsPerRound = options?.maxQuestionsPerRound ?? 3;
    this.maxRounds = options?.maxRounds ?? 3;
  }

  /**
   * 开始新一轮拷问
   * 创建 session 并调用 LLM 生成第一轮澄清问题（1-3个）
   */
  async startSession(
    taskId: string,
    userInput: string
  ): Promise<InterrogationSession> {
    const response = await this.llmProvider.chat([
      { role: "system", content: INTERROGATE_SYSTEM_PROMPT },
      { role: "user", content: buildQuestionGenerationPrompt(userInput) },
    ]);

    const questions = parseQuestions(response).slice(0, this.maxQuestionsPerRound);

    const session: InterrogationSession = {
      sessionId: generateId(),
      taskId,
      originalInput: userInput,
      questions,
      currentIndex: 0,
      collectedContext: {},
      isComplete: false,
      round: 1,
      maxRounds: this.maxRounds,
    };

    return session;
  }

  /**
   * 获取当前需要展示的问题卡片数据（用于 CLI 渲染）
   */
  getCurrentQuestion(session: InterrogationSession): InterrogationQuestion | null {
    if (session.currentIndex >= session.questions.length) return null;
    return session.questions[session.currentIndex];
  }

  /**
   * 提交用户回答
   */
  async submitAnswer(
    session: InterrogationSession,
    answer: string
  ): Promise<InterrogationSession> {
    const updated = { ...session };
    const questions = [...updated.questions];
    const current = { ...questions[updated.currentIndex] };

    current.answer = answer;
    questions[updated.currentIndex] = current;
    updated.questions = questions;

    // 记录到 collectedContext
    updated.collectedContext = {
      ...updated.collectedContext,
      [current.dimension]: answer,
    };

    // 推进到下一题
    updated.currentIndex += 1;

    return updated;
  }

  /**
   * 用户跳过当前问题
   */
  skipQuestion(session: InterrogationSession): InterrogationSession {
    const updated = { ...session };
    const questions = [...updated.questions];
    const current = { ...questions[updated.currentIndex] };

    current.skipped = true;
    questions[updated.currentIndex] = current;
    updated.questions = questions;
    updated.currentIndex += 1;

    return updated;
  }

  /**
   * 回退到上一题（用于摘要确认卡的修改功能）
   */
  goBack(session: InterrogationSession): InterrogationSession {
    if (session.currentIndex <= 0) return session;

    const updated = { ...session };
    updated.currentIndex -= 1;

    // 清除该题的已有回答/跳过状态，让用户重新输入
    const questions = [...updated.questions];
    const prev = { ...questions[updated.currentIndex] };
    prev.answer = undefined;
    prev.skipped = false;
    questions[updated.currentIndex] = prev;
    updated.questions = questions;

    return updated;
  }

  /**
   * 判断本轮是否完成（所有问题都已回答或跳过）
   */
  isRoundComplete(session: InterrogationSession): boolean {
    return session.currentIndex >= session.questions.length;
  }

  /**
   * 判断是否需要追加更多问题（LLM 判断信息是否充足）
   */
  async shouldContinue(session: InterrogationSession): Promise<boolean> {
    // 已达最大轮次则不再追问
    if (session.round >= session.maxRounds) return false;

    const response = await this.llmProvider.chat([
      { role: "system", content: INTERROGATE_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildSufficiencyCheckPrompt(
          session.collectedContext,
          session.originalInput
        ),
      },
    ]);

    try {
      const result = sufficiencyParser.parse(response);
      // sufficient=false 表示需要继续追问；解析失败默认不继续
      return !result.success || result.data.sufficient === false;
    } catch {
      // 解析失败时默认不继续追问
      return false;
    }
  }

  /**
   * 如果需要继续，生成下一轮问题
   */
  async generateFollowUpQuestions(
    session: InterrogationSession
  ): Promise<InterrogationSession> {
    // 构建前几轮问答的文本摘要
    const previousAnswers = session.questions
      .map((q) => `[${q.dimension}] ${q.question} → ${q.answer ?? "(跳过)"}`)
      .join("\n");

    const response = await this.llmProvider.chat([
      { role: "system", content: INTERROGATE_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildFollowUpPrompt(
          session.collectedContext,
          session.originalInput,
          previousAnswers
        ),
      },
    ]);

    const newQuestions = parseQuestions(response).slice(
      0,
      this.maxQuestionsPerRound
    );

    // 如果没有新问题，直接标记完成
    if (newQuestions.length === 0) {
      return { ...session, isComplete: true };
    }

    const updated = { ...session };
    updated.round += 1;
    updated.questions = [...updated.questions, ...newQuestions];
    // currentIndex 已经指向本轮末尾之后，自然衔接新问题

    return updated;
  }

  /**
   * 完成拷问，返回收集到的所有上下文
   */
  finalize(session: InterrogationSession): Record<string, string> {
    // 过滤掉空值和跳过的项
    const context: Record<string, string> = {};
    for (const [key, value] of Object.entries(session.collectedContext)) {
      if (value && value.trim()) {
        context[key] = value;
      }
    }
    return context;
  }

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
  } {
    let answered = 0;
    let skipped = 0;
    const qaPairs = session.questions.map((q) => {
      if (q.skipped) skipped++;
      else if (q.answer) answered++;

      return {
        dimension: q.dimension,
        question: q.question,
        answer: q.answer ?? "",
        skipped: q.skipped,
      };
    });

    return {
      totalQuestions: session.questions.length,
      answered,
      skipped,
      qaPairs,
    };
  }
}
