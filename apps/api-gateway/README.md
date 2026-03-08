# API Gateway

## Purpose

This gateway currently covers steps 8, 10, 11, 12, 13, 14, 15, 17, and 19:

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
- `POST /api/session/{session_id}/audio/finalize`
- `GET /ws/session/{session_id}` as a WebSocket upgrade endpoint

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`

## Notes

- `POST /api/session/{session_id}/text` now writes both the accepted user message and the
  mock assistant reply into the `messages` table defined in
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
