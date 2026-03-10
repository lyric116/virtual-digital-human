# virtual-huamn

## Status

Current repository state:

- enterprise validation data has been indexed into `manifest`, transcript workflow, and QC assets
- `16kHz mono` ASR input audio has been generated under `data/derived/audio_16k_mono`
- external ASR draft generation has been verified with `qwen3-asr-flash`
- the monorepo engineering skeleton from `implementation_plan` step 1 is now in place
- `services/dialogue-service` now owns the dialogue schema boundary, and
  `apps/orchestrator` forwards dialogue requests through that validated service
- `services/dialogue-service` now calls a real LLM through standard `LLM_*`
  configuration while keeping the existing dialogue response contract stable
- the text loop now reaches a real structured assistant reply through `apps/orchestrator`
- the gateway now enforces a stage machine so assistant replies cannot skip or jump
  backward across `engage -> assess -> intervene -> reassess -> handoff`
- the gateway now injects short-term dialogue memory from recent message rows so the
  real LLM can recall user facts across multiple turns without adding long-term profiles
- the gateway now persists a staged `dialogue_summary` into `sessions.metadata` every
  three user turns and reuses it on later dialogue requests so long sessions stay bounded
- the gateway now applies a deterministic high-risk text precheck before any dialogue
  service call and short-circuits obvious self-harm or suicide expressions directly to
  `handoff`
- `services/dialogue-service` now returns a safe fallback reply instead of breaking the
  main chain when the upstream LLM path times out or returns invalid output
- the frontend now renders a recoverable chat timeline and restores session history from
  the gateway session state endpoint
- the current text session can now be exported as JSON with messages, stage history, and
  persisted system events
- the text path now has an explicit trace continuity check across database rows, realtime
  envelopes, and export payloads
- the frontend capture panel now supports browser-side microphone permission and local
  recording controls without uploading audio
- recorded browser audio chunks can now be uploaded to the gateway and indexed into
  temporary `media_indexes` records before ASR is connected
- `services/asr-service` now provides an offline whole-file transcription baseline for
  normalized enterprise audio samples
- browser-recorded audio can now be finalized through the gateway, transcribed by
  `services/asr-service`, rendered as the final transcript in the frontend, and pushed
  into the same mock reply loop used by text input
- browser-recorded audio can now also emit partial transcript previews during recording
  through the same ASR service before the final accepted transcript arrives after stop
- `services/asr-service` now applies silence handling, punctuation restoration, and
  hotword cleanup before returning the final transcript text
- `services/tts-service` now synthesizes one assistant reply into one playable Chinese
  single-voice speech asset and returns a local `audio_url`
- the TTS path now uses `edge_tts` first and falls back to a local `wav` asset when the
  remote path times out, so frontend playback should always trust the returned
  `audio_format`
- the frontend now consumes `services/tts-service` directly so one assistant reply can be
  spoken with synced subtitle text and replay controls in the avatar panel
- the avatar stage now has one static 2D baseline character that switches between idle
  and speaking while reply audio is playing
- the static avatar now also drives a coarse mouth open-close sequence during playback
  and closes the mouth after audio ends
- the frontend avatar stage now supports two selectable static roles, and each role maps
  to a distinct TTS voice plus a visibly different stage profile
- the frontend avatar stage now also maps dialogue `stage`, `emotion`, and `risk_level`
  into deterministic expression presets so high-risk replies stay visually restrained
- `services/avatar-driver-service` now reads enterprise `3D_FV_files` offline, checks
  alignment against emotion CSV rows, and emits deterministic sampled driver frames for
  later avatar evaluation
- the frontend capture panel now supports camera permission, local preview, and
  low-frequency `video_frame` uploads to the gateway so the video modality can enter the
  system before affect inference is attached
- standalone ASR batch write-back is now available through
  `scripts/write_asr_drafts.py transcribe-service`, and the transcript workflow contains
  real `draft_ready` records plus generated manual review checklists
- local-only MAGICDATA Chinese ASR import and evaluation tooling is now available under
  `scripts/prepare_magicdata_eval.py` and `scripts/verify_magicdata_asr_eval.py`

## Repository Structure

| Path | Purpose |
| --- | --- |
| `apps/web` | frontend application |
| `apps/api-gateway` | unified API entrypoint and session-facing APIs |
| `apps/orchestrator` | workflow orchestration across ASR, affect, RAG, dialogue, TTS, and avatar |
| `services/asr-service` | speech recognition service and evaluation entrypoint |
| `services/affect-service` | multimodal affect and risk inference |
| `services/rag-service` | knowledge retrieval and grounding |
| `services/dialogue-service` | structured dialogue generation and state machine |
| `services/tts-service` | speech synthesis |
| `services/avatar-driver-service` | avatar playback and behavior driving |
| `libs/shared-schema` | shared contracts, payload schemas, and event definitions |
| `libs/prompt-templates` | prompt assets and intervention templates |
| `libs/eval-tools` | reusable evaluation helpers |
| `data/` | raw enterprise data and derived artifacts |
| `infra/docker` | Dockerfiles |
| `infra/compose` | compose stacks and service wiring |
| `infra/nginx` | gateway and reverse proxy config |
| `docs/` | architecture, implementation plan, and data specs |
| `scripts/` | repeatable local and CI automation |
| `tests/` | automated tests and regression fixtures |

