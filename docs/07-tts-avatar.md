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
- 当前输出：`audio_format(mp3/wav) + duration_ms + voice_id + audio_url`
- 当前目标：先把“文字 -> 可播放语音资产”跑通，不在这一步引入多角色口型和表情驱动
- 当前容错：远端 `edge-tts` 超时或失败时，`tts-service` 会回退为本地生成的 `wav` 资产，保证主链路不断

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

步骤 31 已把这条链路接到前端：

- `apps/web` 在收到 `dialogue.reply` 后直接请求 `services/tts-service`
- 数字人区域会显示字幕、播放状态、声线和时长
- 浏览器会尝试自动播放最新回复，同时保留 `Replay Voice` 作为回放入口
- TTS 失败不会打断文本主链路，页面仍保留字幕和原始回复
- `tts-service` 现在会按当前 HTTP 请求的 base URL 返回 `audio_url`，避免浏览器拿到
  Docker 内部地址 `http://tts-service:8040/...`
- 前端会再做一层 URL 归一化，把内部服务地址映射回 `ttsBaseUrl`
- 自动播放失败或媒体加载失败时，界面会回到 `ready` 并提示可重试，而不是把语音状态长期停在浏览器原始错误文案

步骤 32 已补上最小数字人舞台：

- `apps/web` 现在只渲染一个静态 2D 角色基线，不提前引入第二角色
- 角色只区分 `idle` 和 `speaking` 两态，状态直接绑定当前 TTS 播放状态
- 这一步不做嘴型驱动和复杂表情，只确保“角色在说话”和“角色已等待”两个状态可见

步骤 33 已补上基础嘴型联动：

- 当前不引入音素模型，而是基于回复文本和 `duration_ms` 生成粗粒度嘴型 cue 序列
- 前端在播放期按时间推进 `closed / small / wide / round` 四类嘴型
- 播放结束、失败或中断后，嘴型会强制回到 `closed`
- 这条链路的目标只是让“语音播放期间嘴巴持续变化”，不是追求逐音素精度

步骤 35A 已补上企业 3D 特征离线验证：

- `services/avatar-driver-service` 提供 `POST /internal/avatar/offline-drive`
- 服务直接读取 manifest 中的 `face3d_path` 和可选 `emotion_path`
- 当前输出是抽样驱动帧、对齐状态、情绪摘要，不修改在线演示链路
- 当前报告产物写入 `data/derived/avatar_driver/offline_validation_report.md`

步骤 34 已补上第二个数字人：

- 前端现在提供两个可选静态角色：`companion_female_01` 和 `coach_male_01`
- 角色切换至少带来两项可见变化：
  - 角色舞台的视觉风格变化
  - TTS 声线变化
- 当前 `services/tts-service` 中的别名映射为：
  - `companion_female_01 -> zh-CN-XiaoxiaoNeural`
  - `coach_male_01 -> zh-CN-YunxiNeural`
- 当前版本把角色选择视为表现层和会话入口参数，不引入额外的人设记忆系统
- 验证脚本：
  - `scripts/verify_web_avatar_switch.py`

步骤 35 已将业务阶段映射到表情预设：

- 当前前端不追求细粒度骨骼动画，而是将 `stage + emotion + risk_level` 收敛成稳定预设
- 当前基线预设包括：
  - `ready_idle`
  - `open_warm`
  - `focused_assess`
  - `steady_support`
  - `calm_checkin`
  - `guarded_handoff`
- 当前规则以安全边界优先：
  - `risk_level=high` 或 `stage=handoff` 时强制进入 `guarded_handoff`
  - 避免高风险场景出现过度轻快、过亮的视觉状态
- 当前实现位置：
  - `apps/web/app.js`
  - `apps/web/styles.css`
- 验证脚本：
  - `scripts/verify_web_avatar_expression_presets.py`

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
