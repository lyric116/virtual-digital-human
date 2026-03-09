# API Gateway

## Purpose

This gateway currently covers steps 8, 10, 11, 12, 13, 14, 15, 17, 19, 20, 25, 26, and 27:

- step 8: create a session row in PostgreSQL
- step 10: provide a session-level realtime WebSocket with ready and heartbeat events
- step 11: accept plain text input, write it into PostgreSQL, and emit `message.accepted`
- step 12: call the mock orchestrator, persist the assistant reply, and emit
  `dialogue.reply`
- step 13: expose session state and ordered message history so the frontend can
  restore the chat timeline after refresh
- step 14: export session metadata, message history, stage history, and persisted
  system events as a single JSON response
- step 15: keep one stable `trace_id` across session rows, message rows, realtime
  envelopes, system events, and exported session artifacts
- step 17: accept fixed-window audio chunk uploads, store the binary locally, and
  persist temporary `audio_chunk` rows in `media_indexes`
- step 19: accept one finalized recording, call the standalone ASR service, persist an
  `audio_final` asset plus an `audio` user message, and reuse the existing realtime
  `message.accepted -> dialogue.reply` pipeline
- step 20: accept preview snapshots of the in-progress recording, call the standalone ASR
  service for a best-effort partial transcript, and emit `transcript.partial` immediately
  over the session realtime channel without persisting a new message row
- step 25: enforce the dialogue stage machine at persistence time so assistant replies
  can only move through `engage -> assess -> intervene -> reassess -> handoff` without
  invalid jumps
- step 26: package the recent dialogue turns as short-term memory and forward them to
  the dialogue service without adding any long-term profile layer
- step 27: generate and persist a compact dialogue summary every three user turns so
  longer sessions stop relying only on raw recent turns

## Files

- `main.py`
  - FastAPI app, request models, orchestrator bridge, and PostgreSQL-backed session repository

## Endpoints

- `GET /health`
- `POST /api/session/create`
- `GET /api/session/{session_id}/state`
- `GET /api/session/{session_id}/export`
- `POST /api/session/{session_id}/text`
- `POST /api/session/{session_id}/audio/chunk`
- `POST /api/session/{session_id}/audio/preview`
- `POST /api/session/{session_id}/audio/finalize`
- `GET /ws/session/{session_id}` as a WebSocket upgrade endpoint

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`

## Notes

- `POST /api/session/{session_id}/text` now writes both the accepted user message and the
  assistant reply into the `messages` table defined in
  `infra/docker/postgres/init/001_base_schema.sql`.
- `GET /api/session/{session_id}/state` returns the current session metadata and the
  ordered message list used by the frontend to rebuild chat history.
- `GET /api/session/{session_id}/export` reads the current session, ordered messages,
  derived stage history, and persisted `system_events` rows to build the downloadable
  export payload used by the web shell.
- The gateway calls the orchestrator through `ORCHESTRATOR_BASE_URL`.
- `GATEWAY_CORS_ORIGINS` controls which local frontend preview origins can call the API
  from the browser.
- The realtime endpoint currently emits only `session.connection.ready`,
  `session.heartbeat`, `message.accepted`, `dialogue.reply`, and `session.error`.
- `session.created`, `message.accepted`, `dialogue.reply`, and `session.error` are now
  persisted into `system_events` so export and later tracing steps can replay a session
  without reconstructing events from logs.
- The text-first trace contract is now explicit: the session row, every message row,
  every persisted business event, the websocket envelopes, and the export payload all
  carry the same session `trace_id`.
- `POST /api/session/{session_id}/audio/chunk` does not invoke ASR yet; it only stores
  the raw chunk under `MEDIA_STORAGE_ROOT` and records an `audio_chunk` index row.
- `POST /api/session/{session_id}/audio/finalize` stores one complete recording under
  `MEDIA_STORAGE_ROOT`, sends the binary to `services/asr-service`, writes the final
  transcript as a user message with `source_kind='audio'`, and then triggers the same
  mock dialogue flow used by the text path.
- `POST /api/session/{session_id}/audio/preview` accepts a current recording snapshot,
  sends it to `services/asr-service`, and emits `transcript.partial` without changing the
  persisted final-transcript contract introduced in step 19.
- The gateway treats the LLM stage as a proposal, not ground truth. It records
  `stage_before`, `model_stage`, and `stage_machine_reason` in assistant message metadata,
  then emits the resolved stage in `dialogue.reply`.
- When the gateway rewrites a proposed stage, it also rewrites `next_action` to match the
  resolved stage and keeps both requested values in metadata as
  `model_stage` / `model_next_action`.
- Before each dialogue request, the gateway reads the latest few messages from PostgreSQL
  and forwards them as `metadata.short_term_memory`, excluding the just-accepted current
  user turn so the prompt does not duplicate the same message twice.
- Every third user turn, the gateway asks orchestrator for a compact summary, stores it in
  `sessions.metadata.dialogue_summary`, and records a `dialogue.summary.updated` event so
  exports and reconnects keep one stable summary snapshot.
