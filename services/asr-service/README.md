# ASR Service

## Purpose

This service implements implementation plan steps 18 and 21: a standalone offline ASR
baseline that accepts one complete audio file, returns one final transcript result, and
now applies silence handling, punctuation restoration, and hotword cleanup inside the
service before returning the final text.

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

For `qwen3-asr-flash`, the service now uses DashScope's native multimodal generation
endpoint as the primary transport and keeps the older OpenAI-compatible route only as a
fallback. Neither path exposes token-level confidence here, so `confidence_mean` stays
`null` and `confidence_available=false` in this baseline.

The current service-level postprocess pass does three deterministic things without
changing the HTTP contract:

- silence handling: detect long silent spans in wav input and use them as clause breaks
- punctuation restoration: add commas or sentence endings when the provider returns plain
  text without punctuation
- hotword cleanup: normalize configured domain phrases from
  `services/asr-service/hotwords.json`

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/asr-service main:app --host 0.0.0.0 --port 8020`
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

The live verifier uploads three enterprise validation samples, checks transcript
availability, confirms duration and audio metadata fields, and prints original-vs-derived
audio format differences.

The batch verifier starts the same service locally, writes a small temporary ASR review
batch through `scripts/write_asr_drafts.py transcribe-service`, and confirms the selected
rows move from `pending_asr` to `draft_ready` without altering untouched rows.

The ASR baseline evaluator is read-only: it never writes transcript workflow state and
will only score rows that are already `verified`, `locked_for_eval=true`, and
`text_status=human_verified`.
