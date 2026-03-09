# Orchestrator

## Purpose

This service now covers implementation plan steps 12 and 23:

- receive a text turn from the gateway
- forward the request to `services/dialogue-service`
- return only dialogue payloads that satisfy the shared schema

## Files

- `main.py`
  - FastAPI app and dialogue-service proxy routing

## Endpoints

- `GET /health`
- `POST /internal/dialogue/respond`

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/orchestrator main:app --host 0.0.0.0 --port 8010`

Required environment variable:

- `DIALOGUE_SERVICE_BASE_URL`

## Notes

- Mock dialogue output is now generated inside `services/dialogue-service`, not in orchestrator.
- Stage, risk level, and next action are still validated even though no real LLM is used yet.
- The gateway remains responsible for persisting assistant messages and forwarding
  `dialogue.reply` to the frontend session channel.
