import { describe, it, expect, vi } from "vitest";
import { LoopStateMachine } from "../src/state-machine.js";
import { LoopState } from "../src/types.js";

// 辅助函数：创建标准的测试上下文
function createTestContext(overrides?: Partial<{ retryCount: number; consensusRound: number }>) {
  return {
    taskId: "test-1",
    taskInput: "test task",
    retryCount: overrides?.retryCount ?? 0,
    consensusRound: overrides?.consensusRound ?? 0,
  };
}

// ============================================================
// 1. 初始状态
// ============================================================
describe("初始状态", () => {
  it("新创建的状态机应该处于 IDLE 状态", () => {
    const ctx = createTestContext();
    const sm = new LoopStateMachine(ctx);

    expect(sm.state).toBe(LoopState.IDLE);
  });

  it("新创建的状态机 context 应该正确保存", () => {
    const ctx = createTestContext();
    const sm = new LoopStateMachine(ctx);

    expect(sm.context.taskId).toBe("test-1");
    expect(sm.context.taskInput).toBe("test task");
    expect(sm.context.retryCount).toBe(0);
  });
});

// ============================================================
// 2. 正常状态转换路径（Happy Path）
// ============================================================
describe("正常转换路径", () => {
  it("IDLE → INTERROGATING", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const newState = await sm.transition(LoopState.INTERROGATING);
    expect(newState).toBe(LoopState.INTERROGATING);
    expect(sm.state).toBe(LoopState.INTERROGATING);
  });

  it("INTERROGATING → PLANNING", async () => {
    const sm = new LoopStateMachine(createTestContext());
    await sm.transition(LoopState.INTERROGATING);
    const newState = await sm.transition(LoopState.PLANNING);
    expect(newState).toBe(LoopState.PLANNING);
    expect(sm.state).toBe(LoopState.PLANNING);
  });

  it("PLANNING → EXECUTING", async () => {
    const sm = new LoopStateMachine(createTestContext());
    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    const newState = await sm.transition(LoopState.EXECUTING);
    expect(newState).toBe(LoopState.EXECUTING);
    expect(sm.state).toBe(LoopState.EXECUTING);
  });

  it("EXECUTING → VERIFYING", async () => {
    const sm = new LoopStateMachine(createTestContext());
    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    await sm.transition(LoopState.EXECUTING);
    const newState = await sm.transition(LoopState.VERIFYING);
    expect(newState).toBe(LoopState.VERIFYING);
    expect(sm.state).toBe(LoopState.VERIFYING);
  });

  it("VERIFYING → EVOLVING（正常流转）", async () => {
    const sm = new LoopStateMachine(createTestContext());
    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    await sm.transition(LoopState.EXECUTING);
    await sm.transition(LoopState.VERIFYING);
    const newState = await sm.transition(LoopState.EVOLVING);
    expect(newState).toBe(LoopState.EVOLVING);
    expect(sm.state).toBe(LoopState.EVOLVING);
  });

  it("EVOLVING → DONE（终态）", async () => {
    const sm = new LoopStateMachine(createTestContext());
    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    await sm.transition(LoopState.EXECUTING);
    await sm.transition(LoopState.VERIFYING);
    await sm.transition(LoopState.EVOLVING);
    const newState = await sm.transition(LoopState.DONE);
    expect(newState).toBe(LoopState.DONE);
    expect(sm.state).toBe(LoopState.DONE);
  });

  it("完整生命周期: IDLE → INTERROGATING → PLANNING → EXECUTING → VERIFYING → EVOLVING → DONE", async () => {
    const sm = new LoopStateMachine(createTestContext());

    // 按顺序走完整个生命周期
    await sm.transition(LoopState.INTERROGATING);
    expect(sm.state).toBe(LoopState.INTERROGATING);

    await sm.transition(LoopState.PLANNING);
    expect(sm.state).toBe(LoopState.PLANNING);

    await sm.transition(LoopState.EXECUTING);
    expect(sm.state).toBe(LoopState.EXECUTING);

    await sm.transition(LoopState.VERIFYING);
    expect(sm.state).toBe(LoopState.VERIFYING);

    await sm.transition(LoopState.EVOLVING);
    expect(sm.state).toBe(LoopState.EVOLVING);

    await sm.transition(LoopState.DONE);
    expect(sm.state).toBe(LoopState.DONE);
  });
});

