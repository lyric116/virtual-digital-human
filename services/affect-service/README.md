# affect-service

## Purpose

`affect-service` is the first stable multimodal affect boundary for steps 37-41.
In step 37 it does not run a real model yet. It returns deterministic placeholder
results for text, audio, video, and fusion so the frontend emotion panel and later
fusion logic have one fixed contract to target.

## Endpoints

- `GET /health`
- `POST /internal/affect/analyze`

## Current Behavior

- text lane: keyword-based placeholder labels such as `anxious`, `neutral`, `distressed`
- audio lane: capture-state proxy labels such as `speech_observed` or `low_energy_proxy`
- video lane: camera-state proxy labels such as `face_present_proxy` or `camera_offline`
- fusion lane: deterministic `emotion_state`, `risk_level`, `confidence`, and `conflict`
- source context: always returns `origin`, `dataset`, `record_id`, and `note` so the UI
  can already reserve fields for enterprise validation sample binding

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/affect-service main:app --host 0.0.0.0 --port 8060`

## Runtime Notes

- Browser preview calls this service directly.
- Configure the browser-facing base URL through `window.__APP_CONFIG__.affectBaseUrl`.
- Default local browser preview origin is controlled by `AFFECT_CORS_ORIGINS`.
- This step intentionally keeps real multimodal inference out of the main path. Steps 38-41
  will replace the lane internals while keeping the same response shape.

## Verification

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_affect_service.py`
