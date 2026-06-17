// 拷问 Modal 组件
// 实现向导式单步卡片交互
/**
 * 拷问 Modal
 * 管理拷问流程的 UI 状态和交互逻辑
 * 所有渲染返回纯数据结构，由 app.ts 统一调用 TUI 渲染
 */
export class InterrogateModal {
    session;
    engine;
    currentIndex = 0;
    inputValue = "";
    /** 是否处于摘要确认模式 */
    summaryMode = false;
    /** 摘要模式下的导航索引 */
    summaryNavIndex = 0;
    constructor(session, engine) {
        this.session = session;
        this.engine = engine;
        this.currentIndex = session.currentIndex;
    }
    /**
     * 获取当前会话引用（用于外部更新）
     */
    get currentSession() {
        return this.session;
    }
    /**
     * 更新会话（由外部在调用 engine 方法后同步）
     */
    updateSession(session) {
        this.session = session;
        this.currentIndex = session.currentIndex;
    }
    /**
     * 渲染当前卡片
     * 根据当前状态返回问题卡片或摘要卡片的渲染数据
     */
    render() {
        if (this.summaryMode) {
            return this.renderSummary();
        }
        // 检查是否所有问题都已处理完毕
        if (this.currentIndex >= this.session.questions.length) {
            // 自动进入摘要模式
            this.summaryMode = true;
            return this.renderSummary();
        }
        return this.renderQuestion();
    }
    /**
     * 处理用户输入
     * 根据输入类型返回对应的动作
     */
    handleInput(input) {
        const trimmed = input.trim().toLowerCase();
        // 特殊按键处理
        switch (trimmed) {
            case "q":
                return { type: "CANCEL" };
            case "escape":
            case "esc":
                return { type: "SKIP" };
        }
        // 方向键导航（摘要模式）
        if (this.summaryMode) {
            if (trimmed === "left" || trimmed === "arrowleft") {
                return this.navigateSummary(-1);
            }
            if (trimmed === "right" || trimmed === "arrowright") {
                return this.navigateSummary(1);
            }
            if (trimmed === "enter" || trimmed === "") {
                return { type: "CONFIRM" };
            }
        }
        // 普通文本输入 → 提交回答
        if (trimmed === "enter" || trimmed === "") {
            // Enter 键提交当前输入值
            if (this.inputValue.trim()) {
                return { type: "SUBMIT", value: this.inputValue };
            }
            // 空输入时跳过
            return { type: "SKIP" };
        }
        // 文本输入：更新输入缓冲区
        this.inputValue = input;
        return { type: "SUBMIT", value: this.inputValue };
    }
    /**
     * 获取摘要确认卡数据
     */
    getSummary() {
        const engineSummary = this.engine.getSummary(this.session);
        return {
            totalQuestions: engineSummary.totalQuestions,
            qaPairs: engineSummary.qaPairs.map((pair) => ({
                dimension: pair.dimension,
                question: pair.question,
                answer: pair.answer,
                skipped: pair.skipped,
            })),
            canModify: true,
            currentIndex: this.summaryNavIndex,
        };
    }
    /**
     * 是否处于摘要确认阶段
     */
    isSummaryMode() {
        return this.summaryMode;
    }
    // ==================== 私有方法 ====================
    /**
     * 渲染问题卡片
     */
    renderQuestion() {
        const question = this.session.questions[this.currentIndex];
        if (!question) {
            // 无问题时直接进入摘要
            this.summaryMode = true;
            return this.renderSummary();
        }
        const totalQuestions = this.session.questions.length;
        const currentStep = this.currentIndex + 1;
        const card = {
            stepLabel: `🔍 拷问 · Step ${currentStep} of ${totalQuestions}`,
            progressDots: this.buildProgressDots(currentStep, totalQuestions),
            dimensionEmoji: question.dimensionEmoji,
            dimensionLabel: question.dimension,
            collectedInfo: this.buildCollectedInfo(),
            promptText: question.question,
            hints: question.hints ?? [],
            inputValue: this.inputValue,
            footerHints: "[ Enter 确认 · Esc 跳过 · q 取消 ]",
        };
        return { type: "question", card };
    }
    /**
     * 渲染摘要卡片
     */
    renderSummary() {
        return {
            type: "summary",
            summary: this.getSummary(),
        };
    }
    /**
     * 构建进度点字符串
     * 已完成 ● / 当前 ◉ / 待完成 ○
     */
    buildProgressDots(current, total) {
        const dots = [];
        const totalNum = Number(total);
        for (let i = 0; i < totalNum; i++) {
            if (i < current - 1) {
                dots.push("●"); // 已完成
            }
            else if (i === current - 1) {
                dots.push("◉"); // 当前
            }
            else {
                dots.push("○"); // 待完成
            }
        }
        return dots.join(" ");
    }
    /**
     * 构建已收集信息列表
     * 展示之前已回答问题的维度和简要内容
     */
    buildCollectedInfo() {
        const info = [];
        for (let i = 0; i < this.currentIndex; i++) {
            const q = this.session.questions[i];
            if (q && (q.answer || q.skipped)) {
                const preview = q.skipped
                    ? "(已跳过)"
                    : q.answer.length > 40
                        ? q.answer.slice(0, 40) + "..."
                        : q.answer;
                info.push(`${q.dimension}：${preview}`);
            }
        }
        return info;
    }
    /**
     * 在摘要模式下导航到指定 Q&A 对
     */
    navigateSummary(direction) {
        const totalQAPairs = this.session.questions.length;
        let newIndex = this.summaryNavIndex + direction;
        // 边界检查循环
        if (newIndex < 0)
            newIndex = totalQAPairs - 1;
        if (newIndex >= totalQAPairs)
            newIndex = 0;
        this.summaryNavIndex = newIndex;
        return { type: "NAVIGATE_TO", index: newIndex };
    }
}
//# sourceMappingURL=interrogate-modal.js.map