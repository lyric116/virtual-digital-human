# Web App Skeleton

## Purpose

This frontend shell now covers steps 7 and 9:

- step 7: six-panel single-page layout
- step 9: `Start Session` calls the gateway session bootstrap API and renders the
  returned session id, status, stage, and trace id

## Files

- `index.html`
  - single-page console layout
- `styles.css`
  - responsive panel styling
- `app.js`
  - panel readiness check and `Start Session` bootstrap flow
- `favicon.svg`
  - local icon to avoid asset 404 noise during preview

## Local Preview

From repository root:

- start the gateway:
  - `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`
- `python3 -m http.server 4173 --directory apps/web`

Then open:

- `http://127.0.0.1:4173`

## Runtime Notes

- `window.__APP_CONFIG__.apiBaseUrl` defaults to `http://127.0.0.1:8000`
- `.env.example` exposes `WEB_PUBLIC_API_BASE_URL` and `GATEWAY_CORS_ORIGINS` for local browser preview
- only `Start Session` is live in this step; pause, reset, and export remain disabled

## Verification

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_start.py`
