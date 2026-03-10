# Conversation Handoff Summary

## Purpose

This file is the fastest way to resume work in a new chat. Read this before touching
code, then read `memory-bank/progress.md` and `memory-bank/architecture.md` for the
full execution trail.

## Snapshot

- Date: 2026-03-09
- Stable commit: `f810599`
- Stable commit title: `fix: harden gateway async pipeline and live verifiers`
- Current plan status: implementation plan completed through step `27`
- Next planned step: implementation plan step `28` (`high-risk rule precheck`)

## Project Goal

Build a multimodal emotional-support digital human system with this closed loop:

1. text / voice / camera input
2. ASR and multimodal state understanding
3. LLM response with stage control and knowledge support
4. avatar expression / speech output
5. evaluation and replay

Current repository work is still focused on the base chain: session -> input ->
transcript -> dialogue -> realtime UI -> persistence -> export -> evaluation.

## Key Decisions

- Repository shape is a monorepo with `apps/`, `services/`, `libs/`, `infra/`,
  `data/`, `docs/`, and `memory-bank/`.
- Python execution should use `uv run`; avoid global Python pollution.
- Docker Desktop is available and is the expected local infra path.
- Every tested code change must be committed and pushed after validation.
- Do not use `rm` for rollback; use git rollback to a known-good commit.
- `qwen3-asr-flash` is allowed only for ASR.
- Dialogue and summary generation must use `LLM_*` config and currently target
  `gpt-5.2`.
- ASR config must use only `ASR_API_KEY`, `ASR_BASE_URL`, and `ASR_MODEL`.
- Public Chinese ASR evaluation uses MAGICDATA and must stay separate from the
  enterprise transcript workflow.

## What Was Discussed And Built

### 1. Documentation-first planning

- Created the initial repository guideline file.
- Produced ten design documents under `docs/`.
- Expanded those into `docs/implementation_plan.md`.
- Added `docs/data_spec.md`, label mapping, role mapping, manifest templates, and
  QC reporting for enterprise data.

### 2. Enterprise data preparation

- Parsed the enterprise validation corpus under `data/`.
- Built `val_manifest.jsonl`, transcript workflow JSONL, review queues, and QC
  reports.
- Normalized enterprise audio to `16kHz mono`.
- Confirmed the currently sampled enterprise review data is mainly French, not
  Chinese, so it is not suitable for user-side Chinese gold labeling.

### 3. ASR path

- External ASR provider was chosen instead of local ASR training.
- `qwen3-asr-flash` on DashScope is the working ASR provider.
- Added standalone `services/asr-service`.
- Added ASR postprocess for silence segmentation, punctuation, and hotword
  normalization.
- Added transcript draft write-back, manual review workflow, and ASR evaluation
  gating.

### 4. Chinese public ASR evaluation

- Because the enterprise review subset is not Chinese, a public Chinese eval lane
  was added with MAGICDATA.
- MAGICDATA `dev + test` is imported into `data/derived/transcripts-local/`.
- The frozen evaluation subset is separate from enterprise transcripts.
- A real Chinese baseline report now exists under `data/derived/eval-local/`.

### 5. Core application path implemented so far

- Step 1-6: repo skeleton, env inventory, shared contracts, Docker foundation
  stack, DB schema, demo data.
- Step 7-15: frontend shell, session creation, realtime session transport, text
  submission, mock reply, recoverable timeline, export, trace continuity.
- Step 16-22A: recording controls, chunk upload, ASR service, preview/final
  transcript path, ASR postprocess, ASR baseline gating.
- Step 23-27: dialogue-service schema gate, real LLM reply path, gateway stage
  machine, short-term memory, dialogue summary layer.
- Step 28-35: high-risk precheck, dialogue fallback reply, TTS playback, static
  avatar baseline, mouth drive, dual avatar switch, and stage-driven expression presets.
- Step 35A: offline avatar-driver validation against enterprise `3D_FV_files`.

### 6. Recent fixes

- Removed `qwen-plus` as dialogue baseline and switched dialogue to `gpt-5.2`.
- Fixed gateway async blocking and moved blocking work off the event loop.
- Fixed websocket event duplicate/loss edge cases.
- Fixed MIME normalization for real browser audio types like
  `audio/webm;codecs=opus`.
- Fixed orphan final-audio cleanup on ASR failure.
- Unified `.env` parsing across gateway, orchestrator, dialogue-service, and
  asr-service.
- Updated live verifier scripts so they launch `dialogue-service` when required.

## Current Stable Runtime

- Infra: PostgreSQL + Redis + MinIO via `infra/compose/docker-compose.yml`
- Frontend: static web shell in `apps/web/`
- Gateway: `apps/api-gateway/main.py`
- Orchestrator: `apps/orchestrator/main.py`
- Dialogue: `services/dialogue-service/main.py`
- ASR: `services/asr-service/main.py`
- Tests: `145 passed` on the last full run

## Current Model / Provider Policy

- ASR:
  - provider path: DashScope
  - model: `qwen3-asr-flash`
  - env: `ASR_API_KEY`, `ASR_BASE_URL`, `ASR_MODEL`
- Dialogue and summary:
  - provider path: OpenAI-compatible
  - model: `gpt-5.2`
  - env: `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`
- TTS:
  - provider path: `edge_tts`
  - fallback path: local generated `wav`
  - env: `TTS_PROVIDER`, `TTS_EDGE_TIMEOUT_SECONDS`, `TTS_ENABLE_WAVE_FALLBACK`

## Important Files To Read First

- `docs/implementation_plan.md`
- `memory-bank/progress.md`
- `memory-bank/architecture.md`
- `docs/environment.md`
- `docs/shared_contracts.md`
- `docs/03-asr.md`
- `docs/05-dialogue-state-llm.md`
- `docs/08-data-ops-eval.md`

## Important Data Paths

- Enterprise manifest: `data/manifests/val_manifest.jsonl`
- Enterprise transcript workflow: `data/derived/transcripts/val_transcripts_template.jsonl`
- Active review queue: `data/derived/transcripts/review_tasks/review_queue_active.md`
- Enterprise QC report: `data/derived/qc_report.md`
- MAGICDATA eval catalog: `data/derived/transcripts-local/magicdata_eval_all.jsonl`
- MAGICDATA frozen subset: `data/derived/transcripts-local/magicdata_eval_core.jsonl`
- MAGICDATA eval report: `data/derived/eval-local/magicdata_asr_baseline_report.md`

## Resume Rules For A New Chat

1. Read this file.
2. Read `memory-bank/progress.md` from newest to older entries as needed.
3. Read `memory-bank/architecture.md` for stable constraints.
4. Continue from implementation plan step `36` unless the user redirects.
5. Keep `qwen3-asr-flash` limited to ASR and `gpt-5.2` limited to dialogue.
6. Use `uv run` for Python commands.
7. Run tests before commit.
8. Commit and push only after passing checks.

## Suggested First Commands After Resume

```bash
docker compose -f infra/compose/docker-compose.yml up -d
UV_CACHE_DIR=.uv-cache uv run pytest
UV_CACHE_DIR=.uv-cache uv run python scripts/verify_infra_stack.py --compose-file infra/compose/docker-compose.yml
```