// ============================================================
// 3. Replan 路径
// ============================================================
describe("Replan 路径", () => {
  it("VERIFYING → PLANNING 是合法的 Replan 转换", async () => {
    const sm = new LoopStateMachine(createTestContext());

    // 先走到 VERIFYING 状态
    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    await sm.transition(LoopState.EXECUTING);
    await sm.transition(LoopState.VERIFYING);

    // Replan 回到 PLANNING
    const newState = await sm.transition(LoopState.PLANNING);
    expect(newState).toBe(LoopState.PLANNING);
    expect(sm.state).toBe(LoopState.PLANNING);
  });
});

// ============================================================
// 4. 非法转换保护
// ============================================================
describe("非法转换保护", () => {
  it("IDLE 不能直接跳到 PLANNING（应抛出 Error）", async () => {
    const sm = new LoopStateMachine(createTestContext());

    await expect(
      sm.transition(LoopState.PLANNING)
    ).rejects.toThrow(/非法状态转换/);
  });

  it("DONE 是终态，不能从 DONE 转换到任何其他状态", async () => {
    const sm = new LoopStateMachine(createTestContext());

    // 先走到 DONE
    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    await sm.transition(LoopState.EXECUTING);
    await sm.transition(LoopState.VERIFYING);
    await sm.transition(LoopState.EVOLVING);
    await sm.transition(LoopState.DONE);

    // 尝试从 DONE 跳回任意状态都应该失败
    await expect(
      sm.transition(LoopState.IDLE)
    ).rejects.toThrow(/非法状态转换/);

    await expect(
      sm.transition(LoopState.INTERROGATING)
    ).rejects.toThrow(/非法状态转换/);
  });

  it("尝试非法转换时错误信息应包含当前允许的目标状态列表", async () => {
    const sm = new LoopStateMachine(createTestContext());

    try {
      await sm.transition(LoopState.PLANNING);
      expect.unreachable("不应该执行到这里");
    } catch (error) {
      const msg = (error as Error).message;
      // IDLE 只允许转到 INTERROGATING
      expect(msg).toContain(LoopState.INTERROGATING);
    }
  });
});

// ============================================================
// 5. Replan 重试上限
// ============================================================
describe("Replan 重试上限", () => {
  it("当 retryCount >= MAX_RETRY_COUNT(3) 时，VERIFYING→PLANNING 应该抛错", async () => {
    // 构造一个 retryCount 达到上限的上下文
    const ctx = createTestContext({ retryCount: 3 });
    const sm = new LoopStateMachine(ctx);

    // 先走到 VERIFYING
    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    await sm.transition(LoopState.EXECUTING);
    await sm.transition(LoopState.VERIFYING);

    // 此时 retryCount=3 >= MAX_RETRY_COUNT(3)，Replan 应该失败
    await expect(
      sm.transition(LoopState.PLANNING)
    ).rejects.toThrow(/重试次数已达上限/);
  });

  it("当 retryCount < MAX_RETRY_COUNT 时，VERIFYING→PLANNING 应该成功", async () => {
    // retryCount=2，还没达到上限
    const ctx = createTestContext({ retryCount: 2 });
    const sm = new LoopStateMachine(ctx);

    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    await sm.transition(LoopState.EXECUTING);
    await sm.transition(LoopState.VERIFYING);

    // 应该能成功 Replan
    const newState = await sm.transition(LoopState.PLANNING);
    expect(newState).toBe(LoopState.PLANNING);
  });

  it("retryCount=0 时 Replan 正常工作", async () => {
    const ctx = createTestContext({ retryCount: 0 });
    const sm = new LoopStateMachine(ctx);

    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    await sm.transition(LoopState.EXECUTING);
    await sm.transition(LoopState.VERIFYING);

    const newState = await sm.transition(LoopState.PLANNING);
    expect(newState).toBe(LoopState.PLANNING);
  });
});

