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
- `POST /internal/tts/synthesize-stream`
- `GET /internal/tts/stream/{tts_id}`
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
- `TTS_EDGE_TIMEOUT_SECONDS`
- `TTS_ENABLE_WAVE_FALLBACK`
- `TTS_STREAM_SAMPLE_RATE_HZ`
- `TTS_STREAM_TIMEOUT_SECONDS`
- `TTS_STREAM_SESSION_TTL_SECONDS`
- `TTS_STORAGE_ROOT`

## Notes

- Current step-30 baseline uses `edge_tts` first and falls back to a locally generated
  `wav` asset when the remote path times out or fails.
- Voice aliases such as `companion_female_01` are mapped to concrete `edge-tts` voice ids
  inside the service.
- `TTS_CORS_ORIGINS` must include the frontend preview origin because step 31 lets the
  browser call `POST /internal/tts/synthesize` directly.
- `/internal/tts/synthesize` now derives `audio_url` from the incoming HTTP request
  base URL, so browser callers receive a host that is reachable from the browser
  instead of an internal Docker-only service hostname.
- `/internal/tts/synthesize-stream` keeps the legacy single-shot route untouched and
  only prepares a browser-consumable stream session when `TTS_BASE_URL`,
  `TTS_API_KEY`, and `TTS_MODEL` are configured.
- `/internal/tts/stream/{tts_id}` proxies DashScope streaming PCM chunks as NDJSON so
  the browser can start playback before the full WAV replay asset finishes writing.
- The response payload is authoritative for playback: successful remote synthesis usually
  returns `mp3`, while the local fallback path returns `wav`.
- `scripts/verify_tts_service.py` runs three fixed Chinese samples and confirms that the
  service returns playable audio URLs with increasing durations for longer text.
- `scripts/verify_web_tts_playback.py` starts the full frontend dialogue chain and checks
  that one synthesized reply reaches frontend playback and subtitle sync.
