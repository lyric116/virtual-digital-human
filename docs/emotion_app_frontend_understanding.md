# emotion_app Frontend Understanding

## Purpose

This document records the current factual baseline of `emotion_app/` after the first migration round landed. It describes which runtime capabilities are now real, which prototype-only surfaces still remain, and what structural gaps still exist relative to `apps/web`.

## Current project shape

### Build and bootstrap

- `emotion_app/package.json`
  - Create React App project using `react-scripts`
  - available scripts: `start`, `build`, `test`, `eject`
  - minimal runtime dependencies: `react`, `react-dom`, `lucide-react`
- `emotion_app/public/index.html`
  - plain CRA HTML shell with `#root`
  - loads Tailwind through the browser CDN script
  - does not currently inject browser runtime config such as `window.__APP_CONFIG__`
- `emotion_app/src/index.js`
  - renders `<App />` directly with `ReactDOM.createRoot`
  - no router, provider tree, store bootstrap, or runtime config bootstrap layer
- `emotion_app/src/App.jsx`
  - almost all UI and behavior is concentrated in one file
  - contains translations, UI state, camera flow, mic mock flow, auth modal mock, scene layout, and text input area

## App.jsx feature blocks

`emotion_app/src/App.jsx` currently contains these main functional areas:

1. In-file i18n dictionaries for Chinese, English, German, and French
2. Header/navigation area
   - language switch
   - auth entry
   - timeline/profile buttons
3. Peripheral test area
   - camera test card
   - microphone test card
4. Emotion area
   - static emotion summary card
   - static timeline/history card
5. Central scene area
   - two decorative avatar illustrations
   - alternating scripted speech bubbles
6. Bottom interaction area
   - rotating local status text
   - textarea for user input
   - local recording toggle
   - simulated send action
7. Modal layer
   - camera modal
   - microphone modal
   - login/register modal

## What is real today

The current React frontend now has real browser/runtime integration across the main session loop:

- language switching is real local UI state
- runtime config loading is real through `emotion_app/src/index.js`, with `window.__APP_CONFIG__`-compatible inputs for API / WS / TTS / affect base URLs
- session creation, restore, and active-session persistence are real via gateway APIs and local storage
- realtime WebSocket connection, heartbeat, reconnect handling, and event-envelope parsing are real
- text submit is real against `POST /api/session/{session_id}/text`
- microphone permission, recording, chunk upload, preview upload, finalize, and partial/final transcript rendering are real
- camera permission request, preview, stream cleanup, frame upload, and session-aware local-only fallback are real
- affect refresh and websocket `affect.snapshot` rendering are real
- direct TTS synthesis, browser playback, runtime-event logging, avatar runtime state, and replay-safe autoplay suppression are real
- export download, export cache update, and frontend-only replay from exported JSON are real
- modal open/close flows are real local UI state

## What is still simulated or prototype-only

A few visible surfaces are still prototype-oriented even though the main runtime loop is now integrated:

- auth flow is still local-only modal behavior
- some decorative avatar scene elements and marketing-style copy remain presentational rather than fully data-driven
- the implementation is still concentrated in one large `App.jsx` instead of separated state, transport, media, and presentation layers

## UI area to future system responsibility mapping

### Header and navigation

Current role:
- branding and local language/auth/profile/timeline controls

Future responsibility:
- top-level app shell and session-level controls
- language control can remain here
- auth/profile/timeline controls should only survive if connected to real runtime behavior

### Camera and mic cards

Current role:
- hardware test entrypoints
- one real camera preview path and one simulated mic path

Future responsibility:
- real capture controls for session-scoped video/audio flows
- must connect to gateway upload endpoints and session lifecycle

### Emotion card and timeline

Current role:
- static content blocks

Future responsibility:
- affect panel backed by real `affect.snapshot` payloads
- should render text/audio/video/fusion lanes, risk, conflict, and source context
- timeline can evolve into real affect history only if it stays aligned with persisted event semantics

### Central avatar scene

Current role:
- visual prototype scene with decorative dialogue bubbles

Future responsibility:
- assistant/avatar presentation layer
- should eventually reflect `avatar_id`, playback state, stage, and runtime events
- visual style can remain, but behavior must move toward the stable browser contract already used by `apps/web`

### Bottom input and status area

Current role:
- local textarea, local recording toggle, simulated submit, rotating local status labels

Future responsibility:
- real session state indicator
- text submit to `POST /api/session/{session_id}/text`
- real microphone flow and transcript display
- live feedback from session/realtime/audio/TTS state

### Camera and mic modals

Current role:
- camera modal is a real permission/preview helper
- mic modal is a simulated recognition helper

Future responsibility:
- permission, preview, troubleshooting, and capture affordances over real media state
- should become thin UI around real session-scoped media logic rather than standalone local demos

## Stable contract sources to preserve during migration

The current stable browser/backend contract is still defined by these existing files:

- `apps/api-gateway/main.py`
  - real session, media, realtime, export, and runtime-event boundaries
- `docs/shared_contracts.md`
  - canonical payload and event contract
- `apps/web/app.js`
  - current browser-side reference implementation for runtime config, session lifecycle, realtime handling, media upload, affect refresh, TTS, avatar state, export, and replay

The migration target is therefore not a new protocol. It is a React frontend that adopts the existing stable protocol.

## Contract and capability baselines that must remain stable

The migration should preserve these browser/backend semantics:

- `session_id`
- `trace_id`
- `message_id`
- `avatar_id`
- realtime `event_type` envelope semantics
- browser runtime config through `window.__APP_CONFIG__` or an equivalent compatibility layer
- `GET /api/session/{session_id}/state` restore semantics
- `GET /api/session/{session_id}/export` export semantics
- `WS /ws/session/{session_id}` realtime semantics
- current direct-to-service TTS and affect invocation model unless explicitly changed in a later dedicated step

## Capability gap versus apps/web

Compared with `apps/web`, `emotion_app` is no longer missing the primary session/realtime/audio/video/tts/export capabilities. The remaining gap is mostly structural and presentation-oriented:

- runtime concerns are still heavily concentrated inside `emotion_app/src/App.jsx`
- API helpers, realtime reducer logic, media capture flows, affect/TTS/avatar integration, and replay orchestration have not yet been split into clearer modules
- some navigation/auth/profile/timeline affordances are still UI placeholders rather than contract-backed product behavior
- the React shell has reached feature parity for this migration slice, but not maintainability parity

## Migration implication

This is a frontend migration, not a protocol rewrite.

- `apps/web` should stay in place during migration as:
  - the running reference implementation
  - the contract and behavior comparison baseline
  - the rollback path if the new frontend regresses
- `emotion_app` should gradually absorb the established browser responsibilities from `apps/web`
- real runtime state should not continue to accumulate inside one monolithic `App.jsx`
- future work should introduce clearer responsibility boundaries such as:
  - app shell/layout
  - session state layer
  - API client layer
  - realtime/WebSocket layer
  - media capture layer
  - affect/TTS/avatar integration layer
  - export/replay layer

## Baseline conclusion

At this point:

- `emotion_app` has completed the first migration round and now covers session, realtime, audio, video/affect, TTS/avatar, and export/replay flows on the existing browser/backend contract
- `apps/web` is still the stable frontend reference implementation and rollback baseline
- backend/browser contracts should remain unchanged while React-side cleanup continues
- the next frontend priority is not adding another missing protocol path, but splitting the monolithic `App.jsx` into clearer responsibility boundaries
- old frontend removal is explicitly out of scope for this first migration round
