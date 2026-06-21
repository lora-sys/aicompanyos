# AI Company OS v2

> **自进化 Agent 系统** — 越用越懂你 🚀

**model + harness = agent**

---

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

- **pi-agent-core**: 所有 Agent 的统一运行时
  - ToolCaller (工具调用)
  - SubAgentMgr (子代理管理)
  - DecisionEngine (决策引擎)
  - EventBus (事件系统)

### 自进化系统 (三层次)

| 层次 | 机制 | 状态 |
|------|------|------|
| 经验回流 | self.jsonl → 提示词注入 | ✅ 已有 |
| 偏好学习 | 用户反馈 → 偏好模型 | ✅ 新建 |
| 模型微调 | 经验数据 → 微调 LLM | 🔧 计划 |

---

## 可视化

### pi-tui (终端仪表盘)

全屏终端 UI，实时显示：
- Agent 状态 (CEO/COO/Writer/Critic)
- 工具调用时间线
- 评分趋势图
- 目标完成进度
- 实时日志流

```bash
npm run dev:ui
```

### pi-web-ui (Web 仪表盘)

Next.js Web 应用，通过 WebSocket 实时同步：
- 浏览器访问 `http://localhost:3000`
- 实时 Agent 状态
- 交互式图表
- 历史任务记录

```bash
npm run dev:web
```

---

## 物理焊接 (不变约束)

1. **GradingCriteria**: 5 维度，运行时不可变
2. **Full Feedback**: Critic 报告完整注入 Writer 下一轮提示词
3. **Original Task**: 锚定在每个提示词顶部
4. **Degradation**: 保留最佳版本，永不退化
5. **Max Iterations**: 始终强制执行

---

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

---

## 使用

```bash
# 开发模式 (CLI)
npm run dev

# 终端 UI
npm run dev:ui

# Web UI (启动 Next.js + WebSocket)
npm run dev:web

# 构建
npm run build
```

### 任务执行

```bash
# CLI 直接运行
npm run dev -- "写一篇关于 AI Agent 的文章"

# 带选项
npm run dev -- "写一个短视频脚本" \
  --type short-video \
  --max-inner 4
```

---

## 停止策略 (5 级)

```
Guard (目标达成) → Quality (优秀) → Degradation (退化) → Max Rounds → Timeout
```

优先级: Guard > Quality > Degradation > Max > Timeout

---

## 记忆系统

### self.jsonl (经验日志)

- 每次执行后追加记录
- 高分经验注入下一轮提示词
- 支持 few-shot 校准

### preferences.json (偏好学习)

- 从评分和反馈中学习用户偏好
- 自动提取写作模式
- 权重排序，定期更新

---

## 评分维度 (5 维)

1. **Clarity** (清晰度) — 10 分
2. **Value** (价值密度) — 10 分
3. **Engagement** (吸引力) — 10 分
4. **Accuracy** (准确性) — 10 分
5. **Completeness** (完整性) — 10 分

---

## 内容类型

| 类型 | 描述 | 重点 |
|------|------|------|
| `article` | 长文 (公众号/知乎/博客) | 深度 + 可读性 |
| `seed` | 引流文案 | 钩子 + CTA |
| `short-video` | 短视频脚本 (抖音/TikTok) | 视觉 + 节奏 |
| `newsletter` | 邮件通讯 | 价值密度 + 一致性 |

---

## 依赖

```json
{
  "@earendil-works/pi-ai": "^0.79.8",
  "@earendil-works/pi-agent-core": "latest",
  "@earendil-works/pi-tui": "latest",
  "@earendil-works/pi-web-ui": "latest",
  "next": "^14.0.0",
  "ws": "^8.21.0"
}
```

---

## 愿景

**AI 公司，越用越懂你**

- 每次执行都在学习
- 每次反馈都在优化
- 每次迭代都在进化

---

**Version**: v2.0  
**Last updated**: 2026-06-20
