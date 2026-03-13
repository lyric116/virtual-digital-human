# Environment Inventory

## Purpose

This document is the canonical inventory for runtime configuration in this repository.
Every service-level variable must appear here and in `.env.example` before it is used in
code or deployment files.

## Rules

1. Use uppercase snake case for all canonical variables.
2. Do not commit secrets. `.env.example` must contain placeholders only.
3. Prefer canonical variables in new code. Compatibility aliases are temporary bridges.
4. If both a canonical variable and an alias exist, code should prefer the canonical one.
5. Update this file, `.env.example`, and related tests in the same commit.

## Common Runtime

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `APP_ENV` | Yes | `development` | Runtime mode shared by all services. |
| `LOG_LEVEL` | Yes | `INFO` | Baseline logging verbosity. |
| `TRACE_HEADER` | Yes | `X-Trace-Id` | Header name used to propagate trace ids. |
| `SESSION_EXPORT_DIR` | No | `data/exports` | Default local export path before MinIO is enabled. |
| `MEDIA_STORAGE_ROOT` | No | `data/derived/live_media` | Local storage root for uploaded media chunks before MinIO is enabled. |

## Web

The static web shell under `apps/web/` does not parse `.env` at runtime. It reads
`window.__APP_CONFIG__` from the served HTML. The `WEB_PUBLIC_*` values below are the
canonical deployment inputs that should be injected into that object during local preview
or deployment.

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `WEB_PUBLIC_API_BASE_URL` | Yes | `http://localhost:8000` | Canonical API base URL that should be injected into `window.__APP_CONFIG__.apiBaseUrl`. |
| `WEB_PUBLIC_WS_URL` | Yes | `ws://localhost:8000/ws` | Canonical realtime URL that should be injected into `window.__APP_CONFIG__.wsUrl`. |
| `WEB_PUBLIC_TTS_BASE_URL` | Yes | `http://localhost:8040` | Canonical TTS base URL that should be injected into `window.__APP_CONFIG__.ttsBaseUrl`. |
| `WEB_PUBLIC_AFFECT_BASE_URL` | Yes | `http://localhost:8060` | Canonical affect base URL that should be injected into `window.__APP_CONFIG__.affectBaseUrl`. |
| `WEB_DEFAULT_AVATAR_ID` | No | `companion_female_01` | Default avatar shown before session state loads. |
| `WEB_AUTOPLAY_ASSISTANT_AUDIO` | No | `true` | Whether the rendered browser config should autoplay assistant speech when the web app receives synthesized audio. |

## Gateway

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `GATEWAY_HOST` | Yes | `0.0.0.0` | Bind address for the gateway service. |
| `GATEWAY_PORT` | Yes | `8000` | External HTTP port for gateway APIs. |
| `GATEWAY_PUBLIC_BASE_URL` | Yes | `http://localhost:8000` | Public base URL used in generated links and callbacks. |
| `GATEWAY_WS_PATH` | Yes | `/ws` | WebSocket path used by the frontend. |
| `GATEWAY_CORS_ORIGINS` | Yes | `http://127.0.0.1:4173,http://localhost:4173` | Comma-separated browser origins allowed to call the gateway during local frontend preview. |

## Orchestrator

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `ORCHESTRATOR_HOST` | Yes | `0.0.0.0` | Bind address for workflow orchestration. |
| `ORCHESTRATOR_PORT` | Yes | `8010` | Internal HTTP port for orchestration APIs. |
| `ORCHESTRATOR_BASE_URL` | Yes | `http://127.0.0.1:8010` | Gateway-facing base URL used for internal orchestration calls. |
| `ORCHESTRATOR_REQUEST_TIMEOUT_SECONDS` | Yes | `60` | Upper bound for one orchestration request. |

## Dialogue Service

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `DIALOGUE_SERVICE_HOST` | Yes | `0.0.0.0` | Bind address for dialogue schema and generation service. |
| `DIALOGUE_SERVICE_PORT` | Yes | `8030` | Internal HTTP port for dialogue-service APIs. |
| `DIALOGUE_SERVICE_BASE_URL` | Yes | `http://127.0.0.1:8030` | Orchestrator-facing base URL used for validated dialogue reply calls. |

## Affect Service

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `AFFECT_SERVICE_HOST` | Yes | `0.0.0.0` | Bind address for the affect placeholder and later multimodal inference service. |
| `AFFECT_SERVICE_PORT` | Yes | `8060` | HTTP port for the standalone affect service. |
| `AFFECT_SERVICE_BASE_URL` | Yes | `http://127.0.0.1:8060` | Browser-facing base URL used by the step-37 emotion panel. |
| `AFFECT_CORS_ORIGINS` | Yes | `http://127.0.0.1:4173,http://localhost:4173` | Browser origins allowed to call the affect service directly during frontend preview. |

