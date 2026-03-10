# Orchestrator

## Purpose

This service now covers implementation plan steps 12, 23, 24, 27, and 45:

- receive a text turn from the gateway
- retrieve matching knowledge cards from `services/rag-service`
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

- `RAG_SERVICE_BASE_URL`
- `DIALOGUE_SERVICE_BASE_URL`

## Notes

- Real dialogue output is generated inside `services/dialogue-service`, not in orchestrator.
- Before forwarding one dialogue turn, orchestrator now calls `services/rag-service` and
  injects the returned `knowledge_cards` into `metadata`, so dialogue-service never
  reads the raw knowledge JSONL file directly.
- Dialogue summaries are also generated inside `services/dialogue-service`; orchestrator
  only proxies the request and preserves the summary contract.
- Stage, risk level, and next action remain validated after the real LLM call so the
  gateway only receives contract-safe payloads.
- The gateway remains responsible for persisting assistant messages and forwarding
  `dialogue.reply` to the frontend session channel.
- `scripts/verify_dialogue_rag_grounding.py` verifies the same user query can yield
  different grounded `knowledge_refs` and reply content when the risk hint changes.
