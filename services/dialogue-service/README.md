# Dialogue Service

## Purpose

This service covers implementation plan step 23:

- own the dialogue reply schema
- validate all mock dialogue payloads against that schema
- provide the stable service boundary that later real LLM generation will replace

## Files

- `main.py`
  - FastAPI app, mock dialogue generation, and strict response validation

## Endpoints

- `GET /health`
- `POST /internal/dialogue/respond`
- `POST /internal/dialogue/validate`

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/dialogue-service main:app --host 0.0.0.0 --port 8030`

Required environment variables:

- `DIALOGUE_SERVICE_HOST`
- `DIALOGUE_SERVICE_PORT`
- `DIALOGUE_SERVICE_BASE_URL`

## Notes

- `POST /internal/dialogue/respond` currently returns mock structured dialogue output.
- `POST /internal/dialogue/validate` is the strict schema gate used to reject malformed
  response payloads before they can leak into orchestrator or gateway code.
- The next implementation-plan step can swap mock generation for real LLM generation
  without changing the response contract.
