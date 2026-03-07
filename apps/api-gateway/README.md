# API Gateway

## Purpose

This is the step-8 gateway baseline. It currently exposes only the minimum session
creation endpoint and writes a session row into PostgreSQL.

## Files

- `main.py`
  - FastAPI app, request models, and PostgreSQL-backed session repository

## Endpoints

- `GET /health`
- `POST /api/session/create`

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`

## Notes

- This step intentionally does not create messages, WebSocket events, or orchestrator calls.
- The endpoint writes only to the `sessions` table defined in
  `infra/docker/postgres/init/001_base_schema.sql`.
- `GATEWAY_CORS_ORIGINS` controls which local frontend preview origins can call the API
  from the browser.
