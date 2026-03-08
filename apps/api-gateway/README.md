# API Gateway

## Purpose

This gateway currently covers steps 8 and 10:

- step 8: create a session row in PostgreSQL
- step 10: provide a session-level realtime WebSocket with ready and heartbeat events

## Files

- `main.py`
  - FastAPI app, request models, and PostgreSQL-backed session repository

## Endpoints

- `GET /health`
- `POST /api/session/create`
- `GET /ws/session/{session_id}` as a WebSocket upgrade endpoint

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`

## Notes

- This step intentionally does not create messages or orchestrator calls.
- The endpoint writes only to the `sessions` table defined in
  `infra/docker/postgres/init/001_base_schema.sql`.
- `GATEWAY_CORS_ORIGINS` controls which local frontend preview origins can call the API
  from the browser.
- The realtime endpoint currently emits only `session.connection.ready`,
  `session.heartbeat`, and `session.error`.