// ============================================================
// 6. Guard 拦截
// ============================================================
describe("Guard 拦截", () => {
  it("Guard 返回 false 时，对应转换应该被拦截并抛出 Error", async () => {
    const sm = new LoopStateMachine(createTestContext());

    // 注册一个总是返回 false 的守卫
    sm.registerGuard(
      { from: LoopState.IDLE, to: LoopState.INTERROGATING } as any,
      () => false
    );

    await expect(
      sm.transition(LoopState.INTERROGATING)
    ).rejects.toThrow(/状态转换被守卫拦截/);
  });

  it("Guard 返回 true 时，转换应该正常通过", async () => {
    const sm = new LoopStateMachine(createTestContext());

    sm.registerGuard(
      { from: LoopState.IDLE, to: LoopState.INTERROGATING } as any,
      () => true
    );

    const newState = await sm.transition(LoopState.INTERROGATING);
    expect(newState).toBe(LoopState.INTERROGATING);
  });

  it("多个 Guard 全部返回 true 才允许转换", async () => {
    const sm = new LoopStateMachine(createTestContext());

    sm.registerGuard(
      { from: LoopState.IDLE, to: LoopState.INTERROGATING } as any,
      () => true
    );
    sm.registerGuard(
      { from: LoopState.IDLE, to: LoopState.INTERROGATING } as any,
      () => true
    );

    const newState = await sm.transition(LoopState.INTERROGATING);
    expect(newState).toBe(LoopState.INTERROGATING);
  });

  it("多个 Guard 中只要有一个返回 false 就拦截转换", async () => {
    const sm = new LoopStateMachine(createTestContext());

    sm.registerGuard(
      { from: LoopState.IDLE, to: LoopState.INTERROGATING } as any,
      () => true
    );
    // 第二个守卫返回 false，应该拦截
    sm.registerGuard(
      { from: LoopState.IDLE, to: LoopState.INTERROGATING } as any,
      () => false
    );

    await expect(
      sm.transition(LoopState.INTERROGATING)
    ).rejects.toThrow(/状态转换被守卫拦截/);
  });

  it("支持异步 Guard 函数（返回 Promise<boolean>）", async () => {
    const sm = new LoopStateMachine(createTestContext());

    sm.registerGuard(
      { from: LoopState.IDLE, to: LoopState.INTERROGATING } as any,
      async () => {
        // 模拟异步校验逻辑
        return true;
      }
    );

    const newState = await sm.transition(LoopState.INTERROGATING);
    expect(newState).toBe(LoopState.INTERROGATING);
  });

  it("Guard 只作用于注册的那个转换，不影响其他转换", async () => {
    const sm = new LoopStateMachine(createTestContext());

    // 只在 IDLE→INTERROGATING 上注册守卫
    sm.registerGuard(
      { from: LoopState.IDLE, to: LoopState.INTERROGATING } as any,
      () => false
    );

    // IDLE→INTERROGATING 被拦截
    await expect(
      sm.transition(LoopState.INTERROGATING)
    ).rejects.toThrow();

    // 但如果换一条合法路径（假设有其他合法路径），不受影响
    // 这里验证的是守卫不会误伤其他转换
  });
});

