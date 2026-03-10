# affect-service

## Purpose

`affect-service` is the first stable multimodal affect boundary for steps 37-41.
Step 37 established the fixed response contract. Step 38 upgrades only the text lane
so the frontend can already render coarse text affect categories before audio/video
and true fusion logic are replaced in later steps.

## Endpoints

- `GET /health`
- `POST /internal/affect/analyze`

## Current Behavior

- text lane: deterministic coarse labels `distressed`, `anxious`, `low_mood`,
  `guarded`, and `neutral`
- audio lane: capture-state proxy labels such as `speech_observed` or `low_energy_proxy`
- video lane: camera-state proxy labels such as `face_present_proxy` or `camera_offline`
- fusion lane: deterministic `emotion_state`, `risk_level`, `confidence`, and `conflict`
- source context: always returns `origin`, `dataset`, `record_id`, and `note` so the UI
  can already reserve fields for enterprise validation sample binding

## Step-38 Text Rules

- `distressed`
  - direct high-risk expressions such as self-harm or suicide intent
- `anxious`
  - sleep problems, stress, tension, or similar activation cues
- `low_mood`
  - low-energy, meaninglessness, sadness, or exhaustion cues
- `guarded`
  - masking language such as `我没事` or very short acknowledgement-only replies
- `neutral`
  - informative or ordinary statements without strong affect cues

Enterprise transcript verification for step 38 uses:

- one longer NoXI transcript that should remain `neutral`
- one short NoXI acknowledgement transcript that should be classified as `guarded`

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/affect-service main:app --host 0.0.0.0 --port 8060`

## Runtime Notes

- Browser preview calls this service directly.
- Configure the browser-facing base URL through `window.__APP_CONFIG__.affectBaseUrl`.
- Default local browser preview origin is controlled by `AFFECT_CORS_ORIGINS`.
- This step intentionally keeps real multimodal inference out of the main path. Steps 39-41
  will replace the audio/video/fusion internals while keeping the same response shape.

## Verification

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_affect_service.py`
