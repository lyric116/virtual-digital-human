# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

This repo uses `uv` and Python 3.11+.

- Run tests:
  - `UV_CACHE_DIR=.uv-cache uv run pytest`
- Run one test file:
  - `UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_gateway_session_create.py`
- Run one test by keyword:
  - `UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_gateway_session_create.py -k schedules_background_pipeline`
- Run lint:
  - `UV_CACHE_DIR=.uv-cache uv run ruff check .`

## Local startup

From repository root:

- Web shell: `python3 -m http.server 4173 --directory apps/web`
- Gateway: `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`
- Orchestrator: `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/orchestrator main:app --host 0.0.0.0 --port 8010`
- ASR: `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/asr-service main:app --host 0.0.0.0 --port 8020`
- Dialogue: `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/dialogue-service main:app --host 0.0.0.0 --port 8030`
- TTS: `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/tts-service main:app --host 0.0.0.0 --port 8040`
- Avatar driver: `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/avatar-driver-service main:app --host 0.0.0.0 --port 8050`
- Affect: `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/affect-service main:app --host 0.0.0.0 --port 8060`
- RAG: `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/rag-service main:app --host 0.0.0.0 --port 8070`

Useful end-to-end checks:

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_start.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_realtime_connection.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_text_submit.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_export.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_replay.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_stage_machine.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_fallback_reply.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_rag_grounding.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_regression.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_tts_service.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_session_trace_logging.py`

## Big-picture architecture

This is a multimodal conversation system with a strict separation of responsibilities:

- `apps/web`: static browser shell
- `apps/api-gateway`: session boundary, persistence layer, websocket/event boundary
- `apps/orchestrator`: thin internal coordinator
- `services/*`: modality/model services (ASR, affect, RAG, dialogue, TTS, avatar)

### Main runtime flow

For a normal turn:

1. `apps/web` sends text or finalized audio to `apps/api-gateway`
2. `apps/api-gateway` persists session/message state in PostgreSQL
3. `apps/api-gateway` emits and stores shared event envelopes in `system_events`
4. `apps/api-gateway` calls `apps/orchestrator`
5. `apps/orchestrator` calls `services/rag-service`, then `services/dialogue-service`
6. `apps/api-gateway` persists the assistant reply and pushes realtime events back to the browser
7. The browser calls `services/tts-service` directly for playback
8. The browser can call `services/affect-service` directly for the emotion panel

The gateway owns state. Orchestrator does not.

### Ownership boundaries

- `apps/api-gateway`
  - owns sessions, messages, `system_events`, exports, websocket delivery, media indexing, and stage enforcement
  - runs the deterministic high-risk text precheck before normal dialogue orchestration
  - requests affect snapshots and persists `affect.snapshot`
  - records retrieval evidence as `knowledge.retrieved` before `dialogue.reply`
  - stores every-third-user-turn summaries in `sessions.metadata.dialogue_summary`

- `apps/orchestrator`
  - coordinates retrieval plus dialogue calls
  - proxies summary generation
  - does not own persistence or final dialogue schema

- `services/dialogue-service`
  - owns the dialogue reply schema boundary
  - validates/coerces model output into the shared reply contract
  - returns safe fallback replies on upstream LLM failure
  - short-circuits multimodal conflict into clarification-first replies
  - applies RAG grounding when `metadata.knowledge_cards` is present

- `services/rag-service`
  - loads `data/kb/knowledge_cards.jsonl`
  - builds an in-memory sparse retrieval index
  - applies stage/risk filtering, with a high-risk safe-category guardrail

- `services/asr-service`
  - standalone whole-file ASR endpoint used by gateway live paths and offline evaluation
  - request body is raw audio bytes; filename/record_id are query params

- `services/tts-service`
  - browser-facing synthesis endpoint used directly by the web app
  - `edge_tts` first, local wav fallback second

## Data model and contracts

PostgreSQL centers on five tables:

- `sessions`
- `messages`
- `system_events`
- `media_indexes`
- `evaluation_records`

Important invariants:

- `trace_id` should remain stable across session rows, messages, websocket envelopes, persisted events, and exports
- `system_events` is the unified business event log; avoid parallel ad hoc event stores
- uploaded/generated media binaries live in storage; PostgreSQL stores indexes and metadata only

Canonical references:

- contracts: `docs/shared_contracts.md`
- schema: `docs/database_schema.md`
- environment inventory: `docs/environment.md`

## Frontend config caveat

The static web shell does not read `.env` directly in the browser. It reads `window.__APP_CONFIG__` from `apps/web/index.html`.

Treat `WEB_PUBLIC_*` values as deployment inputs that must be injected into `window.__APP_CONFIG__`, not as browser-runtime env vars.

## Contract conventions

- payload fields use `snake_case`
- realtime `event_type` values use `lower.dot.case`
- timestamps use ISO 8601 UTC with timezone suffix
- timing fields use explicit unit suffixes such as `duration_ms`
- preserve canonical identifiers: `session_id`, `trace_id`, `message_id`, `record_id`

If changing payloads, events, or export shape, check `docs/shared_contracts.md` first and verify both realtime and replay/export behavior.

## Rules files

No repository-level `.cursorrules`, `.cursor/rules/`, or `.github/copilot-instructions.md` were present when this file was created.
