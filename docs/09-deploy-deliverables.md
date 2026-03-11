# 部署、交付与答辩准备方案

## 1. 在整体技术路线中的位置

部署与交付模块决定项目是否真正“可落地”。赛题明确要求可执行作品、可执行 ASR 工程、可执行数字人驱动工程，因此从第一周开始就要按交付标准组织仓库、环境和启动流程。

## 2. 交付目标

- 一键启动主系统
- 单独启动 ASR 工程
- 单独启动数字人驱动工程
- 提供完整 README、Docker 配置、示例数据、评测脚本
- 让评委在标准机器上按文档即可跑通

## 3. 推荐目录结构

```text
project/
  apps/
  services/
  libs/
  data/
  infra/
    compose/
    docker/
    nginx/
  docs/
```

部署时重点维护：

- `infra/compose/docker-compose.yml`
- `infra/compose/docker-compose.core.yml`
- `infra/docker/*`
- `.env.example`
- `README.md`

## 4. Docker 化建议

### 容器划分

- `web`
- `gateway-service`
- `orchestrator-service`
- `asr-service`
- `affect-service`
- `rag-service`
- `dialogue-service`
- `tts-service`
- `avatar-driver-service`
- `postgres`
- `redis`
- `minio`

### 启动原则

- 先基础设施，后业务服务
- 健康检查通过后再开放网关
- 提供 `demo mode` 和 `live mode` 两套 Compose 配置
- 当前仓库已具备一个文本闭环 `core` Compose：
  - `infra/compose/docker-compose.core.yml`
  - 覆盖 `web / gateway / orchestrator / dialogue-service / rag-service / affect-service / tts-service / postgres / redis / minio`
  - 当前 step-51 版本为本地开发型 Compose：Python 服务基于 `python:3.11-slim`，并绑定本地仓库源码和 `.venv/lib/python3.11/site-packages`
  - 这意味着启动前必须先在宿主机完成 `uv sync`
- 当前 step-52 已补齐完整部署配置：
  - `infra/compose/docker-compose.full.yml`
  - 在 `core` 基础上加入 `asr-service` 与 `avatar-driver-service`

## 5. 环境变量清单

至少维护以下变量：

- `POSTGRES_URL`
- `REDIS_URL`
- `MINIO_ENDPOINT`
- `LLM_BASE_URL`
- `ASR_MODEL_PATH`
- `TTS_MODEL_PATH`
- `AVATAR_MODEL_PATH`
- `DEMO_MODE`

所有变量都必须写进 `.env.example`，不要把配置散落在代码里。

## 6. README 结构

README 至少包含：

- 项目简介
- 硬件与系统要求
- 一键启动命令
- 模块列表
- Demo 模式说明
- 评测脚本使用方式
- 常见故障排查

## 7. Demo 模式设计

Demo 模式是比赛交付保底：

- 提供固定音频、固定视频帧、固定转写
- 提供预置风险场景
- 支持双数字人切换
- 支持离线回放，不依赖全部模型实时工作

这样即使个别模型现场不稳定，也能保证作品可展示。

## 8. 最终交付清单

- 主系统 Docker 工程
- 独立 ASR 工程
- 独立数字人驱动工程
- 心理知识库数据与导入脚本
- 评测脚本与实验结果
- 演示脚本与样例会话
- 方案文档与答辩材料

## 9. 答辩准备建议

现场展示应固定为三段：

1. 主链路演示：语音输入到数字人回应
2. 多模态演示：三路状态与冲突追问
3. 工程交付演示：Docker 启动、ASR 工程、驱动工程、评测表

评委通常更关心“为什么稳定可交付”，所以一定要展示日志、指标和独立工程目录。

## 10. 风险与规避

- 模型依赖大：提前把模型路径和缓存目录写入部署脚本。
- 机器差异：在 README 中固定操作系统、显卡、驱动版本建议。
- 网络不稳定：比赛现场优先使用本地模型和本地资源。

## 11. 验收标准

- 新机器按 README 能在可接受时间内跑起来。
- 主系统与两个独立工程均能单独演示。
- `demo mode` 可在弱网络环境或离线环境运行。
- 交付包结构清晰，评委无需猜测入口文件和启动顺序。
- 当前仓库已维护步骤 53 验收资产：
  - `docs/final_acceptance_checklist.md`
  - `docs/final_acceptance_checklist.json`
  - `scripts/verify_final_acceptance_assets.py`

## 12. 数据挂载与交付边界

企业验证集体量较大，部署与交付必须明确数据边界。

- Docker 镜像默认不内置 `data/val` 原始数据，改为通过只读挂载方式接入。
- 镜像内应包含 `data/manifests/val_manifest.jsonl`、角色映射和标签映射等轻量元数据文件。
- README 中要明确区分“无原始验证集也可运行的 demo mode”和“挂载验证集后的离线评测模式”。
- 这样既能减小交付体积，也能避免现场因拷贝大文件导致部署失败。
- 转录模板 `data/derived/transcripts/val_transcripts_template.jsonl` 和质检报告 `data/derived/qc_report.md` 也应作为轻量交付件保留，便于评委直接看到数据治理结果。
