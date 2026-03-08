# Web App Skeleton

## Purpose

This frontend shell now covers steps 7, 9, 10, 11, 12, 13, 14, 15, and 16:

- step 7: six-panel single-page layout
- step 9: `Start Session` calls the gateway session bootstrap API and renders the
  returned session id, status, stage, and trace id
- step 10: after session bootstrap, the page opens a session-level WebSocket,
  sends heartbeat pings, and auto-reconnects after an unexpected close
- step 11: text input posts to the gateway, waits for `message.accepted`, and shows
  send success without introducing assistant replies yet
- step 12: after text submission, the page consumes `dialogue.reply`, updates the
  latest reply placeholders, and rejects invalid reply payloads
- step 13: the page renders a recoverable chat timeline, appends user and assistant
  turns in order, records stage transitions, and restores history after refresh from
  the gateway state endpoint
- step 14: the Export control fetches the current session JSON, caches the payload for
  test inspection, and downloads it in browser runtimes that support Blob URLs
- step 15: the page now surfaces the active session trace plus the latest user and reply
  trace values so one text turn can be correlated with realtime events and exported data
- step 16: the capture panel now requests microphone permission, starts and stops local
  recording, and shows browser-side recording status without uploading audio

## Files

- `index.html`
  - single-page console layout
- `styles.css`
  - responsive panel styling
- `app.js`
  - panel readiness check, session bootstrap flow, realtime connection, text submit
    ack handling, mock dialogue reply handling, chat timeline rendering, and session
    history restore plus session export
- `favicon.svg`
  - local icon to avoid asset 404 noise during preview

## Local Preview

From repository root:

- start the gateway:
  - `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`
- start the orchestrator:
  - `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/orchestrator main:app --host 0.0.0.0 --port 8010`
- `python3 -m http.server 4173 --directory apps/web`

Then open:

- `http://127.0.0.1:4173`

## Runtime Notes

- `window.__APP_CONFIG__.apiBaseUrl` defaults to `http://127.0.0.1:8000`
- `window.__APP_CONFIG__.wsUrl` defaults to `ws://127.0.0.1:8000/ws`
- `.env.example` exposes `WEB_PUBLIC_API_BASE_URL`, `WEB_PUBLIC_WS_URL`, and `GATEWAY_CORS_ORIGINS` for local browser preview
- only `Start Session` and `Export` are live in this step; pause and reset remain disabled
- `Send Text` is live only after session bootstrap and a connected realtime channel
- microphone controls stay local to the browser in this step and do not upload media
- the latest assistant reply shown in transcript, avatar, and fusion cards is derived
  from the same live events that feed the timeline
- the current active `sessionId` is stored in browser storage and used to restore
  history through `GET /api/session/{session_id}/state`
- `Export` calls `GET /api/session/{session_id}/export` and downloads the returned JSON
  when browser download APIs are available
- the control panel also shows the latest user and assistant `trace_id` values observed
  from realtime events

## Verification

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_start.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_realtime_connection.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_text_submit.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_timeline.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_export.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_trace_lineage.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_recording_controls.py`