## RAG Service

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `RAG_SERVICE_HOST` | Yes | `0.0.0.0` | Bind address for the standalone retrieval service. |
| `RAG_SERVICE_PORT` | Yes | `8070` | HTTP port for the standalone RAG service. |
| `RAG_SERVICE_BASE_URL` | Yes | `http://127.0.0.1:8070` | Base URL used by future internal callers when step 45 wires retrieval into dialogue. |
| `RAG_CARDS_PATH` | Yes | `data/kb/knowledge_cards.jsonl` | Canonical curated knowledge-card dataset path loaded at service startup. |
| `RAG_DEFAULT_TOP_K` | Yes | `3` | Default number of cards returned when callers do not specify `top_k`. |
| `RAG_MAX_TOP_K` | Yes | `5` | Hard upper bound for returned card count in the step-44 baseline. |

## PostgreSQL

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | `postgresql://app:app@localhost:5432/virtual_human` | Canonical SQLAlchemy or application DSN. |
| `POSTGRES_URL` | No | Same as `DATABASE_URL` | Compatibility alias for deployment scripts. |
| `POSTGRES_HOST` | Yes | `localhost` | Database host for compose and local tooling. |
| `POSTGRES_PORT` | Yes | `5432` | Database port. |
| `POSTGRES_DB` | Yes | `virtual_human` | Database name. |
| `POSTGRES_USER` | Yes | `app` | Database user. |
| `POSTGRES_PASSWORD` | Yes | `change_me` | Database password. |

## Redis

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `REDIS_URL` | Yes | `redis://localhost:6379/0` | Canonical cache DSN. |
| `REDIS_HOST` | Yes | `localhost` | Redis host. |
| `REDIS_PORT` | Yes | `6379` | Redis port. |
| `REDIS_DB` | Yes | `0` | Redis logical database. |
| `REDIS_PASSWORD` | No | empty | Redis password if enabled. |

## MinIO

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `MINIO_ENDPOINT` | Yes | `localhost:9000` | MinIO API endpoint. |
| `MINIO_API_PORT` | Yes | `9000` | Host port for the MinIO S3-compatible API. |
| `MINIO_CONSOLE_PORT` | Yes | `9001` | Host port for the MinIO admin console. |
| `MINIO_ACCESS_KEY` | Yes | `minioadmin` | MinIO access key. |
| `MINIO_SECRET_KEY` | Yes | `minioadmin` | MinIO secret key. |
| `MINIO_SECURE` | Yes | `false` | Toggle HTTPS when connecting to MinIO. |
| `MINIO_BUCKET_RAW` | Yes | `vdh-raw` | Bucket for raw uploaded media. |
| `MINIO_BUCKET_DERIVED` | Yes | `vdh-derived` | Bucket for derived assets and exports. |
| `MINIO_BUCKET_LOGS` | No | `vdh-logs` | Bucket for trace exports and offline reports. |

## LLM

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `LLM_PROVIDER` | Yes | `openai_compatible` | Logical provider name used by dialogue service. |
| `LLM_BASE_URL` | Yes | `https://api.openai.com/v1` | Base URL for the selected LLM provider. For the current dialogue path, point this to the OpenAI-compatible endpoint that serves your configured reasoning model. |
| `LLM_API_KEY` | Yes | empty | API key for the selected LLM provider. |
| `LLM_MODEL` | Yes | `gpt-5.2` | Model identifier for structured dialogue generation and summary generation. |
| `LLM_TIMEOUT_SECONDS` | Yes | `60` | End-to-end timeout per LLM request. |
| `LLM_CONTEXT_WINDOW` | Yes | `8192` | Minimum supported context budget for prompts and history. |
| `DIALOGUE_FORCE_FAILURE_MODE` | No | empty | Verifier-only fault injection switch for step 29. Supported values: `timeout`, `empty`, `invalid_json`, `invalid_fields`. |

