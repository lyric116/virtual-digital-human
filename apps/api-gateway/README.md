# API Gateway

## Purpose

This gateway currently covers steps 8, 10, 11, and 12:

- step 8: create a session row in PostgreSQL
- step 10: provide a session-level realtime WebSocket with ready and heartbeat events
- step 11: accept plain text input, write it into PostgreSQL, and emit `message.accepted`
- step 12: call the mock orchestrator, persist the assistant reply, and emit
  `dialogue.reply`

## Files

- `main.py`
  - FastAPI app, request models, orchestrator bridge, and PostgreSQL-backed session repository

## Endpoints

- `GET /health`
- `POST /api/session/create`
- `POST /api/session/{session_id}/text`
- `GET /ws/session/{session_id}` as a WebSocket upgrade endpoint

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`

## Notes

- `POST /api/session/{session_id}/text` now writes both the accepted user message and the
  mock assistant reply into the `messages` table defined in
  `infra/docker/postgres/init/001_base_schema.sql`.
- The gateway calls the orchestrator through `ORCHESTRATOR_BASE_URL`.
- `GATEWAY_CORS_ORIGINS` controls which local frontend preview origins can call the API
  from the browser.
- The realtime endpoint currently emits only `session.connection.ready`,
  `session.heartbeat`, `message.accepted`, `dialogue.reply`, and `session.error`.
