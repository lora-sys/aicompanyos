import { InterrogateModal } from "../components/interrogate-modal.js";
/**
 * 拷问阶段协调器
 *
 * 封装拷问对话的状态机、Modal 渲染和输入处理，
 * 将 AICOSApp 中的拷问相关字段和方法集中到一个独立的 seam。
 */
export class InterrogationCoordinator {
    engine;
    onStream;
    setInputLocked;
    closeModal;
    getTaskId;
    activeModal = null;
    resolvePromise = null;
    cachedResults = {};
    userModificationCount = 0;
    constructor(deps) {
        this.engine = deps.engine;
        this.onStream = deps.onStream;
        this.setInputLocked = deps.setInputLocked;
        this.closeModal = deps.closeModal;
        this.getTaskId = deps.getTaskId;
    }
    get result() {
        return {
            cachedResults: this.cachedResults,
            userModificationCount: this.userModificationCount,
        };
    }
    /**
     * 启动拷问阶段，返回的 Promise 在拷问完成/取消/异常时 resolve。
     */
    async start(taskInput) {
        const session = await this.engine.startSession(this.getTaskId(), taskInput);
        this.activeModal = new InterrogateModal(session, this.engine);
        this.showNextQuestion();
        this.setInputLocked(false);
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }
    /**
     * 处理用户在拷问阶段的输入。
     */
    async handleInput(input) {
        try {
            if (!this.activeModal) {
                this.resolve();
                return;
            }
            this.onStream(`> ${input}\n\n`);
            const modal = this.activeModal;
            const action = modal.handleInput(input);
            switch (action.type) {
                case "SUBMIT": {
                    const session = await this.engine.submitAnswer(modal.currentSession, action.value);
                    modal.updateSession(session);
                    if (this.engine.isRoundComplete(session)) {
                        if (await this.engine.shouldContinue(session)) {
                            const nextSession = await this.engine.generateFollowUpQuestions(session);
                            modal.updateSession(nextSession);
                            this.showNextQuestion();
                        }
                        else {
                            this.cachedResults = { ...this.engine.finalize(session) };
                            this.onStream(`\n✅ 拷问完成，收集到 ${Object.keys(this.cachedResults).length} 个上下文维度\n\n`);
                            this.finish();
                        }
                    }
                    else {
                        this.showNextQuestion();
                    }
                    break;
                }
                case "SKIP": {
                    this.onStream("*（已跳过）*\n\n");
                    const session = this.engine.skipQuestion(modal.currentSession);
                    modal.updateSession(session);
                    const rr = modal.render();
                    if (rr.type === "question" && rr.card) {
                        this.showNextQuestion();
                    }
                    else {
                        this.cachedResults = { ...this.engine.finalize(session) };
                        this.onStream("\n✅ 拷问跳过完成\n\n");
                        this.finish();
                    }
                    break;
                }
                case "CANCEL": {
                    this.onStream("*（已取消拷问）*\n\n");
                    this.finish();
                    break;
                }
                default: {
                    if (action.type === "CONFIRM") {
                        const session = modal.currentSession;
                        this.cachedResults = { ...this.engine.finalize(session) };
                        this.onStream("\n✅ 拷问确认完成\n\n");
                        this.finish();
                    }
                    else if (action.type === "NAVIGATE_TO") {
                        this.userModificationCount++;
                        this.onStream(`\n↩️ 用户选择修改第 ${action.index + 1} 个问题的回答（累计修改 ${this.userModificationCount} 次）\n\n`);
                    }
                    break;
                }
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.onStream("\n⚠️ 拷问处理错误: " + msg + " — 自动继续\n\n");
            this.finish();
        }
    }
    showNextQuestion() {
        const modal = this.activeModal;
        if (!modal)
            return;
        const renderResult = modal.render();
        if (renderResult.type === "question" && renderResult.card) {
            const card = renderResult.card;
            this.onStream(`\n**${card.dimensionEmoji} ${card.dimensionLabel}**\n\n`);
            this.onStream(`${card.promptText}\n\n`);
            if (card.hints.length > 0) {
                this.onStream(`提示: ${card.hints.slice(0, 3).join(" / ")}\n\n`);
            }
            this.onStream("*在下方输入框回答，或按 Esc 跳过*\n\n");
        }
    }
    /**
     * 渲染当前拷问 Modal（供 TUI 主渲染循环调用）。
     */
    renderModal() {
        return this.activeModal?.render() ?? null;
    }
    finish() {
        this.closeModal();
        this.setInputLocked(true);
        this.resolve();
    }
    resolve() {
        if (this.resolvePromise) {
            const resolve = this.resolvePromise;
            this.resolvePromise = null;
            setImmediate(() => resolve());
        }
    }
}
//# sourceMappingURL=interrogation-coordinator.js.map