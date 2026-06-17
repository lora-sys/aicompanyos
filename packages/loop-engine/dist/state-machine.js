import { EventEmitter } from "node:events";
import { LoopState, } from "./types.js";
// 所有合法的状态转换映射表
const VALID_TRANSITIONS = new Map([
    [LoopState.IDLE, [LoopState.INTERROGATING]],
    [LoopState.INTERROGATING, [LoopState.PLANNING]],
    [LoopState.PLANNING, [LoopState.EXECUTING]],
    [LoopState.EXECUTING, [LoopState.VERIFYING]],
    [LoopState.VERIFYING, [LoopState.EVOLVING, LoopState.PLANNING]], // 支持正常流转和 Replan
    [LoopState.EVOLVING, [LoopState.DONE]],
    [LoopState.DONE, []], // 终态，无出边
]);
// Replan 重试上限
const MAX_RETRY_COUNT = 3;
export class LoopStateMachine {
    _state;
    _context;
    _guards = new Map();
    _onEnterHooks = new Map();
    _onExitHooks = new Map();
    /** 事件发射器，用于发布/订阅状态变更事件 */
    eventEmitter;
    constructor(context) {
        this._state = LoopState.IDLE;
        this._context = context;
        this.eventEmitter = new EventEmitter();
    }
    /** 获取当前状态 */
    get state() {
        return this._state;
    }
    /** 获取运行时上下文（只读视图） */
    get context() {
        return this._context;
    }
    /**
     * 注册转换守卫函数
     * 在执行指定转换前，所有已注册的守卫必须全部返回 true 才允许转换
     */
    registerGuard(transition, guard) {
        const key = this.transitionKey(transition.from, transition.to);
        const guards = this._guards.get(key) || [];
        guards.push(guard);
        this._guards.set(key, guards);
    }
    /**
     * 注册进入某状态的钩子函数
     * 当状态机进入目标状态时触发
     */
    onEnter(state, hook) {
        const hooks = this._onEnterHooks.get(state) || [];
        hooks.push(hook);
        this._onEnterHooks.set(state, hooks);
    }
    /**
     * 注册退出某状态的钩子函数
     * 当状态机离开源状态时触发
     */
    onExit(state, hook) {
        const hooks = this._onExitHooks.get(state) || [];
        hooks.push(hook);
        this._onExitHooks.set(state, hooks);
    }
    /**
     * 执行状态转换
     * @param to 目标状态
     * @param reason 转换原因（可选）
     * @param trigger 触发者（可选）
     * @returns 转换后的新状态
     * @throws 如果转换不合法或守卫校验失败则抛出错误
     */
    async transition(to, reason, trigger) {
        const from = this._state;
        // 1. 检查转换是否合法
        if (!this.canTransition(to)) {
            throw new Error(`非法状态转换: ${from} -> ${to}。当前状态允许的转换目标: ${this.getValidTransitions().join(", ")}`);
        }
        // 构建转换对象（用于守卫和事件）
        const transition = { from, to };
        // 2. 特殊处理：Replan 转换需要检查重试次数上限
        if (from === LoopState.VERIFYING &&
            to === LoopState.PLANNING &&
            this._context.retryCount >= MAX_RETRY_COUNT) {
            throw new Error(`Replan 转换失败：重试次数已达上限 (${MAX_RETRY_COUNT})，当前 retryCount=${this._context.retryCount}`);
        }
        // 3. 执行该转换注册的所有 Guard 函数，全部通过才允许转换
        const guardKey = this.transitionKey(from, to);
        const guards = this._guards.get(guardKey) || [];
        for (const guard of guards) {
            const result = await guard(transition, this._context);
            if (result === false) {
                throw new Error(`状态转换被守卫拦截: ${from} -> ${to}`);
            }
        }
        // 4. 构建状态变更事件
        const event = {
            previousState: from,
            nextState: to,
            timestamp: new Date(),
            reason,
            trigger,
        };
        // 5. 触发 onExit 钩子（旧状态）
        const exitHooks = this._onExitHooks.get(from) || [];
        for (const hook of exitHooks) {
            await hook(event, this._context);
        }
        // 6. 更新状态
        this._state = to;
        // 7. 触发 onEnter 钩子（新状态）
        const enterHooks = this._onEnterHooks.get(to) || [];
        for (const hook of enterHooks) {
            await hook(event, this._context);
        }
        // 8. 发出 StateChangeEvent 事件
        this.eventEmitter.emit("stateChange", event);
        return this._state;
    }
    /**
     * 检查从当前状态到目标状态的转换是否合法
     */
    canTransition(to) {
        const validTargets = VALID_TRANSITIONS.get(this._state);
        return validTargets?.includes(to) ?? false;
    }
    /**
     * 获取从当前状态可到达的所有合法目标状态
     */
    getValidTransitions() {
        return VALID_TRANSITIONS.get(this._state) || [];
    }
    /**
     * 重置状态机到初始状态（IDLE）
     * 清除所有注册的守卫和钩子
     */
    reset() {
        this._state = LoopState.IDLE;
        this._guards.clear();
        this._onEnterHooks.clear();
        this._onExitHooks.clear();
        this.eventEmitter.removeAllListeners();
    }
    /**
     * 生成转换的唯一键值（用于 Map 存储）
     */
    transitionKey(from, to) {
        return `${from}->${to}`;
    }
}
//# sourceMappingURL=state-machine.js.map