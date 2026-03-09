# TTS Service

## Purpose

This service now covers implementation plan steps 30 and 31:

- synthesize one assistant reply into one single-voice audio asset
- store the generated audio locally
- return one stable `audio_url` plus playback metadata

## Files

- `main.py`
  - FastAPI app, edge-tts synthesis path, local file storage, and media serving

## Endpoints

- `GET /health`
- `POST /internal/tts/synthesize`
- `GET /media/tts/{filename}`

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/tts-service main:app --host 0.0.0.0 --port 8040`

Required environment variables:

- `TTS_SERVICE_HOST`
- `TTS_SERVICE_PORT`
- `TTS_SERVICE_BASE_URL`
- `TTS_CORS_ORIGINS`
- `TTS_PROVIDER`
- `TTS_VOICE_A`
- `TTS_AUDIO_FORMAT`
- `TTS_STORAGE_ROOT`

## Notes

- Current step-30 baseline uses `edge_tts` with one Chinese voice and writes local `mp3`
  files under `TTS_STORAGE_ROOT`.
- Voice aliases such as `companion_female_01` are mapped to concrete `edge-tts` voice ids
  inside the service.
- `TTS_CORS_ORIGINS` must include the frontend preview origin because step 31 lets the
  browser call `POST /internal/tts/synthesize` directly.
- `TTS_AUDIO_FORMAT` may still be configured as `wav` elsewhere, but the current
  `edge_tts` baseline always returns actual `mp3` output and reports that in the
  response payload.
- `scripts/verify_tts_service.py` runs three fixed Chinese samples and confirms that the
  service returns playable audio URLs with increasing durations for longer text.
- `scripts/verify_web_tts_playback.py` starts the full frontend dialogue chain and checks
  that one synthesized reply reaches frontend playback and subtitle sync.
