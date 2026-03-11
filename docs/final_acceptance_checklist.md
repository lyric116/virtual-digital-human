# 最终验收清单

## 1. 当前结论

- 已完成：`9`
- 部分完成：`1`
- 阻塞：`0`

当前项目已经具备答辩演示和继续冲刺优化的基础。唯一明确的未闭环项是
`Docker 统一部署的 live 容器验证`：部署资产已经齐全，但当前代理环境无法
完成 Docker 容器/网络创建，因此需要在本机 Docker 环境里补做最后一次 live
验证。

## 2. 逐项验收

| 验收项 | 状态 | 证据 | 说明 |
| --- | --- | --- | --- |
| 至少 2 个数字人形象 | `done` | `docs/07-tts-avatar.md`、`scripts/verify_web_avatar_switch.py`、`tests/test_web_avatar_switch.py` | 已完成双角色切换，视觉和声线均有差异。 |
| 文本交互闭环 | `done` | `scripts/verify_web_text_submit.py`、`scripts/verify_web_mock_reply.py`、`tests/test_web_text_submit.py` | 会话创建、文本发送、回复、时间线恢复与导出均已接通。 |
| 语音交互闭环 | `done` | `scripts/verify_web_audio_final_transcript.py`、`tests/test_web_audio_final_transcript.py`、`services/asr-service/main.py`、`services/tts-service/main.py` | 已完成录音、ASR、回复、TTS 播放和字幕联动。 |
| 摄像头和麦克风接入 | `done` | `scripts/verify_web_camera_capture.py`、`tests/test_web_camera_capture.py`、`tests/test_web_recording_controls.py` | 浏览器已接入麦克风权限、摄像头预览、抽帧和音频上传。 |
| ASR 与指标 | `done` | `data/derived/eval-local/magicdata_asr_baseline_report.md`、`scripts/verify_asr_regression.py` | 中文公开评测基线已完成，当前报告记录 `WER 0.042017`、`SER 0.111111`。 |
| LLM + 心理知识库 | `done` | `data/kb/knowledge_cards.jsonl`、`services/rag-service/main.py`、`scripts/verify_dialogue_rag_grounding.py` | 知识卡片、检索基线和 grounded dialogue 已接通。 |
| 文本/语音/视频三模态融合 | `done` | `services/affect-service/main.py`、`scripts/verify_affect_service.py`、`scripts/verify_dialogue_conflict_clarification.py` | 三路 lane 和第一版融合规则已完成，冲突会触发澄清追问。 |
| 10 轮连续对话 | `done` | `data/derived/eval-local/ten_turn_stability_report.md`、`scripts/verify_ten_turn_stability.py` | 已有 10 轮稳定性报告。 |
| 时延基线 | `done` | `data/derived/eval-local/latency_report.md`、`scripts/verify_latency_report.py` | 当前已经有时延评测基线报告。 |
| Docker 交付与统一部署 | `partial` | `infra/compose/docker-compose.core.yml`、`infra/compose/docker-compose.full.yml`、`scripts/verify_core_compose_stack.py`、`docs/09-deploy-deliverables.md` | 部署资产已完成，`docker compose config` 可通过；仍需在本机 Docker 环境补做 live 容器验证。 |

## 3. 未完成项列表

### 3.1 Docker live 验证

- 现状：`partial`
- 原因：当前代理环境里 `docker compose up` 会在容器/网络创建阶段超时，无法作为最终 live 证据。
- 补做方式：
  - 在本机执行 `docker compose -f infra/compose/docker-compose.full.yml config`
  - 再执行 `docker compose -f infra/compose/docker-compose.full.yml up -d --build`
  - 最后跑一轮完整语音会话验证

## 4. 建议答辩证据顺序

1. 文本闭环：会话创建、发送文本、收到回复、导出记录。
2. 语音闭环：录音、最终转写、回复、TTS 与数字人。
3. 多模态：Emotion Panel 三路状态、融合结果和冲突追问。
4. 工程交付：`core/full compose`、ASR 服务、数字人驱动服务、评测报告。
