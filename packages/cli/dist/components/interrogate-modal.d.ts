import type { InterrogationSession, InterrogateEngine } from "@aicos/loop-engine/interrogate";
import type { ModalRenderResult, ModalAction, SummaryCardData } from "../types.js";
/**
 * 拷问 Modal
 * 管理拷问流程的 UI 状态和交互逻辑
 * 所有渲染返回纯数据结构，由 app.ts 统一调用 TUI 渲染
 */
export declare class InterrogateModal {
    private session;
    private engine;
    private currentIndex;
    private inputValue;
    /** 是否处于摘要确认模式 */
    private summaryMode;
    /** 摘要模式下的导航索引 */
    private summaryNavIndex;
    constructor(session: InterrogationSession, engine: InterrogateEngine);
    /**
     * 获取当前会话引用（用于外部更新）
     */
    get currentSession(): InterrogationSession;
    /**
     * 更新会话（由外部在调用 engine 方法后同步）
     */
    updateSession(session: InterrogationSession): void;
    /**
     * 渲染当前卡片
     * 根据当前状态返回问题卡片或摘要卡片的渲染数据
     */
    render(): ModalRenderResult;
    /**
     * 处理用户输入
     * 根据输入类型返回对应的动作
     */
    handleInput(input: string): ModalAction;
    /**
     * 获取摘要确认卡数据
     */
    getSummary(): SummaryCardData;
    /**
     * 是否处于摘要确认阶段
     */
    isSummaryMode(): boolean;
    /**
     * 渲染问题卡片
     */
    private renderQuestion;
    /**
     * 渲染摘要卡片
     */
    private renderSummary;
    /**
     * 构建进度点字符串
     * 已完成 ● / 当前 ◉ / 待完成 ○
     */
    private buildProgressDots;
    /**
     * 构建已收集信息列表
     * 展示之前已回答问题的维度和简要内容
     */
    private buildCollectedInfo;
    /**
     * 在摘要模式下导航到指定 Q&A 对
     */
    private navigateSummary;
}
//# sourceMappingURL=interrogate-modal.d.ts.map