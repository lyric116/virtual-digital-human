# Active Transcript Review Queue

## Scope

- Transcript source: `data/derived/transcripts/val_transcripts_template.jsonl`
- Generated at: `2026-03-08T10:42:01.559198+00:00`
- Active records: `12`

## Status Summary

| Workflow status | Count |
| --- | ---: |
| draft_ready | 12 |

## Active Records

| Record ID | Dataset | Role | Workflow | Review | Reviewer | Flags |
| --- | --- | --- | --- | --- | --- | --- |
| noxi/001_2016-03-17_Paris/speaker_a/1 | noxi | speaker_a | draft_ready | not_started | - | - |
| noxi/001_2016-03-17_Paris/speaker_a/2 | noxi | speaker_a | draft_ready | not_started | - | - |
| noxi/001_2016-03-17_Paris/speaker_a/3 | noxi | speaker_a | draft_ready | not_started | - | - |
| noxi/001_2016-03-17_Paris/speaker_b/1 | noxi | speaker_b | draft_ready | not_started | - | - |
| noxi/001_2016-03-17_Paris/speaker_b/2 | noxi | speaker_b | draft_ready | not_started | - | - |
| noxi/001_2016-03-17_Paris/speaker_b/3 | noxi | speaker_b | draft_ready | not_started | - | - |
| recola/group-2/speaker_a/1 | recola | speaker_a | draft_ready | not_started | - | - |
| recola/group-2/speaker_a/2 | recola | speaker_a | draft_ready | not_started | - | - |
| recola/group-2/speaker_a/3 | recola | speaker_a | draft_ready | not_started | - | - |
| recola/group-2/speaker_b/1 | recola | speaker_b | draft_ready | not_started | - | - |
| recola/group-2/speaker_b/2 | recola | speaker_b | draft_ready | not_started | - | - |
| recola/group-2/speaker_b/3 | recola | speaker_b | draft_ready | not_started | - | - |

## CLI

Start a review item:

```bash
UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py start-review --record-id <record_id> --reviewer <reviewer>
```

Complete a verified review item:

```bash
UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py complete-review --record-id <record_id> --reviewer <reviewer> --decision approved --final-text "..."
```
