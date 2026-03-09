# 数据、日志、评测与运维实施方案

## 1. 在整体技术路线中的位置

这一模块负责把系统从“能演示”推进到“能证明、能复现、能交付”。比赛答辩和最终打包都需要指标、日志和故障恢复能力，因此它必须从项目早期就介入。

## 2. 模块目标

- 统一管理会话数据、模型输出和媒体文件。
- 提供可追溯日志与可解释性报告。
- 支持 ASR、时延、多轮稳定性、多模态效果评测。
- 支持压测和异常恢复验证。

## 3. 数据存储分工

### PostgreSQL

- 用户会话元数据
- 对话记录
- 阶段切换记录
- 风险评估结果
- 知识库索引与引用

### Redis

- 实时会话状态
- WebSocket 会话映射
- 任务队列和短期上下文

### MinIO

- 原始音频片段
- 视频抽帧
- TTS 音频
- 导出报告与 Demo 数据

## 4. 建议表结构

- `sessions`
- `session_messages`
- `affect_windows`
- `dialogue_actions`
- `retrieval_logs`
- `system_events`
- `eval_runs`

每条记录必须带：

- `session_id`
- `trace_id`
- `created_at`

## 5. 日志规范

每轮交互至少记录以下字段：

- 原始输入文本或音频 URI
- ASR partial/final 文本
- 三模态子结果
- 融合结果与 `fusion_reason`
- RAG 命中知识条目
- LLM 输出 JSON
- TTS 文件 URI
- 数字人驱动参数
- 最终前端呈现结果

## 6. 评测维度

### ASR

- `WER`
- `SER`
- `RTF`

### 系统性能

- 首字响应时间
- 单轮总耗时
- P95 响应时延
- 并发会话数

### 对话质量

- 10 轮稳定性
- 阶段推进合理性
- 高风险识别召回
- 干预后再评估变化

### 多模态效果

- 单模态 vs 融合对比
- 冲突场景触发率
- 置信度校准情况

## 7. 评测脚本建议

工程内建议提供：

- `eval_asr.py`
- `eval_latency.py`
- `eval_dialogue.py`
- `eval_multimodal.py`
- `replay_session.py`

当前仓库中步骤 22 已落地的 ASR 基线脚本为：

- `scripts/eval_asr_baseline.py`
- `scripts/verify_asr_baseline_eval.py`

其中 `eval_asr_baseline.py` 的约束是：

- 只读取 `data/derived/transcripts/val_transcripts_template.jsonl`
- 只纳入 `workflow_status=verified`
- 只纳入 `locked_for_eval=true`
- 只纳入 `text_status=human_verified`
- 没有满足门槛的样本时输出 `blocked` 报告，不允许回退到机器初稿自评

当前仓库还增加了一条面向中文普通话的公开评测路径：

- `scripts/prepare_magicdata_eval.py`
- `scripts/verify_magicdata_asr_eval.py`
- `scripts/verify_asr_regression.py`

这条路径的作用是：

- 从本地 `MAGICDATA dev+test` 提取官方参考文本
- 生成一个全量参考目录和一个冻结中文评测子集
- 用同一个 `scripts/eval_asr_baseline.py` 对外部 ASR 服务输出计算 WER/SER
- 用 `scripts/verify_asr_regression.py` 把 enterprise live 校验和 MAGICDATA 中文阈值门禁串成一个稳定回归入口

注意：

- 该数据集派生文件默认写入 `data/derived/transcripts-local/` 与 `data/derived/eval-local/`
- 企业验证集评测链和 MAGICDATA 中文评测链必须分开维护
- 公开语料派生产物默认不进入版本库

评测脚本需要能直接输出 CSV 或 Markdown 表格，用于方案书和 PPT。

## 8. 可解释性输出

答辩时必须能回答“为什么系统这样判断”。因此建议每轮生成一条简要解释：

```json
{
  "summary": "文本中出现持续失眠表达，音频能量低，视频回避明显，因此风险提升到 medium。",
  "evidence": ["text_keyword:失眠", "audio_low_energy", "visual_withdrawal"],
  "action": "ask_clarifying_question"
}
```

## 9. 压测与恢复

- 模拟连续 10 轮对话。
- 模拟 TTS 服务超时。
- 模拟视频模态缺失。
- 模拟 Redis 重连与 WebSocket 断线。

目标不是所有服务永不出错，而是出现错误时主链路仍可降级运行。

## 10. 运维建议

- 所有服务暴露 `/health`。
- 使用统一日志格式 JSON。
- 关键指标接 Prometheus，前期也可先输出到文件。
- 每次 Demo 前清理无效媒体文件，避免 MinIO 膨胀。

## 11. 实施顺序

1. 先统一 `trace_id/session_id`。
2. 再补全数据库表和 MinIO Bucket。
3. 接入评测脚本。
4. 最后做压测和可解释性导出。

## 12. 验收标准

- 任意一轮交互都可追溯完整链路。
- 能导出一份包含指标和日志的实验报告。
- 压测结果可支撑答辩中的稳定性说明。
- 评测脚本和结果表可独立运行，不依赖人工手填。

## 13. Manifest、血缘与质控

企业验证集接入后，数据运维需要增加一层样本血缘和质量控制管理。

- 日志中除 `session_id` 和 `trace_id` 外，还应记录 `record_id`、`dataset`、`canonical_role`、`segment_id`。
- 评测任务应优先读取 `data/manifests/val_manifest.jsonl`，而不是直接遍历原始目录。
- 转录评测任务应优先读取 `data/derived/transcripts/val_transcripts_template.jsonl`，并显式区分 `pending_asr`、`draft_ready`、`pending_review`、`verified`。
- 日常复核排队应优先读取 `data/derived/transcripts/review_tasks/review_queue_active.md`，并通过统一复核脚本推进状态，而不是手改 JSONL。
- 数据质控至少覆盖三类问题：隐藏文件污染、模态缺失、情绪 CSV 与 3D 特征步数不一致。
- QC 报告必须按 `dataset + canonical_role` 输出覆盖率、问题样本和转录状态拆表，便于直接转成开发待办和回归样本池。
- 正式 ASR 指标只允许使用 `verified` 且 `locked_for_eval` 的样本，禁止把机器初稿直接当参考文本。
- 所有导出的实验表都应能区分“实时采集样本”和“企业验证集离线样本”。
- 当前已产出 `data/derived/qc_report.md`，总量和转录状态应以该文件实时统计为准，不再在方案文档中手工维护固定数字。
- 对于公开中文评测集，应额外区分“本地生成的官方参考集”和“人工复核工作流参考集”，避免后续把公开语料误写成企业内部标注结果。
