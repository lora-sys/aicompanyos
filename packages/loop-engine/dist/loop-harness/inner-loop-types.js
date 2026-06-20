/**
 * IInnerLoopEngine — Inner Loop 统一接口
 *
 * 这是 LoopHarness 内部 Writer→Critic 迭代循环的抽象 seam。
 * 两种实现：
 * - LegacyInnerLoopDriver: 原有 LoopModule 手搓循环（向后兼容）
 * - PiAgentInnerLoopDriver: 基于 pi-agent-core 的 agentLoop 驱动
 *
 * 设计原则：
 * - 接口小且深：LoopHarness 只需调用 run()，不关心内部是手搓还是 agentLoop
 * - 结果统一：两种 driver 返回相同的 InnerLoopResult，下游代码无感知
 * - 可替换：未来新增 driver 只需实现此接口
 */
export {};
//# sourceMappingURL=inner-loop-types.js.map