## Python Runtime

Use `uv run` for Python commands. The project already has `pyproject.toml` and `uv.lock`.

- Python version check:
  - `UV_CACHE_DIR=.uv-cache uv run python -V`
- Add a dependency:
  - `uv add <package>`

## Data And ASR Commands

Demo assets for mock flow development live in:

- `data/demo/README.md`

Frontend shell preview:

- `python3 -m http.server 4173 --directory apps/web`
- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`
- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/orchestrator main:app --host 0.0.0.0 --port 8010`
- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/dialogue-service main:app --host 0.0.0.0 --port 8030`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_start.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_realtime_connection.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_text_submit.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_schema_validation.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_llm_samples.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_stage_machine.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_short_term_memory.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_summary_memory.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_high_risk_precheck.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_fallback_reply.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_timeline.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_export.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_trace_lineage.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_recording_controls.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_audio_chunk_upload.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_camera_capture.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_audio_final_transcript.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_audio_partial_transcript.py`
- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/asr-service main:app --host 0.0.0.0 --port 8020`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_service.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_postprocess.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_baseline_eval.py`
- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/tts-service main:app --host 0.0.0.0 --port 8040`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_tts_service.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_tts_playback.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_baseline.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_mouth_drive.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_switch.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_expression_presets.py`
- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/avatar-driver-service main:app --host 0.0.0.0 --port 8050`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_avatar_driver_offline.py`

- Rebuild manifest, transcript workflow, and QC report:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/build_data_artifacts.py`
- Generate `16kHz mono` ASR input audio and backfill manifest/transcripts:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/prepare_asr_audio.py`
- Select an ASR review batch:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/write_asr_drafts.py select-batch --batch-id review_batch_001 --limit 8 --balanced-by-group --per-group 2`
- Batch-write drafts through the standalone ASR service:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/write_asr_drafts.py transcribe-service --batch data/derived/transcripts/batches/review_batch_001.jsonl`
- Verify standalone ASR batch write-back:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_draft_batch.py`
- Export the active transcript review queue:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py queue-report --output data/derived/transcripts/review_tasks/review_queue_active.md`
- Start a manual transcript review item:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py start-review --record-id <record_id> --reviewer <reviewer>`
- Complete a verified transcript review item:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py complete-review --record-id <record_id> --reviewer <reviewer> --decision approved --final-text "..."`
- Verify transcript review state transitions:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_transcript_review_flow.py`
- Generate an ASR baseline report from locked human-reviewed samples:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/eval_asr_baseline.py --hypothesis-source draft`
- Verify the ASR baseline evaluator with deterministic fixtures and current workflow gating:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_baseline_eval.py`
- Import local MAGICDATA `dev+test` and build a frozen Chinese eval core subset:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/prepare_magicdata_eval.py`
- Run a real Chinese ASR baseline on the local MAGICDATA core subset:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_magicdata_asr_eval.py`
- Run the stable ASR regression suite, including MAGICDATA when available:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_regression.py`
- Import external ASR draft results from a JSONL file:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/write_asr_drafts.py import-results --results <results.jsonl>`
- Generate a manual review checklist:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/generate_review_checklist.py --batch data/derived/transcripts/batches/review_batch_001.jsonl --output data/derived/transcripts/review_tasks/review_batch_001_manual_review.md`

## Environment Variables

The canonical environment inventory is:

- `docs/environment.md`
- `.env.example`

The canonical cross-service payload reference is:

- `docs/shared_contracts.md`

The initial PostgreSQL schema reference is:

- `docs/database_schema.md`
- `infra/docker/postgres/init/001_base_schema.sql`

For DashScope ASR with the current service, use:

- `ASR_API_KEY`
- `ASR_BASE_URL=https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
- `ASR_MODEL=qwen3-asr-flash`

`qwen3-asr-flash` now runs against DashScope's native multimodal generation endpoint.
The service keeps the older OpenAI-compatible route only as a fallback path when native
calls fail.

Formal ASR evaluation is gated:

- only `workflow_status=verified`
- only `locked_for_eval=true`
- only `text_status=human_verified`

If those rows do not exist yet, `scripts/eval_asr_baseline.py` will generate a blocked
report instead of fabricating WER/SER from machine drafts.

MAGICDATA integration is intentionally local-only:

- raw archives and extracted audio stay under `data/external/`
- generated transcript catalogs and reports stay under `data/derived/transcripts-local/`
  and `data/derived/eval-local/`
- do not commit those dataset-derived files

The current default MAGICDATA frozen core subset is selected as:

- `12` records from each available `split + speaker_gender` group
- current local dataset result: `36` locked records total

## Docker

Docker is available in the current environment. Containerization work should be added under `infra/docker` and `infra/compose` as the service skeletons are implemented.

Current foundation stack entrypoints:

- `infra/compose/docker-compose.yml`
- `infra/compose/README.md`
- `scripts/verify_infra_stack.py`