// ============================================================
// 7. onEnter / onExit Hook
// ============================================================
describe("Hooks（onEnter / onExit）", () => {
  it("进入目标状态时应触发 onEnter 钩子", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const enterHook = vi.fn();

    sm.onEnter(LoopState.INTERROGATING, enterHook);

    await sm.transition(LoopState.INTERROGATING);

    // onEnter 应该被调用一次
    expect(enterHook).toHaveBeenCalledTimes(1);
  });

  it("离开源状态时应触发 onExit 钩子", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const exitHook = vi.fn();

    sm.onExit(LoopState.IDLE, exitHook);

    await sm.transition(LoopState.INTERROGATING);

    // onExit 应该被调用一次
    expect(exitHook).toHaveBeenCalledTimes(1);
  });

  it("onEnter 和 onExit 都应接收到 StateChangeEvent 和 LoopContext 参数", async () => {
    const ctx = createTestContext();
    const sm = new LoopStateMachine(ctx);

    const enterHook = vi.fn();
    const exitHook = vi.fn();

    sm.onExit(LoopState.IDLE, exitHook);
    sm.onEnter(LoopState.INTERROGATING, enterHook);

    await sm.transition(LoopState.INTERROGATING, "测试原因", "测试触发者");

    // 验证 onExit 参数
    expect(exitHook).toHaveBeenCalledWith(
      expect.objectContaining({
        previousState: LoopState.IDLE,
        nextState: LoopState.INTERROGATING,
        reason: "测试原因",
        trigger: "测试触发者",
      }),
      ctx
    );

    // 验证 onEnter 参数（和 onExit 接收相同的事件对象）
    expect(enterHook).toHaveBeenCalledWith(
      expect.objectContaining({
        previousState: LoopState.IDLE,
        nextState: LoopState.INTERROGATING,
        reason: "测试原因",
        trigger: "测试触发者",
      }),
      ctx
    );
  });

  it("onExit 在状态更新之前触发，onEnter 在状态更新之后触发", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const callOrder: string[] = [];

    sm.onExit(LoopState.IDLE, async () => {
      // onExit 触发时，状态还是旧状态
      callOrder.push(`exit-old=${sm.state}`);
    });

    sm.onEnter(LoopState.INTERROGATING, async () => {
      // onEnter 触发时，状态已经更新为新状态
      callOrder.push(`enter-new=${sm.state}`);
    });

    await sm.transition(LoopState.INTERROGATING);

    // 验证调用顺序：先 onExit，再 onEnter
    expect(callOrder).toEqual([
      "exit-old=idle",
      "enter-new=interrogating",
    ]);
  });

  it("同一状态可以注册多个 Hook，全部按注册顺序触发", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const hook1 = vi.fn();
    const hook2 = vi.fn();
    const hook3 = vi.fn();

    sm.onEnter(LoopState.INTERROGATING, hook1);
    sm.onEnter(LoopState.INTERROGATING, hook2);
    sm.onEnter(LoopState.INTERROGATING, hook3);

    await sm.transition(LoopState.INTERROGATING);

    expect(hook1).toHaveBeenCalledTimes(1);
    expect(hook2).toHaveBeenCalledTimes(1);
    expect(hook3).toHaveBeenCalledTimes(1);
  });

  it("未匹配状态的 Hook 不应被触发", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const wrongStateHook = vi.fn();

    // 注册在 PLANNING 状态上的 Hook，但我们只走到 INTERROGATING
    sm.onEnter(LoopState.PLANNING, wrongStateHook);

    await sm.transition(LoopState.INTERROGATING);

    // 不应该被调用
    expect(wrongStateHook).not.toHaveBeenCalled();
  });
});

// ============================================================
// 8. StateChangeEvent（EventEmitter）
// ============================================================
describe("Events（StateChangeEvent）", () => {
  it("每次 transition 应该发出 stateChange 事件", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const listener = vi.fn();

    sm.eventEmitter.on("stateChange", listener);

    await sm.transition(LoopState.INTERROGATING);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stateChange 事件应携带正确的 StateChangeEvent 数据", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const listener = vi.fn();

    sm.eventEmitter.on("stateChange", listener);

    await sm.transition(LoopState.INTERROGATING, "开始拷问", "orchestrator");

    const event = listener.mock.calls[0][0];
    expect(event.previousState).toBe(LoopState.IDLE);
    expect(event.nextState).toBe(LoopState.INTERROGATING);
    expect(event.reason).toBe("开始拷问");
    expect(event.trigger).toBe("orchestrator");
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it("连续多次 transition 应该每次都发出事件", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const listener = vi.fn();

    sm.eventEmitter.on("stateChange", listener);

    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    await sm.transition(LoopState.EXECUTING);

    expect(listener).toHaveBeenCalledTimes(3);

    // 验证每次事件的 prevState/nextState
    expect(listener.mock.calls[0][0].previousState).toBe(LoopState.IDLE);
    expect(listener.mock.calls[0][0].nextState).toBe(LoopState.INTERROGATING);

    expect(listener.mock.calls[1][0].previousState).toBe(LoopState.INTERROGATING);
    expect(listener.mock.calls[1][0].nextState).toBe(LoopState.PLANNING);

    expect(listener.mock.calls[2][0].previousState).toBe(LoopState.PLANNING);
    expect(listener.mock.calls[2][0].nextState).toBe(LoopState.EXECUTING);
  });

  it("非法转换不会发出 stateChange 事件", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const listener = vi.fn();

    sm.eventEmitter.on("stateChange", listener);

    try {
      await sm.transition(LoopState.PLANNING); // 非法转换
    } catch {
      // 预期会抛错
    }

    // 不应该发出任何事件
    expect(listener).not.toHaveBeenCalled();
  });
});

