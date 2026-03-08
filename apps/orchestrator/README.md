# Orchestrator

## Purpose

This service now covers implementation plan step 12:

- receive a text turn from the gateway
- produce a mock structured dialogue reply
- keep the reply shape aligned with `docs/shared_contracts.md`

## Files

- `main.py`
  - FastAPI app, mock reply routing, and dialogue contract validation

## Endpoints

- `GET /health`
- `POST /internal/dialogue/respond`

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/orchestrator main:app --host 0.0.0.0 --port 8010`

## Notes

- This step intentionally returns mock dialogue output only.
- Stage, risk level, and next action are still validated even though no real LLM is used yet.
- The gateway remains responsible for persisting assistant messages and forwarding
  `dialogue.reply` to the frontend session channel.
