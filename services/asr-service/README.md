# ASR Service

## Purpose

This service implements implementation plan steps 18, 20, and 21: a standalone ASR
service that keeps the existing whole-file final transcription lane while also exposing a
session-aware incremental preview lane for live partial transcript updates. Final
transcripts still apply silence handling, punctuation restoration, and hotword cleanup
before returning the final text.

## Endpoints

- `GET /health`
- `POST /api/asr/transcribe`
- `POST /api/asr/stream/preview`
- `POST /api/asr/stream/release`

## Request Shape

Whole-file final lane:

- send the full audio file as the raw HTTP request body
- pass `filename` as a query parameter, for example `sample.wav`
- optionally pass `record_id` for enterprise validation samples
- preferred input is the already normalized `16kHz mono wav` from manifest
  `audio_path_16k_mono`

Streaming preview lane:

- send only the incremental audio delta since the previous preview as the raw HTTP request body
- pass `session_id`, `recording_id`, `preview_seq`, and `filename` as query parameters
- keep `preview_seq` monotonic within one `session_id + recording_id`
- keep `Content-Type` stable within one recording; the service rejects MIME changes with `409`
- call `POST /api/asr/stream/release` with `session_id` and `recording_id` when finalize completes or the preview stream should be dropped

Example final request:

- `POST /api/asr/transcribe?filename=1.wav&record_id=noxi/...`
- `Content-Type: audio/wav`
- request body: full wav bytes

Example preview request:

- `POST /api/asr/stream/preview?session_id=sess_001&recording_id=rec_001&preview_seq=2&filename=preview.wav`
- `Content-Type: audio/wav`
- request body: delta wav bytes appended to the same preview stream state

## Response Shape

The service returns:

- `transcript_text`
- `duration_ms`
- `confidence_mean`
- `confidence_available`
- `audio.sample_rate_hz`
- `audio.channels`
- `audio.byte_size`

For `qwen3-asr-flash`, the service now uses DashScope's native multimodal generation
endpoint as the primary transport and keeps the older OpenAI-compatible route only as a
fallback. Neither path exposes token-level confidence here, so `confidence_mean` stays
`null` and `confidence_available=false` in this baseline.

The current service-level postprocess pass now splits by lane:

- partial transcript preview: only light normalization plus hotword cleanup so preview stays responsive
- final transcript: silence handling, punctuation restoration, and hotword cleanup before returning authoritative text

Preview state is stored in memory per `session_id + recording_id`, with monotonic
`preview_seq` checks, best-effort release, and idle TTL cleanup to avoid unbounded
retention after interrupted recordings.

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/asr-service main:app --host 0.0.0.0 --port 8020`
- the service reads repo-root `.env.example` and `.env` at startup and fails fast if `ASR_API_KEY` is missing when booting the default remote ASR engine
- required environment variables:
  - `ASR_API_KEY`
  - `ASR_BASE_URL`
  - `ASR_MODEL`
  - `ASR_POSTPROCESS_ENABLED`
  - `ASR_SILENCE_WINDOW_MS`
  - `ASR_SILENCE_MIN_DURATION_MS`
  - `ASR_SILENCE_THRESHOLD_RATIO`
  - `ASR_HOTWORD_MAP_PATH`

## Verification

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_service.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_postprocess.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_draft_batch.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/eval_asr_baseline.py --hypothesis-source draft`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/prepare_magicdata_eval.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_magicdata_asr_eval.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_regression.py`

The live verifier uploads three enterprise validation samples, checks transcript
availability, confirms duration and audio metadata fields, and prints original-vs-derived
audio format differences.

The batch verifier starts the same service locally, writes a small temporary ASR review
batch through `scripts/write_asr_drafts.py transcribe-service`, and confirms the selected
rows move from `pending_asr` to `draft_ready` without altering untouched rows.

The ASR baseline evaluator is read-only: it never writes transcript workflow state and
will only score rows that are already `verified`, `locked_for_eval=true`, and
`text_status=human_verified`.

The MAGICDATA import path is separate from the enterprise transcript workflow:

- `scripts/prepare_magicdata_eval.py` builds a local full reference catalog plus a frozen
  Chinese core subset under `data/derived/transcripts-local/`
- `scripts/verify_magicdata_asr_eval.py` starts the same ASR service locally and evaluates
  that frozen subset through `scripts/eval_asr_baseline.py`
- `scripts/verify_asr_regression.py` is the stable ASR regression gate and enforces
  threshold checks on the MAGICDATA Chinese baseline when the local corpus is present
- both outputs stay local and should not be committed

## Current Chinese ASR Result

The current expanded MAGICDATA Chinese evaluation has been run on a local frozen
`216`-sample subset:

- transcripts: `data/derived/transcripts-local/magicdata_eval_core_expanded216.jsonl`
- details: `data/derived/eval-local/magicdata_asr_baseline_details_expanded216.json`
- report: `data/derived/eval-local/magicdata_asr_baseline_report_expanded216.md`
- eligible records: `216`
- reference tokens: `1380`
- edit distance total: `5`
- WER: `0.003623`
- SER: `0.023148`

This result is strong enough to treat the current Chinese public-eval ASR baseline as
ready for the next planned optimization stage. Keep the default `36`-sample MAGICDATA
run as the stable regression baseline, and use the expanded `216`-sample run for
broader failure analysis and follow-up optimization work.
