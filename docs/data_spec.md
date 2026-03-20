# Data Specification

## 1. 目的

本文档定义企业验证集的接入规范，统一说明目录结构、`manifest` 字段、角色映射、标签映射和数据预处理要求。目标是让后续的数据清洗、模型验证、多模态融合和数字人驱动都基于同一套数据语义，而不是在不同模块里各自猜路径、猜角色、猜标签。

本文档只覆盖当前仓库中的企业验证集：

- `data/val/Audio_files`
- `data/val/Video_files`
- `data/val/Emotion`
- `data/val/3D_FV_files`

另有一条本地使用的中文公开 ASR 评测路径：

- `data/external/asr/magicdata-zh/raw`
- `data/external/asr/magicdata-zh/extracted`

该路径不替代企业验证集，也不进入企业 manifest；它只用于中文普通话 ASR 公开基线评测。

## 2. 使用原则

- `data/val` 视为只读目录，禁止直接修改原始文件。
- 所有衍生文件必须输出到新的派生目录，例如 `data/derived`、`data/manifests`、`data/cache`。
- 所有读取流程都必须过滤 `._*`、`.DS_Store` 等无效文件。
- 所有下游任务都必须优先读取 manifest，不允许在业务代码里直接硬拼原始路径。

## 3. 当前数据源概览

### 3.1 NoXI

观测到的结构特征：

- 会话目录示例：`001_2016-03-17_Paris`
- 音视频角色目录：`Expert_video`、`Novice_video`
- 情绪标签目录：`P1`、`P2`
- 3D 特征目录：与音视频角色目录同名
- 片段编号：按 `1..N` 编号
- 同一会话下，音频、视频、情绪标签片段数通常对齐
- 3D 特征存在成对文件：`{segment_id}.npy` 与 `{segment_id}_full.npy`

### 3.2 RECOLA

观测到的结构特征：

- 会话目录示例：`group-2`
- 音视频角色目录：`P41`、`P42`
- 情绪标签目录：`P1`、`P2`
- 3D 特征目录：与音视频角色目录同名
- 片段编号：按 `1..N` 编号
- 已观测到音视频片段数与情绪标签片段数不完全一致，例如 `P41/P42` 有 `1..10` 音视频，但 `P1/P2` 只有 `1..9` 情绪标签

## 4. 已确认事实与运行假设

### 4.1 已确认事实

- 企业音频样例为 `44.1kHz`、`stereo`、`16-bit PCM wav`
- 情绪标签 CSV 含以下字段：
  - `AU1, AU2, AU4, AU6, AU7, AU9, AU10, AU12, AU14, AU15, AU17, AU23, AU24, AU25, AU26`
  - `valence, arousal`
  - `Neutral, Happy, Sad, Surprise, Fear, Disgust, Anger, Contempt`
- 抽查样本中，情绪 CSV 原始总行数通常为 `751`，其中包含 1 行表头，因此有效数据行数常为 `750`
- 抽查样本中，3D 特征时间步长度常为 `751`，与情绪 CSV 有效数据行数存在 `750/751` 的轻微错位
- 抽查样本中，`{segment_id}.npy` 与 `{segment_id}_full.npy` 内容完全一致

### 4.2 运行假设

- `P1/P2` 与音视频角色目录之间没有在当前数据中看到明确元数据说明，因此规范中不得把两者视为天然同义字段
- NoXI 中 `Expert_video` 和 `Novice_video` 可直接视为语义角色
- RECOLA 中 `P41/P42` 只作为原始角色标识，不附带额外语义角色
- `_full.npy` 当前默认视为冗余副本，除非后续发现差异样本，否则不作为主输入

## 5. 目录语义

### 5.1 原始模态目录

- `Audio_files/<dataset>/<session>/<role>/<segment>.wav`
- `Video_files/<dataset>/<session>/<role>/<segment>.mp4`
- `Emotion/<dataset>/<session_or_group>/<label_role>/<segment>.csv`
- `3D_FV_files/<dataset>/<session>/<role>/<segment>.npy`
- `3D_FV_files/<dataset>/<session>/<role>/<segment>_full.npy`

