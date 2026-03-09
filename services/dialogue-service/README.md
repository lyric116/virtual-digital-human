# Dialogue Service

## Purpose

This service now covers implementation plan steps 23 and 24:

- own the dialogue reply schema
- validate all dialogue payloads against that schema
- call the configured real LLM while preserving the same response contract

## Files

- `main.py`
  - FastAPI app, real LLM dialogue generation, JSON extraction, and strict response validation

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
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `LLM_TIMEOUT_SECONDS`

## Notes

- `POST /internal/dialogue/respond` now calls the configured LLM and converts its JSON
  output into the shared `DialogueReplyResponse` contract.
- `POST /internal/dialogue/validate` is the strict schema gate used to reject malformed
  response payloads before they can leak into orchestrator or gateway code.
- `scripts/verify_dialogue_llm_samples.py` runs five fixed text samples against the real
  provider and reports latency statistics plus high-risk routing behavior.
