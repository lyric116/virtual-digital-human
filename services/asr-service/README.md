# ASR Service

## Purpose

This service implements implementation plan step 18: a standalone offline ASR baseline
that accepts one complete audio file, returns one final transcript result, and does not
emit partial transcript events yet.

## Endpoints

- `GET /health`
- `POST /api/asr/transcribe`

## Request Shape

- send the full audio file as the raw HTTP request body
- pass `filename` as a query parameter, for example `sample.wav`
- optionally pass `record_id` for enterprise validation samples
- preferred input is the already normalized `16kHz mono wav` from manifest
  `audio_path_16k_mono`

Example:

- `POST /api/asr/transcribe?filename=1.wav&record_id=noxi/...`
- `Content-Type: audio/wav`
- request body: full wav bytes

## Response Shape

The service returns:

- `transcript_text`
- `duration_ms`
- `confidence_mean`
- `confidence_available`
- `audio.sample_rate_hz`
- `audio.channels`
- `audio.byte_size`

For `qwen3-asr-flash`, the current compatible response path does not expose token-level
confidence, so `confidence_mean` stays `null` and `confidence_available=false` in this
baseline.

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/asr-service main:app --host 0.0.0.0 --port 8020`
- required environment variables:
  - `ASR_API_KEY`
  - `ASR_BASE_URL`
  - `ASR_MODEL`

## Verification

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_service.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_draft_batch.py`

The live verifier uploads three enterprise validation samples, checks transcript
availability, confirms duration and audio metadata fields, and prints original-vs-derived
audio format differences.

The batch verifier starts the same service locally, writes a small temporary ASR review
batch through `scripts/write_asr_drafts.py transcribe-service`, and confirms the selected
rows move from `pending_asr` to `draft_ready` without altering untouched rows.