### 5.2 规范化派生目录建议

- `data/manifests/`
- `data/derived/audio_16k_mono/`
- `data/derived/transcripts/`
- `data/derived/transcripts-local/`
- `data/derived/labels/`
- `data/derived/eval-local/`
- `data/cache/features/`

## 6. Canonical Manifest 规范

manifest 推荐使用 `jsonl` 或 `csv`，每一行只描述一个“角色-片段”样本，不描述整场会话。

### 6.1 必填字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `record_id` | string | 唯一记录标识，推荐 `dataset/session/role/segment` |
| `split` | string | 当前固定为 `val` |
| `dataset` | string | `noxi` 或 `recola` |
| `session_id` | string | NoXI 为会话目录名；RECOLA 为组目录名，例如 `group-2` |
| `segment_id` | string | 原始片段编号，保留字符串形式 |
| `source_av_role` | string | 音视频原始角色目录名 |
| `source_label_role` | string or null | 情绪标签原始角色目录名，允许为空 |
| `canonical_role` | string | 规范角色名，使用 `speaker_a` 或 `speaker_b` |
| `semantic_role` | string or null | 语义角色，例如 `expert`、`novice`，无则为空 |
| `role_mapping_status` | string | `verified`、`assumed`、`unlinked` |
| `audio_path` | string or null | 原始音频路径 |
| `video_path` | string or null | 原始视频路径 |
| `emotion_path` | string or null | 情绪 CSV 路径 |
| `face3d_path` | string or null | 主 3D 特征路径，默认使用非 `_full` 文件 |
| `face3d_full_path` | string or null | `_full.npy` 路径 |
| `has_audio` | boolean | 是否存在原始音频 |
| `has_video` | boolean | 是否存在原始视频 |
| `has_emotion` | boolean | 是否存在情绪标签 |
| `has_face3d` | boolean | 是否存在 3D 特征 |
| `text_status` | string | `missing`、`asr_generated`、`human_verified` |
| `transcript_path` | string or null | 文本转录路径 |
| `label_status` | string | `complete`、`partial`、`missing` |
| `notes` | string | 备注，例如“emotion missing for segment 10” |

### 6.2 推荐附加字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `audio_sample_rate_hz_src` | integer | 原始采样率 |
| `audio_channels_src` | integer | 原始声道数 |
| `audio_path_16k_mono` | string or null | 预处理后的 ASR 输入音频路径 |
| `emotion_num_rows` | integer or null | 情绪 CSV 行数 |
| `face3d_num_steps` | integer or null | 3D 特征时间步数 |
| `alignment_status` | string | `aligned`、`mismatch`、`unverified` |
| `dataset_role_group` | string | 原始角色组，例如 `Expert_video` 或 `P41` |
| `manifest_version` | string | manifest 版本号 |

### 6.3 示例记录

```json
{
  "record_id": "noxi/001_2016-03-17_Paris/speaker_a/1",
  "split": "val",
  "dataset": "noxi",
  "session_id": "001_2016-03-17_Paris",
  "segment_id": "1",
  "source_av_role": "Expert_video",
  "source_label_role": "P1",
  "canonical_role": "speaker_a",
  "semantic_role": "expert",
  "role_mapping_status": "assumed",
  "audio_path": "data/val/Audio_files/NoXI/001_2016-03-17_Paris/Expert_video/1.wav",
  "video_path": "data/val/Video_files/NoXI/001_2016-03-17_Paris/Expert_video/1.mp4",
  "emotion_path": "data/val/Emotion/NoXI/001_2016-03-17_Paris/P1/1.csv",
  "face3d_path": "data/val/3D_FV_files/NoXI/001_2016-03-17_Paris/Expert_video/1.npy",
  "face3d_full_path": "data/val/3D_FV_files/NoXI/001_2016-03-17_Paris/Expert_video/1_full.npy",
  "has_audio": true,
  "has_video": true,
  "has_emotion": true,
  "has_face3d": true,
  "text_status": "missing",
  "transcript_path": "data/derived/transcripts/val_transcripts_template.jsonl",
  "label_status": "complete",
  "audio_sample_rate_hz_src": 44100,
  "audio_channels_src": 2,
  "audio_path_16k_mono": null,
  "emotion_num_rows": 750,
  "face3d_num_steps": 751,
  "alignment_status": "mismatch",
  "notes": "emotion rows 750 != face3d steps 751"
}
```

