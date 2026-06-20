import type { InterrogateEngine } from "@aicos/loop-engine";
export interface InterrogationCoordinatorDeps {
    engine: InterrogateEngine;
    onStream: (content: string) => void;
    setInputLocked: (locked: boolean) => void;
    closeModal: () => void;
    getTaskId: () => string;
}
export interface InterrogationResult {
    cachedResults: Record<string, string>;
    userModificationCount: number;
}
/**
 * 拷问阶段协调器
 *
 * 封装拷问对话的状态机、Modal 渲染和输入处理，
 * 将 AICOSApp 中的拷问相关字段和方法集中到一个独立的 seam。
 */
export declare class InterrogationCoordinator {
    private engine;
    private onStream;
    private setInputLocked;
    private closeModal;
    private getTaskId;
    private activeModal;
    private resolvePromise;
    private cachedResults;
    private userModificationCount;
    constructor(deps: InterrogationCoordinatorDeps);
    get result(): InterrogationResult;
    /**
     * 启动拷问阶段，返回的 Promise 在拷问完成/取消/异常时 resolve。
     */
    start(taskInput: string): Promise<void>;
    /**
     * 处理用户在拷问阶段的输入。
     */
    handleInput(input: string): Promise<void>;
    private showNextQuestion;
    /**
     * 渲染当前拷问 Modal（供 TUI 主渲染循环调用）。
     */
    renderModal(): import("../types.js").ModalRenderResult | null;
    private finish;
    private resolve;
}
//# sourceMappingURL=interrogation-coordinator.d.ts.map