# Dialogue Service

## Purpose

This service now covers implementation plan steps 23, 24, 27, 29, 42, and 45:

- own the dialogue reply schema
- validate all dialogue payloads against that schema
- call the configured real LLM while preserving the same response contract
- generate compact staged dialogue summaries for longer sessions
- return a safe fallback dialogue reply when the upstream LLM path fails
- short-circuit multimodal conflict turns into clarification-first replies
- ground normal replies with retrieved knowledge cards when orchestrator provides them

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
- `DIALOGUE_FORCE_FAILURE_MODE` (optional, verifier only)

## Notes

- `POST /internal/dialogue/respond` now calls the configured LLM and converts its JSON
  output into the shared `DialogueReplyResponse` contract.
- If orchestrator provides `metadata.knowledge_cards`, the prompt now includes those
  cards explicitly and the service constrains `knowledge_refs` to the provided
  `source_id` set.
- When the model omits or invents `knowledge_refs`, the service now injects the top
  retrieved `source_id` and appends one matching suggestion or follow-up so the reply is
  actually grounded in the retrieved card.
- `metadata.short_term_memory` is now part of the prompt contract so the service can
  answer simple factual recall questions over the last few turns.
- `POST /internal/dialogue/summarize` uses the same LLM boundary to compress recent turns
  plus any prior summary into one short Chinese summary string.
- If the upstream LLM times out, returns empty content, or produces invalid JSON/fields,
  the `respond` route now returns a safe fallback `DialogueReplyResponse` instead of
  failing the main dialogue chain.
- If `metadata.affect_snapshot.fusion_result.conflict=true`, the `respond` route now
  short-circuits before the LLM call and returns a clarification-first reply with
  `next_action=ask_followup` plus `affect_conflict_clarification` in `safety_flags`.
- `POST /internal/dialogue/validate` is the strict schema gate used to reject malformed
  response payloads before they can leak into orchestrator or gateway code.
- Obvious self-harm or suicide expressions are now intercepted earlier by the gateway
  rule layer in step 28, so not every final `handoff` reply necessarily originates from
  this service.
- `scripts/verify_dialogue_llm_samples.py` runs five fixed text samples against the real
  provider and reports latency statistics plus high-risk routing behavior.
- `scripts/verify_dialogue_fallback_reply.py` forces a timeout failure mode and proves the
  frontend still receives a persisted fallback assistant reply.
- `scripts/verify_dialogue_conflict_clarification.py` proves a real gateway turn with
  multimodal conflict evidence now persists `affect.snapshot` and produces a clarification reply.
- `scripts/verify_dialogue_rag_grounding.py` proves the same user query can produce
  different `knowledge_refs` and different grounded reply text when the risk hint
  changes from `low` to `medium`.