## 7. 角色映射规范

角色映射分三层，不允许只保留一个字段：

- `source_av_role`：音频/视频/3D 特征目录中的原始角色名
- `source_label_role`：情绪标签目录中的原始角色名
- `canonical_role`：项目内部统一角色槽位，只允许 `speaker_a`、`speaker_b`

### 7.1 NoXI 角色映射

| 原始来源 | 原始角色 | 规范角色 | 语义角色 | 状态 |
| --- | --- | --- | --- | --- |
| Audio/Video/3D | `Expert_video` | `speaker_a` | `expert` | `verified` for source role only |
| Audio/Video/3D | `Novice_video` | `speaker_b` | `novice` | `verified` for source role only |
| Emotion | `P1` | `speaker_a` | `expert` | `assumed` |
| Emotion | `P2` | `speaker_b` | `novice` | `assumed` |

说明：

- `Expert_video` 与 `Novice_video` 的语义角色是明确的
- `P1/P2` 与 `Expert/Novice` 的直接对应关系在当前数据中未看到额外说明，因此先按排序对齐作为运行默认值
- 只要没有补充元数据验证，`role_mapping_status` 必须保留为 `assumed`

### 7.2 RECOLA 角色映射

| 原始来源 | 原始角色 | 规范角色 | 语义角色 | 状态 |
| --- | --- | --- | --- | --- |
| Audio/Video/3D | `P41` | `speaker_a` | null | `verified` for source role only |
| Audio/Video/3D | `P42` | `speaker_b` | null | `verified` for source role only |
| Emotion | `P1` | `speaker_a` | null | `assumed` |
| Emotion | `P2` | `speaker_b` | null | `assumed` |

说明：

- RECOLA 不在当前数据中提供类似 `expert/novice` 的语义角色，不要强行补充
- `P41/P42` 与 `P1/P2` 当前只允许通过 manifest 中的默认映射链接
- 当情绪标签缺失时，`source_label_role` 可为空，`role_mapping_status` 保持为 `unlinked`

### 7.3 角色映射落地规则

- 所有模块内部只消费 `canonical_role`
- 所有日志和调试界面必须同时保留 `source_av_role` 和 `source_label_role`
- 如果后续拿到企业补充说明文件，优先更新映射表，而不是修改业务代码

## 8. 标签映射规范

### 8.1 原始标签字段

企业情绪 CSV 提供三类信息：

- 面部动作单元：`AU*`
- 连续情感维度：`valence`、`arousal`
- 离散情绪概率：`Neutral`、`Happy`、`Sad`、`Surprise`、`Fear`、`Disgust`、`Anger`、`Contempt`

### 8.2 项目内部标签层级

项目内部统一使用三层标签：

- `fine_emotion`
- `coarse_emotion`
- `affect_state`

### 8.3 Fine Emotion 映射

| 原始列 | 规范值 |
| --- | --- |
| `Neutral` | `neutral` |
| `Happy` | `happy` |
| `Sad` | `sad` |
| `Surprise` | `surprise` |
| `Fear` | `fear` |
| `Disgust` | `disgust` |
| `Anger` | `anger` |
| `Contempt` | `contempt` |

规则：

- `fine_emotion` 取离散情绪概率的最大值对应类别
- `fine_emotion_confidence` 取该最大概率值

### 8.4 Coarse Emotion 映射

