# emotion_app

## Purpose

`emotion_app` is the active React frontend in this repository. It targets the same local
backend stack as the static shell, but gives you a live-reload developer workflow on port
`3000`.

## Supported local workflows

### Default backend startup

From the repository root, start the compose-backed backend first:

- text, TTS, and affect flows: `make start-core`
- ASR, audio finalize, or full voice/avatar chain: `make start-full`

Useful companion commands:

- `make status-core`
- `make logs-core`
- `make stop-core`
- `make status-full`
- `make logs-full`
- `make stop-full`

Do not run raw `uvicorn` services while the compose stack is already using the same ports.
If you hit `address already in use`, stop the active stack with `make stop-core` or
`make stop-full` before switching workflows.

### React dev server

From `emotion_app/`:

- `npm install`
- `npm start`

Then open:

- `http://localhost:3000`

The backend services continue to run through Docker Compose while the React dev server
handles frontend hot reload.

### Production-style local preview

From `emotion_app/`:

- `npm run build`
- `python3 -m http.server 3000 --directory build`

Then open:

- `http://localhost:3000`

## Runtime configuration

- the app reads `window.__APP_CONFIG__` when present and otherwise falls back to built-in
  local defaults in `emotion_app/src/appHelpers.js`
- built-in defaults point at:
  - `http://127.0.0.1:8000`
  - `ws://127.0.0.1:8000/ws`
  - `http://127.0.0.1:8040`
  - `http://127.0.0.1:8060`
- local backend CORS defaults now allow both the compose-served shell on `4173` and the
  React dev server on `3000`

## Verification

Recommended checks for the React developer flow:

1. `make start-core`
2. `cd emotion_app && npm start`
3. open `http://localhost:3000`
4. verify session create, text submit, TTS playback, and affect fetch
5. `make stop-core`

When voice or ASR paths are needed:

1. `make start-full`
2. `cd emotion_app && npm start`
3. verify audio recording and finalize flows
4. `make stop-full`
