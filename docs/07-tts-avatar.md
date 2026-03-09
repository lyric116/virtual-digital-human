# TTS 与双数字人驱动实施方案

## 1. 在整体技术路线中的位置

TTS 与数字人驱动模块负责把 LLM 的结构化回复变成真正可感知的表达，是“陪护感”的核心来源。赛题要求至少 2 个数字人，并提交可执行的面部行为驱动工程，因此该模块必须单独成体系，而不是简单播放一段音频。

## 2. 模块目标

- 支持 2 个差异化数字人角色。
- 将文本转为自然中文语音。
- 根据回复内容、情绪和阶段生成口型、表情、动作参数。
- 输出统一驱动协议，便于后续切换 2D/3D 引擎。

## 3. 角色设计

建议角色如下：

- `avatar_a`：温柔陪伴型，语速较慢，表情柔和，动作幅度小
- `avatar_b`：理性引导型，语气更坚定，动作更明确，适合总结和建议

两者差异不要只体现在立绘，还要体现在：

- 声线
- 停顿节奏
- 默认表情强度
- 干预话术风格

## 4. TTS 方案

仓库当前在步骤 30 的可运行基线使用 `edge-tts` 单声线中文合成：

- 基线引擎：`edge-tts`
- 当前输出：`mp3 + duration_ms + voice_id + audio_url`
- 当前目标：先把“文字 -> 可播放语音资产”跑通，不在这一步引入多角色口型和表情驱动

后续若要冲高到比赛最终形态，再切到本地中文 TTS：

- 目标候选：`CosyVoice2` 或同等级中文多说话人 TTS
- 升级输出：`wav + duration + speaker_id`

## 5. 数字人表现层方案

### 基线方案

- 使用 2D 分层角色
- 前端用 `Canvas/WebGL` 渲染
- 表情、眼睛、嘴部、肩部做参数化控制

### 升级方案

- 保留统一驱动协议，后期可替换为 Live2D 或 3D 引擎

比赛阶段建议先做 2D 基线，优先保证“能运行、能切角色、能口型同步”。

当前仓库在步骤 30 只完成第一层：

- `services/tts-service` 提供 `POST /internal/tts/synthesize`
- 先使用单声线 `TTS_VOICE_A`
- 将合成音频落到 `data/derived/tts_audio/`
- 返回可直接用于浏览器播放的 `audio_url`

## 6. 驱动协议

统一输出如下：

```json
{
  "avatar_id": "avatar_a",
  "audio_url": "/media/tts/001.wav",
  "viseme_seq": [
    {"t": 0, "v": "A"},
    {"t": 120, "v": "O"}
  ],
  "expression": {
    "valence": -0.1,
    "arousal": 0.2,
    "emotion": "warm"
  },
  "gesture": "soft_nod",
  "subtitle": "我们先慢一点，把这件事说清楚。"
}
```

## 7. 口型生成方案

### V1 保底方案

- 基于 TTS 文本做拼音切分
- 将拼音映射为有限个 viseme
- 使用音频能量平滑嘴巴开合幅度

### V2 提升方案

- 使用轻量 `audio2viseme` 模型
- 输入 mel 特征，输出更平滑的嘴型序列

比赛冲刺建议先落地 V1，确保工程稳定；再视时间升级 V2。

## 8. 表情与动作控制

输入信号来自：

- `emotion`
- `risk_level`
- `stage`
- `avatar_style`

映射规则示例：

- `anxious + intervene` -> 温和关注表情 + 轻点头
- `high_risk + handoff` -> 严肃、稳定、减少夸张动作
- `reassess` -> 中性表情 + 等待姿态

## 9. 独立工程交付要求

为满足“可执行面部行为驱动模型工程文件”要求，建议单独交付：

- `train.py`
- `infer.py`
- `evaluate.py`
- `demo.py`
- `weights/`
- `README.md`

即便 V1 使用规则生成，也要保留训练与评测脚手架，为后续升级留接口。

## 10. 接口设计

- `POST /tts/synthesize`
- `POST /avatar/drive`
- `GET /avatar/catalog`

`/avatar/drive` 输入：

- `text`
- `audio_uri`
- `emotion`
- `risk_level`
- `stage`
- `avatar_id`

输出：

- `viseme_seq`
- `expression`
- `gesture`
- `subtitle`

## 11. 风险与规避

- TTS 太慢：优先缓存常用固定话术，长句流式分段合成。
- 口型不准：V1 用“可接受同步”而非“逐音素严格对齐”。
- 角色区分度不够：必须在音色、语速、动作三方面同时做区分。

## 12. 验收标准

- 两个数字人可切换，且风格差异明显。
- 回复能转为语音并驱动嘴型和表情。
- 即使数字人驱动失败，也可回退到音频+字幕模式。
- 独立驱动工程可单独运行并产出示例动画参数。

## 13. 企业 3D 特征的离线验证路径

企业数据中的 `3D_FV_files` 应作为数字人驱动模块的离线验证输入，而不是在线运行的硬依赖。

- 离线验证时优先读取 manifest 中的 `face3d_path`，默认忽略 `_full.npy`。
- 驱动评测样本统一按 `canonical_role` 组织，不直接把 `Expert_video`、`P41` 等原始角色名写入内部推理逻辑。
- 当 `emotion_path` 存在时，可将 3D 驱动输出与情绪标签一起做一致性检查，用于答辩展示“表情驱动不是纯随机动画”。
- 在线演示链路仍以 TTS 驱动为主，企业 3D 特征主要用于离线校验和评测报告。