| `fine_emotion` | `coarse_emotion` |
| --- | --- |
| `neutral` | `neutral` |
| `happy` | `positive` |
| `sad` | `low_mood` |
| `fear` | `anxious` |
| `surprise` | `high_arousal_ambiguous` |
| `anger` | `negative_activated` |
| `disgust` | `negative_activated` |
| `contempt` | `negative_activated` |

说明：

- `surprise` 不直接等价于积极或消极，先归到高唤醒待判定状态
- `anger`、`disgust`、`contempt` 在项目 V1 中合并为高激活负向状态

### 8.5 Affect State 规则

`affect_state` 用于多模态融合时的统一标签，建议按以下规则计算：

- `valence >= 0.2` 且 `coarse_emotion=positive` -> `positive_engaged`
- `valence <= -0.2` 且 `coarse_emotion=low_mood` -> `negative_low_arousal`
- `arousal >= 0.35` 且 `coarse_emotion in {anxious, high_arousal_ambiguous, negative_activated}` -> `negative_high_arousal`
- 其他情况 -> `neutral_or_mixed`

### 8.6 AU 字段使用规则

- `AU*` 不作为 V1 主监督标签
- `AU*` 主要用于：
  - 面部表情可解释性
  - 可视化证据展示
  - 后续细粒度表情驱动

建议派生字段：

- `au_active_count`
- `au_top_k`
- `au_signature`

### 8.7 风险标签边界

企业数据当前只提供情绪和表情信号，不提供临床风险标签。

因此：

- 不得直接把 `valence/arousal` 或离散情绪概率映射成临床风险等级
- `risk_level` 仍必须由文本规则、对话上下文和多模态融合共同推断
- 企业数据主要服务于“情绪识别”和“时序对齐”验证，不服务于“高风险监督标签”训练

## 9. 对齐规则

### 9.1 时间步对齐

- 默认优先比较情绪 CSV 的有效数据行数与 `face3d_num_steps`
- 当前样本常见情况为 `emotion_num_rows=750`、`face3d_num_steps=751`
- 若不相等，`alignment_status` 记为 `mismatch`
- 融合前应在派生层完成裁剪、补齐或归一化，不要把对齐逻辑散落到各业务模块
- `mismatch` 样本不得直接进入监督训练，可用于单模态调试

### 9.2 片段对齐

- 同一 `dataset + session_id + canonical_role + segment_id` 视为一个候选多模态样本
- 若某模态缺失，manifest 保留该记录，但将缺失字段标空并设置 `label_status`
- 融合训练与评测时只使用 `has_audio && has_video && has_emotion && has_face3d` 的完整样本

### 9.3 `_full.npy` 使用规则

- 默认主输入使用 `face3d_path`
- `face3d_full_path` 仅作为备用字段保存
- 除非后续验证发现差异，否则训练和评测默认忽略 `_full.npy`

## 10. 文本与转录工作流规范

企业数据当前未见现成转录文本，因此文本字段必须通过派生流程补齐。当前规范使用 `data/derived/transcripts/val_transcripts_template.jsonl` 作为统一转录工作流文件，每条 manifest 记录通过 `record_id` 一一对应到一条转录记录。

### 10.1 转录模板字段要求

转录模板中的最小字段集应至少包含：

- `record_id`
- `audio_path`
- `audio_path_16k_mono`
- `workflow_status`
- `next_action`
- `asr_draft_status`
- `draft_text_raw`
- `draft_text_normalized`
- `draft_segments`
- `draft_confidence_mean`
- `review_status`
- `review_decision`
- `reviewer`
- `reviewed_at`
- `final_text`
- `final_text_normalized`
- `text_status`
- `transcript_source`
- `quality_flags`
- `needs_second_review`
- `locked_for_eval`
- `review_history`
- `notes`

这些字段中，ASR 批处理只能写入初稿相关字段；人工复核才能写入审核结论、最终文本和锁定状态。

### 10.2 文本状态枚举