## ASR

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `ASR_SERVICE_HOST` | Yes | `0.0.0.0` | Bind address for the standalone ASR service. |
| `ASR_SERVICE_PORT` | Yes | `8020` | HTTP port for the standalone ASR service. |
| `ASR_PROVIDER` | Yes | `dashscope` | Logical provider name for ASR. |
| `ASR_BASE_URL` | Yes | `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` | Canonical ASR endpoint used by the standalone service for `qwen3-asr-flash`. |
| `ASR_API_KEY` | Yes | empty | Canonical ASR credential read by `services/asr-service` itself at startup/runtime; browser and gateway do not forward this secret. |
| `ASR_MODEL` | Yes | `qwen3-asr-flash` | Primary ASR model identifier. |
| `ASR_LANGUAGE_HINT` | No | `auto` | Optional language hint for external ASR. |
| `ASR_TIMEOUT_SECONDS` | Yes | `60` | ASR request timeout. |
| `ASR_MODEL_PATH` | No | empty | Local model path when switching from API to self-hosted ASR. |
| `ASR_POSTPROCESS_ENABLED` | Yes | `true` | Toggle silence-based segmentation, punctuation restoration, and hotword cleanup inside the ASR service. |
| `ASR_SILENCE_WINDOW_MS` | Yes | `200` | Window size used when scanning wav amplitude for silence spans. |
| `ASR_SILENCE_MIN_DURATION_MS` | Yes | `350` | Minimum pause length treated as a segmentation boundary. |
| `ASR_SILENCE_THRESHOLD_RATIO` | Yes | `0.015` | Silence threshold as a ratio of the wav sample amplitude ceiling. |
| `ASR_HOTWORD_MAP_PATH` | Yes | `services/asr-service/hotwords.json` | JSON mapping file for domain hotword normalization after raw ASR. |

## TTS

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `TTS_SERVICE_HOST` | Yes | `0.0.0.0` | Bind address for the standalone TTS service. |
| `TTS_SERVICE_PORT` | Yes | `8040` | HTTP port for the standalone TTS service. |
| `TTS_SERVICE_BASE_URL` | Yes | `http://127.0.0.1:8040` | Public base URL used when the TTS service returns `audio_url`. |
| `TTS_CORS_ORIGINS` | Yes | `http://127.0.0.1:4173,http://localhost:4173` | Browser origins allowed to call the TTS service directly during frontend preview. |
| `TTS_PROVIDER` | Yes | `edge_tts` | Logical provider name for TTS. |
| `TTS_BASE_URL` | No | empty | API endpoint for TTS if a remote provider is used. |
| `TTS_API_KEY` | No | empty | API key for the TTS provider. |
| `TTS_MODEL` | No | empty | TTS model identifier. |
| `TTS_VOICE_A` | Yes | `companion_female_01` | Voice id for avatar A. |
| `TTS_VOICE_B` | Yes | `coach_male_01` | Voice id for avatar B. |
| `TTS_AUDIO_FORMAT` | Yes | `mp3` | Preferred output format consumed by avatar playback. The service may still return `wav` when the local fallback path takes over. |
| `TTS_EDGE_TIMEOUT_SECONDS` | Yes | `18` | Maximum wait time for the remote `edge_tts` path before the service falls back locally. |
| `TTS_ENABLE_WAVE_FALLBACK` | Yes | `true` | Whether `tts-service` should generate a local fallback `wav` asset when the remote path times out or fails. |
| `TTS_MODEL_PATH` | No | empty | Local path for self-hosted TTS weights. |
| `TTS_STORAGE_ROOT` | Yes | `data/derived/tts_audio` | Local directory used by the TTS service to store generated speech assets. |

## Avatar Driver

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `AVATAR_DRIVER_HOST` | Yes | `127.0.0.1` | Bind address for avatar driver service. |
| `AVATAR_DRIVER_PORT` | Yes | `8050` | Avatar driver port. |
| `AVATAR_PROTOCOL_VERSION` | Yes | `v1` | Version of the driver payload contract. |
| `AVATAR_DEFAULT_ID_A` | Yes | `companion_female_01` | Default avatar id for companion role. |
| `AVATAR_DEFAULT_ID_B` | Yes | `coach_male_01` | Default avatar id for guide role. |
| `AVATAR_MODEL_PATH` | No | empty | Local path for face-driving or animation model assets. |

## Current Baseline

- ASR has been validated with `qwen3-asr-flash`.
- The working primary route is DashScope native multimodal generation:
  `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`.
- The ASR service keeps DashScope OpenAI-compatible mode as a transport fallback when
  native calls fail.
- The required variables for current ASR tooling are:
  - `ASR_API_KEY`
  - `ASR_BASE_URL`
  - `ASR_MODEL`
- The ASR service now also owns a deterministic postprocess layer controlled by:
  - `ASR_POSTPROCESS_ENABLED`
  - `ASR_SILENCE_WINDOW_MS`
  - `ASR_SILENCE_MIN_DURATION_MS`
  - `ASR_SILENCE_THRESHOLD_RATIO`
  - `ASR_HOTWORD_MAP_PATH`
