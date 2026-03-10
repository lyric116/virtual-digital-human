# rag-service

## Purpose

`rag-service` now owns the step-44 retrieval baseline on top of the curated knowledge-card
dataset.

## Current Baseline

- canonical card dataset:
  - `data/kb/knowledge_cards.jsonl`
- service entrypoint:
  - `services/rag-service/main.py`
- dataset and schema notes:
  - `data/kb/README.md`
- dataset validation entrypoint:
  - `scripts/verify_knowledge_cards.py`
- retrieval verification entrypoint:
  - `scripts/verify_rag_service.py`

## Endpoints

- `GET /health`
- `POST /internal/rag/retrieve`
- `POST /internal/rag/index/reload`

## Retrieval Scope

The current retrieval baseline is intentionally simple:

- load the curated card set at startup
- build an in-memory sparse vector index
- apply stage and risk metadata filters
- score the remaining cards against the query text
- return `source_id` plus short reusable support content

This step does not add:

- rerank models
- dialogue injection
- high-risk retrieval guardrails beyond the current card metadata

Those stay in later steps.

## Current Coverage

The current card set intentionally stays small and high-signal. It covers:

- anxiety support
- low-mood support
- sleep support
- breathing intervention
- handoff support

Each returned card includes:

- applicable `stage`
- allowed `risk_level` and `emotion`
- `source_id`
- `recommended_phrases`
- `followup_questions`
- `contraindications`

## Run

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/rag-service main:app --host 0.0.0.0 --port 8070`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_knowledge_cards.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_rag_service.py`