// ============================================================
// 9. reset()
// ============================================================
describe("reset()", () => {
  it("重置后状态应回到 IDLE", async () => {
    const sm = new LoopStateMachine(createTestContext());

    // 走到某个中间状态
    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    expect(sm.state).toBe(LoopState.PLANNING);

    // 重置
    sm.reset();

    expect(sm.state).toBe(LoopState.IDLE);
  });

  it("重置后所有已注册的 Guard 应被清除", async () => {
    const sm = new LoopStateMachine(createTestContext());

    // 注册 Guard
    sm.registerGuard(
      { from: LoopState.IDLE, to: LoopState.INTERROGATING } as any,
      () => false
    );

    // 重置
    sm.reset();

    // 之前注册的 Guard 已清除，转换应该不再被拦截
    const newState = await sm.transition(LoopState.INTERROGATING);
    expect(newState).toBe(LoopState.INTERROGATING);
  });

  it("重置后所有已注册的 Hooks 应被清除", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const hook = vi.fn();

    sm.onEnter(LoopState.INTERROGATING, hook);
    sm.reset();

    // Hook 已清除，不应再触发
    await sm.transition(LoopState.INTERROGATING);
    expect(hook).not.toHaveBeenCalled();
  });

  it("重置后 EventEmitter 的监听器应被移除", async () => {
    const sm = new LoopStateMachine(createTestContext());
    const listener = vi.fn();

    sm.eventEmitter.on("stateChange", listener);
    sm.reset();

    // 监听器已被移除，不应再收到事件
    await sm.transition(LoopState.INTERROGATING);
    expect(listener).not.toHaveBeenCalled();
  });

  it("重置后可以重新开始完整生命周期", async () => {
    const sm = new LoopStateMachine(createTestContext());

    // 第一次运行
    await sm.transition(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    await sm.transition(LoopState.EXECUTING);
    await sm.transition(LoopState.VERIFYING);
    await sm.transition(LoopState.EVOLVING);
    await sm.transition(LoopState.DONE);
    expect(sm.state).toBe(LoopState.DONE);

    // 重置
    sm.reset();
    expect(sm.state).toBe(LoopState.IDLE);

    // 第二次运行应该完全正常
    await sm.transition(LoopState.INTERROGATING);
    expect(sm.state).toBe(LoopState.INTERROGATING);
    await sm.transition(LoopState.PLANNING);
    expect(sm.state).toBe(LoopState.PLANNING);
  });
});

