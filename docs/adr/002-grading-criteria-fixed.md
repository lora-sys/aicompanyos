# ADR-002: 评分标准固定化设计决策

## Status
Accepted

## Context

在 Loop Engineering 的 Evaluator（Critic）Agent 中，需要对生成内容进行结构化评分。最初的设计允许 Evaluator 自由选择评分维度，但这导致了以下问题：

**问题 1：维度不一致导致趋势不可追踪**

```
第 1 轮评分: { accuracy: 8, creativity: 7, clarity: 6 }  // 3 个维度
第 2 轮评分: { content: 9, style: 5, format: 8, depth: 7 } // 4 个不同维度
第 3 轮评分: { quality: 8, relevance: 9 }                   // 又是 2 个维度
```
无法回答："第 3 轮的内容准确性是否比第 1 轮提升了？"

**问题 2：LLM 输出的随机性**

即使 prompt 中指定了维度，LLM 仍可能：
- 遗漏某些维度
- 使用同义词替代（如 "precision" vs "accuracy"）
- 自行添加额外维度
- 分数 scale 不一致（有的用 1-10，有的用 1-5）

**问题 3：进化学习的基础数据不可靠**

Evolution Agent 需要从评分历史中提取规律（如"某种写作策略总是导致 readability 低分"），但维度不稳定使这种分析无法进行。

## Decision

采用 **GradingCriteria 固定五维体系**，在任务开始前定义，运行期间严格不可变：

### 五维体系定义

| 维度 | 权重 | 说明 | 评分标准（1-10 分制） |
|------|------|------|---------------------|
| **Topic Accuracy** | 25% | 主题准确性与覆盖度 | 是否准确理解并覆盖了主题要求，有无偏题或遗漏关键点 |
| **Technical Depth** | 25% | 技术深度与专业性 | 技术解释是否深入，代码示例是否正确且具有教学价值 |
| **Code Quality** | 20% | 代码质量 | 代码规范性、可读性、是否有 bug、是否符合最佳实践 |
| **Readability** | 15% | 可读性 | 语言流畅度、结构清晰度、排版美观度 |
| **Originality** | 15% | 原创性 | 角度独特性、见解深度、避免陈词滥调 |

### 实现约束

```typescript
// GradingCriteria 在任务创建时固化，之后不可修改
interface GradingCriteria {
  dimensions: [
    { name: "topicAccuracy", weight: 0.25 },
    { name: "technicalDepth", weight: 0.25 },
    { name: "codeQuality", weight: 0.20 },
    { name: "readability", weight: 0.15 },
    { name: "originality", weight: 0.15 }
  ];
  scoreRange: { min: 1, max: 10 };  // 统一 1-10 分制
  frozenAt: string;                  // 冻结时间戳
}
```

### Few-shot 校准机制

为确保 Evaluator 的输出符合预期标准，采用 Few-shot 示例校准：

1. **预设标准样本库**：每个维度准备 3-5 个典型样例（高分/中分/低分各一个）
2. **动态注入 Prompt**：将相关维度的样例作为 few-shot 示例注入 Evaluator 的 system prompt
3. **输出格式强制**：要求 Evaluator 以严格的 JSON 格式输出，包含所有 5 个维度的独立评分
4. **后处理验证**：解析 Evaluator 输出后检查维度完整性，缺失则补默认值并记录异常

## Consequences

### 正面影响

1. **时间序列可比性**：同一维度跨轮次的分数可以直接比较，绘制趋势图
2. **Evolution 数据基础**：可以精确分析"某类策略对特定维度的影响"
3. **调试友好**：当整体分数异常时，可以定位到具体哪个维度出了问题
4. **用户可配置**：权重可以根据任务类型微调（如技术文档提高 Technical Depth 权重）

### 负面影响

1. **灵活性降低**：固定维度可能不适合所有类型的内容（如纯文本创作不需要 Code Quality）
2. **维护成本**：Few-shot 样本库需要定期更新以保持校准有效性
3. **初始开发工作量**：需要为每个维度精心设计评分标准和样例

### 扩展机制

对于特殊场景，支持通过 `customDimensions` 扩展额外维度，但核心五维始终保留以确保基线一致性：
```typescript
interface ExtendedGradingCriteria extends GradingCriteria {
  customDimensions?: Array<{ name: string; weight: number; description: string }>;
  // customDimensions 的总权重不得超过 20%，以保持核心五维的主导地位
}
```