- `missing`：没有文本
- `asr_generated`：由 ASR 生成但未人工校对
- `human_verified`：人工校对完成

### 10.3 工作流状态枚举

- `pending_asr`：尚未生成 ASR 初稿
- `draft_ready`：ASR 初稿已生成，等待人工处理
- `pending_review`：人工正在复核或等待二次复核
- `verified`：人工确认完成，可进入正式评测

推荐的辅助字段枚举：

- `asr_draft_status`：`not_started`、`completed`、`failed`
- `review_status`：`not_started`、`queued`、`in_progress`、`completed`
- `review_decision`：`approved`、`needs_revision`、`rejected`

### 10.4 文本补齐原则

- ASR 评测样本必须优先转成 `human_verified`
- 文本情绪调试样本至少要有一小批 `human_verified`
- 未人工校对的文本可用于联调，不可作为最终评测金标准
- 已 `locked_for_eval` 的记录不得在常规批处理里覆盖

### 10.5 状态推进规则

- 初始状态必须是 `workflow_status=pending_asr`
- ASR 批处理完成后，记录推进为 `draft_ready`，并写入 `draft_text_*`、`draft_segments`、`draft_confidence_*`、`asr_engine*`
- 人工开始处理时，记录推进为 `pending_review`，并在 `review_history` 中追加 `start_review`
- 审核通过且 `final_text` 已填充后，记录推进为 `verified`，同时将 `text_status` 置为 `human_verified`，并在 `review_history` 中追加 `complete_review`
- 如果人工结论为 `needs_revision` 或 `rejected`，记录保持在 `pending_review`，等待再次处理或二次复核
- 任意批处理重跑时，必须保留已有 `reviewer`、`reviewed_at`、`review_history`、`final_text` 和 `locked_for_eval`

## 11. 音频预处理规范

- 原始音频保留不变
- ASR 输入统一转换为：
  - `16kHz`
  - `mono`
  - `wav/pcm`
- 预处理结果单独保存，不覆盖原始音频

建议派生字段：

- `audio_sample_rate_hz_src`
- `audio_channels_src`
- `audio_sample_rate_hz_target`
- `audio_channels_target`

## 12. 质量检查清单

每次更新 manifest 后必须执行以下检查：

1. 检查是否存在隐藏文件进入 manifest。
2. 检查 `record_id` 是否唯一。
3. 检查所有路径是否真实存在。
4. 检查 NoXI 每个会话下 `speaker_a/speaker_b` 的模态数量是否大体对称。
5. 检查 RECOLA 是否存在情绪标签缺失片段，并正确记录到 `notes`。
6. 检查 `emotion_num_rows` 与 `face3d_num_steps` 是否一致。
7. 检查 `text_status`、`workflow_status` 与转录字段是否一致。
8. 检查 `locked_for_eval=true` 的记录是否都已进入 `verified`。

## 13. 下游模块消费约束

### ASR

- 只读取派生后的 `16k mono` 音频
- 不直接读取原始 `44.1k stereo` 音频作为推理输入

### 多模态情绪识别

- 训练/验证样本必须来自 manifest
- 风险标签不能直接复用企业情绪标签

### 数字人驱动

- 默认读取 `face3d_path`
- 如需评估 3D 输入与情绪标签一致性，必须同时读取 `emotion_path`

### 日志与回放

- 必须记录 `dataset`、`session_id`、`canonical_role`、`segment_id`
- 调试界面可显示 `source_av_role` 和 `source_label_role`

## 14. 推荐后续产物

基于本文档，后续应继续补齐以下文件：

- `data/manifests/val_manifest.jsonl`
- `data/manifests/role_mapping.csv`
- `docs/label_mapping.md`
- `data/derived/transcripts/*.jsonl`
- `data/derived/qc_report.md`

## 15. 当前配套文件

当前仓库中已落地以下配套文件，后续开发默认以它们为入口：

