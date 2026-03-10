# rag-service

## Purpose

`rag-service` has not started retrieval implementation yet. Step 43 only establishes the
curated knowledge-card dataset that later retrieval and safety guards will consume.

## Current Baseline

- canonical card dataset:
  - `data/kb/knowledge_cards.jsonl`
- schema and dataset notes:
  - `data/kb/README.md`
- current validation entrypoint:
  - `scripts/verify_knowledge_cards.py`

## Step-43 Scope

The current card set intentionally stays small and high-signal. It covers:

- anxiety support
- low-mood support
- sleep support
- breathing intervention
- handoff support

Each card already includes:

- applicable `stage`
- allowed `risk_level`
- relevant `emotion`
- `contraindications`
- `recommended_phrases`
- `followup_questions`

This keeps step 44 focused on indexing and retrieval only, instead of still cleaning raw
knowledge content.
