# 心理知识库与 RAG 实施方案

## 1. 在整体技术路线中的位置

RAG 模块用于给 LLM 提供可控、可追溯的心理支持知识，避免模型只靠参数记忆自由发挥。它既是赛题“LLM + 心理知识库”的直接落实，也是系统可解释性的关键支撑。

## 2. 模块目标

- 建立与比赛场景匹配的轻量知识库。
- 支持按阶段、风险、情绪检索内容。
- 将知识以结构化形式注入 LLM，而不是整段生硬拼接。
- 明确系统边界：提供支持与引导，不做临床诊断。

## 3. 知识库范围

Step 43 当前先落一个小规模、高质量、可验证的数据集，不做百科式扩张。当前知识卡片文件是：

- `data/kb/knowledge_cards.jsonl`

当前卡片覆盖 5 类内容：

- 焦虑识别与基础支持
- 低落支持与自我苛责降温
- 睡眠建议
- 呼吸训练
- 求助与 handoff 引导

不建议一开始做百科式全量知识库，会显著增加清洗成本和幻觉风险。

## 4. 数据结构设计

当前每个知识条目包含以下字段：

```json
{
  "id": "breathing_478_basic",
  "title": "4-7-8 呼吸基础版",
  "category": "breathing_intervention",
  "summary": "适用于用户愿意尝试更慢节奏呼吸时的简短指导",
  "stage": ["intervene", "reassess"],
  "risk_level": ["low", "medium"],
  "emotion": ["anxious"],
  "tags": ["breathing", "sleep_transition"],
  "contraindications": ["not_for_high_risk_without_safety_check"],
  "recommended_phrases": ["我们先试一次慢呼吸"],
  "followup_questions": ["做完后你觉得呼吸节奏有变慢吗"],
  "source": "internal_curated"
}
```

当前不引入长正文；卡片直接保留适合注入对话的最小字段。

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

Step 43 只完成第 0 步：把卡片集做成稳定、可校验的数据资产。Step 44 再开始索引与检索。

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
- 当前校验脚本：
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_knowledge_cards.py`
- 当前硬规则：
  - `risk_level` 包含 `high` 的卡片必须属于 `handoff_support`

## 10. 数据准备流程

1. 收集公开、合规、适合校园情绪支持的资料。
2. 人工筛选为小颗粒度卡片。
3. 写入 `data/kb/knowledge_cards.jsonl`。
4. 运行 `scripts/verify_knowledge_cards.py` 校验字段、枚举和值域。
5. 下一步再做向量化入库和检索评测。

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

## 13. 与企业验证集的数据边界

RAG 模块应与企业验证集严格解耦，避免把验证样本误当知识库内容。

- `data/val` 只用于情绪识别、多模态对齐、离线回放和系统验证，不写入知识库索引。
- 知识库仍应来自人工筛选的心理支持内容，而不是音视频验证集本身。
- 当使用企业样本做离线回放时，RAG 的输入只来自 `transcript_path` 和系统状态，不直接读取情绪 CSV 作为检索语料。
- 这样可以避免知识泄漏、数据职责混乱和答辩时的边界不清。

同样地，`MAGICDATA` 中文 ASR 公开语料只用于 ASR 评测，不写入知识库，也不参与 RAG 检索语料构建。
