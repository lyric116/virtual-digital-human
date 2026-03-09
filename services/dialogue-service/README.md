# Dialogue Service

## Purpose

This service now covers implementation plan steps 23, 24, and 27:

- own the dialogue reply schema
- validate all dialogue payloads against that schema
- call the configured real LLM while preserving the same response contract
- generate compact staged dialogue summaries for longer sessions

## Files

- `main.py`
  - FastAPI app, real LLM dialogue generation, JSON extraction, and strict response validation

## Endpoints

- `GET /health`
- `POST /internal/dialogue/respond`
- `POST /internal/dialogue/validate`
- `POST /internal/dialogue/summarize`

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
- `metadata.short_term_memory` is now part of the prompt contract so the service can
  answer simple factual recall questions over the last few turns.
- `POST /internal/dialogue/summarize` uses the same LLM boundary to compress recent turns
  plus any prior summary into one short Chinese summary string.
- `POST /internal/dialogue/validate` is the strict schema gate used to reject malformed
  response payloads before they can leak into orchestrator or gateway code.
- Obvious self-harm or suicide expressions are now intercepted earlier by the gateway
  rule layer in step 28, so not every final `handoff` reply necessarily originates from
  this service.
- `scripts/verify_dialogue_llm_samples.py` runs five fixed text samples against the real
  provider and reports latency statistics plus high-risk routing behavior.