- `data/manifests/val_manifest.jsonl`
- `data/manifests/role_mapping.csv`
- [label_mapping.md](./label_mapping.md)

这三份文件应与本文档同步演进，字段名、角色映射和标签枚举不允许分叉。

## 16. 当前覆盖快照

基于当前自动扫描脚本，已得到第一版覆盖统计：

- manifest 总记录数：`1126`
- NoXI 记录数：`1106`
- RECOLA 记录数：`20`
- 完整 AV + Emotion + 3D 记录数：`1124`
- 缺少情绪标签的记录数：`2`
- 转录模板记录数：`1126`
- 当前转录工作流状态：`pending_asr=1126`

这些数字会随着后续数据补充或清洗而变化，但任何变化都应通过重新生成 manifest 和 QC 报告来体现，而不是手工修改文档数字。

## 17. 外部中文 ASR 公开评测集规范

### 17.1 用途边界

- 仅用于中文普通话 ASR 公开基线评测
- 当前仓库中的正式 ASR WER/SER 默认以该中文公开评测链为准
- 不参与企业多模态融合、角色映射和风险识别
- 不写入 `data/manifests/val_manifest.jsonl`
- 不写入 `data/derived/transcripts/val_transcripts_template.jsonl`

### 17.2 当前接入数据集

- 数据集：`MAGICDATA Mandarin Chinese Read Speech Corpus`
- 原始压缩包目录：`data/external/asr/magicdata-zh/raw/`
- 解压目录：`data/external/asr/magicdata-zh/extracted/`
- 关键元数据文件：
  - `dev/TRANS.txt`
  - `test/TRANS.txt`
  - `SPKINFO.txt`

### 17.3 派生产物

- 全量参考清单：`data/derived/transcripts-local/magicdata_eval_all.jsonl`
- 冻结评测子集：`data/derived/transcripts-local/magicdata_eval_core.jsonl`
- 导入摘要：`data/derived/eval-local/magicdata_import_summary.json`
- 基线报告：`data/derived/eval-local/magicdata_asr_baseline_report.md`
- 基线详情：`data/derived/eval-local/magicdata_asr_baseline_details.json`

### 17.4 记录字段约定

MAGICDATA 派生记录沿用当前转录工作流结构，但做以下约束：

- `dataset=magicdata_zh`
- `split` 只允许 `dev` 或 `test`
- `session_id` 使用 `speaker_id`
- `canonical_role` 固定为 `speaker_a`
- `audio_path` 与 `audio_path_16k_mono` 默认相同，因为当前抽检音频已是 `16kHz mono wav`
- `final_text` 与 `final_text_normalized` 使用官方 `TRANS.txt` 文本
- `reviewer=dataset_reference:magicdata-zh`
- `transcript_source=magicdata_official_transcript`

### 17.5 锁定规则

- 全量参考清单默认 `locked_for_eval=false`
- 只有冻结子集中的记录才写成 `locked_for_eval=true`
- 正式中文 WER/SER 只针对冻结子集计算，避免误触发整套公开数据的高成本 API 评测
- 当前默认冻结策略为每个可用 `split + speaker_gender` 组各选 `12` 条；在当前本地数据上会得到 `36` 条正式中文评测样本

### 17.6 版本控制约束

- `data/external/` 下的原始和解压数据不进入版本库
- `data/derived/transcripts-local/` 与 `data/derived/eval-local/` 下的公开语料派生产物不进入版本库
- 仓库只提交脚本、测试和文档，不提交 MAGICDATA 原文文本和音频派生内容

### 17.7 默认评测口径

- 后续如未特别说明，ASR 指标、WER、SER、回归门禁默认指 `data/external/asr` 下中文公开评测链的结果
- 当前默认数据集为 `MAGICDATA Mandarin Chinese Read Speech Corpus`
- NoXI/RECOLA 法语、德语样本不再作为正式 ASR 金标来源
- NoXI/RECOLA 继续用于企业多模态验证、离线回放、时延抽样和数字人驱动离线验证
