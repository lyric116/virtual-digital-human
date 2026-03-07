# Progress

## Purpose

This file is an append-only execution log for repository changes that have already been
implemented and validated. Each entry should capture scope, outputs, self-check results,
and the next safe handoff point for the next developer.

## Entry Format

Each appended entry must contain:

- `Date`
- `Title`
- `Scope`
- `Outputs`
- `Checks`
- `Next`

Automation appends new entries under the marker block below.

<!-- progress:entries:start -->

## 2026-03-07 - Reusable Demo Assets

### Scope

Completed implementation plan step 6 by adding a lightweight demo asset directory for text-first session replay, audio metadata mocks, video-frame mock payloads, and sample session export output.

### Outputs

- data/demo/README.md
- data/demo/text_session_script.json
- data/demo/audio_sample.md
- data/demo/video_frame_sample.md
- data/demo/session_export_sample.json
- tests/test_demo_assets.py

### Checks

- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py tests/test_shared_contracts.py tests/test_infra_compose.py tests/test_db_schema_assets.py tests/test_demo_assets.py and confirmed 15 tests passed.
- Verified demo JSON assets are parseable and README points to the demo asset directory.
- Confirmed the demo directory now covers text script, audio description, video-frame description, and export sample.

### Next

- Implementation plan step 7: build the frontend single-page layout with six static panels.
- Keep mock flows anchored to data/demo assets instead of ad hoc inline fixtures.

## 2026-03-07 - Baseline PostgreSQL Schema

### Scope

Completed implementation plan step 5 by defining the initial PostgreSQL schema for sessions, messages, system events, evaluation records, and media indexes, wiring the SQL init file into the compose stack, and verifying inserts plus foreign-key linkage against the running database.

### Outputs

- infra/docker/postgres/init/001_base_schema.sql
- docs/database_schema.md
- scripts/verify_db_schema.py
- tests/test_db_schema_assets.py
- infra/compose/docker-compose.yml

### Checks

- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py tests/test_shared_contracts.py tests/test_infra_compose.py tests/test_db_schema_assets.py and confirmed 12 tests passed.
- Ran uv run python scripts/verify_infra_stack.py --compose-file infra/compose/docker-compose.yml and verified health=healthy, persistence=verified.
- Ran uv run python scripts/verify_db_schema.py --compose-file infra/compose/docker-compose.yml and verified inserts across sessions, messages, system_events, evaluation_records, and media_indexes.

### Next

- Implementation plan step 6: prepare reusable demo data assets for text, audio, video-frame, and export flows.
- Keep later gateway and orchestrator code aligned with the verified table names and shared contract identifiers.

## 2026-03-07 - Foundation Compose Stack And Infra Verifier

### Scope

Completed implementation plan step 4 by adding the baseline Docker Compose stack for PostgreSQL, Redis, and MinIO, documenting how to run it, and verifying health plus persistence through an automated checker.

### Outputs

- infra/compose/docker-compose.yml
- infra/compose/README.md
- scripts/verify_infra_stack.py
- tests/test_infra_compose.py
- docs/environment.md
- .env.example

### Checks

- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py tests/test_shared_contracts.py tests/test_infra_compose.py and confirmed 10 tests passed.
- Ran uv run python scripts/verify_infra_stack.py --compose-file infra/compose/docker-compose.yml and verified health=healthy, persistence=verified.
- Confirmed the stack uses named volumes and health checks for PostgreSQL, Redis, and MinIO.

### Next

- Implementation plan step 5: define the initial PostgreSQL schema for sessions, messages, system events, eval records, and media indexes.
- Keep service runtime code aligned with the foundation compose stack and the documented environment inventory.

## 2026-03-07 - Shared Contracts And Schema Index

### Scope

Completed implementation plan step 3 by defining the cross-service contract catalog for sessions, realtime events, text input, transcripts, dialogue output, avatar commands, and error responses, and by adding tests to prevent field-name drift.

### Outputs

- docs/shared_contracts.md
- libs/shared-schema/README.md
- tests/test_shared_contracts.py
- README.md
- libs/README.md

### Checks

- Verified the contract document covers session, event envelope, transcript, dialogue, avatar, and error payloads.
- Verified snake_case naming and rejected camelCase aliases in automated tests.
- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py tests/test_shared_contracts.py and confirmed 8 tests passed.

### Next

- Implementation plan step 4: start PostgreSQL, Redis, and MinIO with health checks and persistent volumes.
- Keep future service code aligned with docs/shared_contracts.md before generating machine-readable schemas.

## 2026-03-07 - Environment Inventory And Config Sample

### Scope

Completed implementation plan step 2 by defining the canonical runtime configuration inventory, adding a sample env file, and enforcing consistency with automated tests.

### Outputs

- docs/environment.md
- .env.example
- tests/test_environment_inventory.py
- README.md
- memory-bank/README.md

### Checks

- Verified required variables for gateway, orchestrator, PostgreSQL, Redis, MinIO, LLM, ASR, TTS, and avatar driver are present in both docs and .env.example.
- Ran uv run python -m py_compile for repository scripts.
- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py and confirmed 5 tests passed.

### Next

- Implementation plan step 3: define shared contracts and schema skeletons.
- Keep using scripts/update_memory_bank.py before each tested commit.

## 2026-03-07 - ASR Batch, Review Tasks, And Repo Skeleton

### Scope

- Completed enterprise validation data preparation and transcript workflow baseline.
- Implemented implementation plan `18A` and `18B` supporting scripts.
- Verified DashScope `qwen3-asr-flash` on real samples.
- Generated first manual review task list.
- Completed implementation plan step `1` by creating the monorepo directory skeleton.

### Outputs

- `scripts/build_data_artifacts.py`
- `scripts/prepare_asr_audio.py`
- `scripts/write_asr_drafts.py`
- `scripts/generate_review_checklist.py`
- `data/manifests/val_manifest.jsonl`
- `data/derived/audio_16k_mono/`
- `data/derived/transcripts/val_transcripts_template.jsonl`
- `data/derived/transcripts/batches/review_batch_001.jsonl`
- `data/derived/transcripts/batches/review_batch_001_qwen3-asr-flash_results.jsonl`
- `data/derived/transcripts/review_tasks/review_batch_001_manual_review.md`
- `data/derived/qc_report.md`
- `README.md`
- `apps/`
- `services/`
- `libs/`
- `infra/`
- `tests/`

### Checks

- Generated `16kHz mono` audio for all `1126` manifest records.
- Confirmed `audio_path_16k_mono` is populated in manifest and transcript workflow.
- Wrote `8` real ASR drafts with `qwen3-asr-flash`.
- Confirmed transcript workflow status moved to:
  - `draft_ready = 8`
  - `pending_asr = 1118`
- Regenerated `qc_report.md` after draft write-back.
- Verified Python scripts with `uv run python -m py_compile`.

### Next

- Run manual review for `review_batch_001`.
- Execute implementation plan step `2`: environment variable inventory and `.env.example`.
- Execute implementation plan step `3`: shared contracts and schema definitions.
<!-- progress:entries:end -->
