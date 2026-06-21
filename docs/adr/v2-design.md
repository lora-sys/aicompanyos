---
kind: doc
domain: [architecture]
status: adopted
---

# AI Company OS v2 — 自进化 Agent 系统设计

> **AI 公司，越用越懂你** — 自进化系统，从经验中学习，持续优化

## 核心架构

### 组织层级

```
CEO Agent (战略决策)
    ↓ 任务分解
COO Agent (运营执行)
    ↓ 部门协调
ContentDept (内容生产)
    ├── WriterAgent
    └ CriticAgent
```

### 运行时底座

**pi-agent-core** 作为所有 Agent 的统一运行时：

- **ToolCaller**: 工具调用框架
- **SubAgentMgr**: 子代理管理
- **DecisionEngine**: 决策引擎
- **EventBus**: 事件系统 (实时可视化)

### 自进化系统 (三层次)

| 层次 | 机制 | 状态 |
|------|------|------|
| 经验回流 | self.jsonl → 提示词注入 | ✅ 已有 |
| 偏好学习 | 用户反馈 → 偏好模型 | ✅ 新建 |
| 模型微调 | 经验数据 → 微调 LLM | 🔧 计划 |

## 可视化

### pi-tui (终端仪表盘)

- 全屏终端 UI
- 实时 Agent 状态
- 工具调用时间线
- 评分趋势图
- 目标完成进度
- 实时日志流

### pi-web-ui (Web 仪表盘)

- Next.js + React
- WebSocket 实时推送
- 交互式图表
- 历史任务记录

## 物理焊接 (不变约束)

1. **GradingCriteria**: 5 维度，运行时不可变
2. **Full Feedback**: Critic 报告完整注入 Writer 下一轮提示词
3. **Original Task**: 锚定在每个提示词顶部
4. **Degradation**: 保留最佳版本，永不退化
5. **Max Iterations**: 始终强制执行

## 关键文件

| 文件 | 说明 |
|------|------|
| `src/core/loop.ts` | LoopHarness — 核心循环引擎 |
| `src/core/event-bus.ts` | 事件总线 (pi-agent-core 集成) |
| `src/agent/runtime.ts` | Agent 运行时 |
| `src/agents/ceo.ts` | CEO Agent (战略决策) |
| `src/agents/coo.ts` | COO Agent (运营执行) |
| `src/tools/content-gen.ts` | 内容生成工具 |
| `src/memory/preference-learner.ts` | 偏好学习模块 |
| `src/ui/cli/dashboard.tsx` | pi-tui 终端仪表盘 |
| `src/ui/web/app/` | Next.js Web 应用 |
| `src/server/ws.ts` | WebSocket 服务 |

## 事件系统

### 事件类型

```typescript
type EventType =
  | 'agent_start' | 'agent_done' | 'agent_error'
  | 'tool_start' | 'tool_done' | 'tool_error'
  | 'writer_start' | 'writer_done'
  | 'critic_start' | 'critic_done'
  | 'grading' | 'stop_decision' | 'goal_check'
  | 'loop_complete' | 'experience_written'
  | 'preference_learned';
```

### 事件流程

```
LoopHarness 执行
    ↓
eventBus.emit('writer_start', {...})
    ↓
WebSocket 推送
    ↓
Web 客户端接收
    ↓
UI 实时更新
```

## 自进化流程

```
执行任务
    ↓
记录经验 (self.jsonl)
    ↓
偏好学习 (preference-learner)
    ↓
偏好注入 (提示词优化)
    ↓
下次执行 (更懂用户)
```

## 未来规划

### Phase 3: 模型微调

- 定期用经验数据微调 LLM
- 支持 LoRA 微调
- 自动触发条件

### Phase 4: 多部门扩展

- CodeDept (代码部门)
- DataDept (数据部门)
- DesignDept (设计部门)

### Phase 5: 子代理编排

- 动态子代理创建
- 子代理协作
- 子代理结果汇总

---

**Version**: v2.0  
**Last updated**: 2026-06-20
