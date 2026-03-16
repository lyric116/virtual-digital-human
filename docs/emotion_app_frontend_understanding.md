# emotion_app Frontend Understanding

## Purpose

This document records the current factual baseline of `emotion_app/` before migration work begins. It is intended to freeze what the React frontend is today, what is real versus simulated, and what capability gaps still exist relative to `apps/web`.

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

The current React frontend has a small amount of genuine browser functionality:

- language switching is real local UI state
- camera permission request is real
- camera preview is real via `navigator.mediaDevices.getUserMedia`
- camera stream cleanup is real when stopping preview
- text input editing is real local UI state
- modal open/close flows are real local UI state

## What is still simulated or prototype-only

The rest of the frontend is still prototype behavior rather than integrated product behavior:

- microphone recognition is simulated with nested `setTimeout` transitions
- chat bubbles are scripted local copy, not backend replies
- the send button only clears local input and flips a local status index
- emotion summary and timeline are static content, not affect-service data
- auth flow is local-only modal behavior
- avatar scene is decorative and not driven by runtime session state
- there is no real fetch-based API integration in `App.jsx`
- there is no WebSocket integration
- there is no TTS integration
- there is no affect integration
- there is no export/replay integration
- there is no session creation, restore, or persistence logic

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

Compared with `apps/web`, `emotion_app` is currently missing these integrated runtime capabilities:

- runtime config loading compatible with `window.__APP_CONFIG__`
- session creation
- session restore
- local active-session persistence
- realtime WebSocket connection
- realtime envelope parsing and state application
- text submit to the gateway
- audio chunk upload
- audio preview / partial transcript handling
- audio finalize / final transcript handling
- camera frame upload
- affect refresh and rendering from real payloads
- TTS synthesis and playback lifecycle
- avatar runtime state driving
- export retrieval
- local replay from export JSON
- reconnect handling and stale-event protection

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

- `emotion_app` is a visually strong React prototype
- `apps/web` is still the stable frontend reference implementation
- backend/browser contracts should remain unchanged during initial migration
- the first migration priority should be a verified session/realtime/text baseline in `emotion_app`
- old frontend removal is explicitly out of scope for this first migration round
