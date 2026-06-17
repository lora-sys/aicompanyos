import { EventEmitter } from "node:events";
import { LoopState, StateTransition, TransitionGuard, StateHook, LoopContext } from "./types.js";
export declare class LoopStateMachine {
    private _state;
    private readonly _context;
    private readonly _guards;
    private readonly _onEnterHooks;
    private readonly _onExitHooks;
    /** 事件发射器，用于发布/订阅状态变更事件 */
    readonly eventEmitter: EventEmitter;
    constructor(context: LoopContext);
    /** 获取当前状态 */
    get state(): LoopState;
    /** 获取运行时上下文（只读视图） */
    get context(): Readonly<LoopContext>;
    /**
     * 注册转换守卫函数
     * 在执行指定转换前，所有已注册的守卫必须全部返回 true 才允许转换
     */
    registerGuard(transition: StateTransition, guard: TransitionGuard): void;
    /**
     * 注册进入某状态的钩子函数
     * 当状态机进入目标状态时触发
     */
    onEnter(state: LoopState, hook: StateHook): void;
    /**
     * 注册退出某状态的钩子函数
     * 当状态机离开源状态时触发
     */
    onExit(state: LoopState, hook: StateHook): void;
    /**
     * 执行状态转换
     * @param to 目标状态
     * @param reason 转换原因（可选）
     * @param trigger 触发者（可选）
     * @returns 转换后的新状态
     * @throws 如果转换不合法或守卫校验失败则抛出错误
     */
    transition(to: LoopState, reason?: string, trigger?: string): Promise<LoopState>;
    /**
     * 检查从当前状态到目标状态的转换是否合法
     */
    canTransition(to: LoopState): boolean;
    /**
     * 获取从当前状态可到达的所有合法目标状态
     */
    getValidTransitions(): LoopState[];
    /**
     * 重置状态机到初始状态（IDLE）
     * 清除所有注册的守卫和钩子
     */
    reset(): void;
    /**
     * 生成转换的唯一键值（用于 Map 存储）
     */
    private transitionKey;
}
//# sourceMappingURL=state-machine.d.ts.map