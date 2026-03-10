# Knowledge Cards

This directory stores the curated knowledge-card dataset introduced in implementation
plan step 43.

## Files

- `knowledge_cards.jsonl`
  - canonical structured card set for the first RAG baseline

## Required Fields

Each JSONL row must contain:

- `id`
- `title`
- `category`
- `summary`
- `stage`
- `risk_level`
- `emotion`
- `tags`
- `contraindications`
- `recommended_phrases`
- `followup_questions`
- `source`

## Current Coverage

The current baseline intentionally stays small and high-signal. It covers:

- anxiety support
- low-mood support
- sleep support
- breathing intervention
- handoff support

## Validation

Run:

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_knowledge_cards.py`

This verifies field completeness, stage/risk enums, and category coverage before later
steps build retrieval and safety guards on top of these cards.
