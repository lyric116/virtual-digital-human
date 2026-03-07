# Architecture

## Purpose

This file records stable architectural understanding that future developers need in order
to keep implementation decisions consistent. It should explain current repository structure,
key file roles, module responsibilities, and new architecture insights discovered during
implementation.

## Repository Map

### `apps/`

- `apps/web`: frontend application shell
- `apps/api-gateway`: external API entrypoint and session-facing APIs
- `apps/orchestrator`: workflow orchestration across model and media services

### `services/`

- `services/asr-service`: speech recognition and offline evaluation service
- `services/affect-service`: multimodal affect and risk inference
- `services/rag-service`: knowledge retrieval
- `services/dialogue-service`: dialogue state machine and structured LLM output
- `services/tts-service`: speech synthesis
- `services/avatar-driver-service`: avatar playback and behavior driving

### `libs/`

- `libs/shared-schema`: shared JSON/event contracts
- `libs/prompt-templates`: reusable prompt and intervention templates
- `libs/eval-tools`: evaluation helpers

### `infra/`

- `infra/docker`: Dockerfiles
- `infra/compose`: compose definitions
- `infra/nginx`: reverse proxy and gateway config

### `data/`

- `data/val`: raw enterprise validation data, read-only
- `data/manifests`: sample index and mapping files
- `data/derived`: all generated assets including audio, transcripts, review tasks, and QC reports

### `scripts/`

- `build_data_artifacts.py`: rebuild manifest, transcript workflow, and QC report
- `prepare_asr_audio.py`: generate standardized `16kHz mono` ASR inputs
- `write_asr_drafts.py`: select ASR batches, import results, call external ASR
- `generate_review_checklist.py`: turn ASR draft batches into human review tasks

## Module Responsibilities

- The current stable core is the data workflow, not the product runtime.
- `val_manifest.jsonl` is the primary sample index for all offline data consumption.
- `val_transcripts_template.jsonl` is the central transcript workflow state machine.
- `qc_report.md` is the operational truth source for sample coverage and workflow status.
- `audio_16k_mono/` is the only approved offline ASR input source.

## Architecture Insights

Automation appends new insights under the marker block below.

<!-- architecture:insights:start -->

## 2026-03-07 - Demo Mode Now Has A Stable Asset Root

- data/demo is now the canonical location for lightweight mock and replay assets, and later frontend or orchestrator mock flows should consume these files instead of embedding one-off fixtures in code.
- Early export behavior should target the shape in data/demo/session_export_sample.json so session export remains predictable before live APIs are implemented.

## 2026-03-07 - Verified Table Names And Keys Are Now Stable

- The baseline PostgreSQL surface is now fixed to sessions, messages, system_events, evaluation_records, and media_indexes, and later service code should reuse these names instead of inventing parallel tables for the same concerns.
- Replay lineage fields record_id, dataset, canonical_role, and segment_id now exist directly in the session and evaluation storage model so enterprise data replay can share the same tracing model as live sessions.

## 2026-03-07 - Foundation Infra Is Now A Verified Baseline

- infra/compose/docker-compose.yml is now the canonical foundation stack for local development and must remain limited to PostgreSQL, Redis, and MinIO until application services are added step by step.
- Foundation verification now depends on named volumes plus explicit marker checks after restart, so future infra changes must preserve persistence semantics instead of only checking container liveness.

## 2026-03-07 - Event Envelope And Replay Identifiers Are Now Locked

- All cross-service realtime traffic now centers on a shared event envelope with event_id, event_type, schema_version, source_service, session_id, trace_id, emitted_at, and payload.
- Offline replay identifiers record_id, dataset, canonical_role, and segment_id are now part of the canonical contract surface so replay and live paths can converge without renaming fields.

## 2026-03-07 - Canonical Environment Variables Now Have A Single Source Of Truth

- docs/environment.md and .env.example are now the required source of truth for runtime configuration across web, gateway, orchestrator, infra, and model services.
- Compatibility aliases such as OPENAI_API_KEY, DASHSCOPE_API_KEY, key, baseurl, and model are explicitly quarantined to current ASR bridge tooling and should not leak into new service code.

## 2026-03-07 - Transcript Workflow Is The Current Core Integration Layer

- `data/derived/transcripts/val_transcripts_template.jsonl` is now the most important
  integration file in the repository.
- It is the handoff layer between:
  - raw enterprise data
  - external ASR output
  - human review
  - later text-based evaluation and replay
- Future ASR, text analysis, replay, and evaluation work should use transcript workflow
  state instead of inventing separate tracking tables.

## 2026-03-07 - DashScope Qwen3 ASR Requires Compatible-Mode Routing

- `qwen3-asr-flash` works for real ASR calls in this repository.
- The successful path is the DashScope OpenAI-compatible route:
  - `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Pointing the current ASR script at
  `https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription`
  is not compatible with the current `transcribe-openai` implementation.

## 2026-03-07 - Human Review Is Mandatory, Not Cosmetic

- First real ASR drafts contain French content while transcript metadata still defaults
  to `zh-CN`.
- This proves transcript review must validate:
  - transcript text
  - punctuation and omissions
  - language metadata
  - review flags
- No later evaluation step should treat `draft_ready` as equivalent to verified text.
<!-- architecture:insights:end -->
