# 心理知识库与 RAG 实施方案

## 1. 在整体技术路线中的位置

RAG 模块用于给 LLM 提供可控、可追溯的心理支持知识，避免模型只靠参数记忆自由发挥。它既是赛题“LLM + 心理知识库”的直接落实，也是系统可解释性的关键支撑。

## 2. 模块目标

- 建立与比赛场景匹配的轻量知识库。
- 支持按阶段、风险、情绪检索内容。
- 将知识以结构化形式注入 LLM，而不是整段生硬拼接。
- 明确系统边界：提供支持与引导，不做临床诊断。

## 3. 知识库范围

只做比赛真正需要的 4 类内容：

- 焦虑识别与基础支持
- 抑郁倾向线索与支持话术
- 双相风险线索与澄清问法
- 非临床干预：呼吸训练、睡眠卫生、情绪记录、求助建议

不建议一开始做百科式全量知识库，会显著增加清洗成本和幻觉风险。

## 4. 数据结构设计

每个知识条目建议包含：

```json
{
  "id": "breathing_478",
  "title": "4-7-8 呼吸法",
  "category": "intervention",
  "stage": ["intervene", "reassess"],
  "risk_level": ["low", "medium"],
  "emotion": ["anxious"],
  "contraindications": ["high_risk_self_harm"],
  "recommended_phrases": ["我们先试一次慢呼吸"],
  "followup_questions": ["做完后你觉得呼吸节奏有变慢吗"],
  "source": "internal_curated"
}
```

## 5. 文档切分原则

按“最小干预单元”切分，而不是按整篇文章切分。每个 chunk 只服务一个清晰场景，例如：

- 焦虑时如何开始呼吸引导
- 睡前焦虑时如何建议睡眠卫生
- 发现明显高风险时如何停止普通安慰并转向求助提示

这样做的好处是召回更准，注入上下文更短。

## 6. 向量检索方案

- Embedding：`bge-m3`
- 向量库：`pgvector`
- 重排：`bge-reranker-v2-m3`

原因：

- 与 PostgreSQL 统一，部署简单
- 中文检索效果好
- 小团队更容易维护

## 7. 检索流程

1. 编排层提交当前 `stage + risk_level + emotion + user_query`
2. RAG 先做元数据过滤
3. 向量检索召回 Top 8
4. 重排取 Top 2 到 Top 3
5. 组织为结构化 `knowledge_cards` 返回给对话服务

## 8. 注入方式

不要把知识库全文塞给模型，建议只注入以下字段：

- `recommended_phrases`
- `followup_questions`
- `contraindications`
- `source_id`

注入结果示例：

```json
{
  "knowledge_cards": [
    {
      "id": "breathing_478",
      "recommended_phrases": ["我们先试一次 4-7-8 呼吸法"],
      "followup_questions": ["做完这轮呼吸后，胸口紧张有没有缓一点"]
    }
  ]
}
```

## 9. 质量控制

- 每条知识必须经过人工审校。
- 所有条目都要标注适用阶段和禁忌场景。
- 高风险条目优先匹配 handoff 模板，不与普通安慰混用。

## 10. 数据准备流程

1. 收集公开、合规、适合校园情绪支持的资料。
2. 人工筛选为小颗粒度卡片。
3. 补充标准字段和标签。
4. 向量化入库。
5. 用固定测试集评估召回准确率。

## 11. 接口设计

- `POST /kb/index`
- `POST /kb/retrieve`
- `GET /kb/item/{id}`
- `POST /kb/eval`

返回结果必须包含 `source_id`，便于日志与答辩说明“本轮回复参考了哪些知识”。

## 12. 验收标准

- 不同风险等级下，检索结果明显不同。
- 对话服务能引用 `source_id` 生成可追溯回复。
- 召回内容短而准，不出现大段无关知识注入。
- 高风险输入不会错误召回普通安抚卡片。