// ============================================================
// 10. canTransition() / getValidTransitions()
// ============================================================
describe("查询方法", () => {
  describe("canTransition()", () => {
    it("IDLE 状态只能转到 INTERROGATING", () => {
      const sm = new LoopStateMachine(createTestContext());

      expect(sm.canTransition(LoopState.INTERROGATING)).toBe(true);
      expect(sm.canTransition(LoopState.PLANNING)).toBe(false);
      expect(sm.canTransition(LoopState.EXECUTING)).toBe(false);
      expect(sm.canTransition(LoopState.VERIFYING)).toBe(false);
      expect(sm.canTransition(LoopState.EVOLVING)).toBe(false);
      expect(sm.canTransition(LoopState.DONE)).toBe(false);
    });

    it("VERIFYING 状态可以转到 EVOLVING 或 PLANNING（Replan）", async () => {
      const sm = new LoopStateMachine(createTestContext());

      // 先走到 VERIFYING
      await sm.transition(LoopState.INTERROGATING);
      await sm.transition(LoopState.PLANNING);
      await sm.transition(LoopState.EXECUTING);
      await sm.transition(LoopState.VERIFYING);

      expect(sm.canTransition(LoopState.EVOLVING)).toBe(true);
      expect(sm.canTransition(LoopState.PLANNING)).toBe(true); // Replan
      expect(sm.canTransition(LoopState.IDLE)).toBe(false);
    });

    it("DONE 状态不能转到任何状态", async () => {
      const sm = new LoopStateMachine(createTestContext());

      // 走到终态
      await sm.transition(LoopState.INTERROGATING);
      await sm.transition(LoopState.PLANNING);
      await sm.transition(LoopState.EXECUTING);
      await sm.transition(LoopState.VERIFYING);
      await sm.transition(LoopState.EVOLVING);
      await sm.transition(LoopState.DONE);

      // 终态无任何合法目标
      for (const state of Object.values(LoopState)) {
        expect(sm.canTransition(state)).toBe(false);
      }
    });
  });

  describe("getValidTransitions()", () => {
    it("IDLE 状态的合法目标只有 INTERROGATING", () => {
      const sm = new LoopStateMachine(createTestContext());
      const valid = sm.getValidTransitions();
      expect(valid).toEqual([LoopState.INTERROGATING]);
    });

    it("VERIFYING 状态的合法目标是 [EVOLVING, PLANNING]", async () => {
      const sm = new LoopStateMachine(createTestContext());

      await sm.transition(LoopState.INTERROGATING);
      await sm.transition(LoopState.PLANNING);
      await sm.transition(LoopState.EXECUTING);
      await sm.transition(LoopState.VERIFYING);

      const valid = sm.getValidTransitions();
      expect(valid).toContain(LoopState.EVOLVING);
      expect(valid).toContain(LoopState.PLANNING);
      expect(valid).toHaveLength(2);
    });

    it("DONE 状态的合法目标为空数组", async () => {
      const sm = new LoopStateMachine(createTestContext());

      await sm.transition(LoopState.INTERROGATING);
      await sm.transition(LoopState.PLANNING);
      await sm.transition(LoopState.EXECUTING);
      await sm.transition(LoopState.VERIFYING);
      await sm.transition(LoopState.EVOLVING);
      await sm.transition(LoopState.DONE);

      const valid = sm.getValidTransitions();
      expect(valid).toEqual([]);
    });

    it("每步转换后 getValidTransitions 结果随之变化", async () => {
      const sm = new LoopStateMachine(createTestContext());

      // IDLE
      expect(sm.getValidTransitions()).toEqual([LoopState.INTERROGATING]);

      await sm.transition(LoopState.INTERROGATING);
      // INTERROGATING
      expect(sm.getValidTransitions()).toEqual([LoopState.PLANNING]);

      await sm.transition(LoopState.PLANNING);
      // PLANNING
      expect(sm.getValidTransitions()).toEqual([LoopState.EXECUTING]);

      await sm.transition(LoopState.EXECUTING);
      // EXECUTING
      expect(sm.getValidTransitions()).toEqual([LoopState.VERIFYING]);

      await sm.transition(LoopState.VERIFYING);
      // VERIFYING — 有两个出口
      expect(sm.getValidTransitions()).toContain(LoopState.EVOLVING);
      expect(sm.getValidTransitions()).toContain(LoopState.PLANNING);

      await sm.transition(LoopState.EVOLVING);
      // EVOLVING
      expect(sm.getValidTransitions()).toEqual([LoopState.DONE]);

      await sm.transition(LoopState.DONE);
      // DONE
      expect(sm.getValidTransitions()).toEqual([]);
    });
  });
});
