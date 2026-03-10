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
- audio lane: when a real audio file path is bound, deterministic feature labels such as
  `fast_high_energy_proxy`, `steady_high_energy_proxy`, `slow_low_energy_proxy`, or
  `steady_speech_proxy`; otherwise it falls back to live capture placeholders
- video lane: when a synthetic or offline-bound frame path exists, deterministic visual
  labels such as `stable_gaze_proxy` or `face_not_detected_proxy`; otherwise it falls
  back to camera-state proxy labels such as `face_present_proxy` or `camera_offline`
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

## Step-39 Audio Rules

- real audio analysis only runs when `metadata.audio_path_16k_mono` or `metadata.audio_path`
  points to an existing local file
- extracted baseline features:
  - `mean_rms`
  - `pause_ratio`
  - `segment_rate`
  - derived `energy_band`
  - derived `tempo_band`
- current deterministic audio labels:
  - `fast_high_energy_proxy`
  - `steady_high_energy_proxy`
  - `slow_low_energy_proxy`
  - `steady_speech_proxy`
- when the browser only reports live capture state without a bound file path, the service
  intentionally stays in `live_capture_proxy` or `awaiting_audio_features`

Enterprise audio verification for step 39 uses:

- `recola/group-2/speaker_a/1` as a stronger speech-energy sample
- `noxi/001_2016-03-17_Paris/speaker_b/2` as a weak, pause-heavy sample

## Step-40 Video Rules

- real frame analysis only runs when `metadata.video_frame_path` points to a local
  `.npy` frame array used by offline regression fixtures
- enterprise offline validation can also bind `metadata.face3d_path`; this does not make
  the online browser path depend on enterprise video files
- current deterministic visual labels:
  - `stable_gaze_proxy`
  - `gaze_away_proxy`
  - `face_not_detected_proxy`
  - fallback `face_present_proxy`, `camera_live`, `camera_offline`

Step-40 verification uses:

- one synthetic face-like frame -> `stable_gaze_proxy`
- one blank frame -> `face_not_detected_proxy`
- one enterprise `face3d_path` sample -> valid face-present or stable-gaze proxy

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
