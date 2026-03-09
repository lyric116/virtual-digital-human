# Orchestrator

## Purpose

This service now covers implementation plan steps 12, 23, 24, and 27:

- receive a text turn from the gateway
- forward the request to `services/dialogue-service`
- return only dialogue payloads that satisfy the shared schema
- proxy staged dialogue summary generation without moving LLM logic into the gateway

## Files

- `main.py`
  - FastAPI app and dialogue-service proxy routing

## Endpoints

- `GET /health`
- `POST /internal/dialogue/respond`
- `POST /internal/dialogue/summarize`

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/orchestrator main:app --host 0.0.0.0 --port 8010`

Required environment variable:

- `DIALOGUE_SERVICE_BASE_URL`

## Notes

- Real dialogue output is generated inside `services/dialogue-service`, not in orchestrator.
- Dialogue summaries are also generated inside `services/dialogue-service`; orchestrator
  only proxies the request and preserves the summary contract.
- Stage, risk level, and next action remain validated after the real LLM call so the
  gateway only receives contract-safe payloads.
- The gateway remains responsible for persisting assistant messages and forwarding
  `dialogue.reply` to the frontend session channel.
