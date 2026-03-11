# Web App Skeleton

## Purpose

This frontend shell now covers steps 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 31, 32, 33, 34, 35, 36, 37, and 48:

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
- step 17: each recorded browser audio chunk is now uploaded to the gateway when a
  session exists, and the UI shows 音频分片 upload progress plus the latest stored chunk id
- step 19: after recording stops, the page now submits one finalized audio blob, waits
  for the 最终转写 result, shows the transcript in the chat flow, and consumes the same
  mock assistant reply path used by text input
- step 20: while recording is still running, the page now sends periodic preview blobs,
  waits for `transcript.partial`, and shows partial transcript text before the final
  accepted transcript arrives after stop
- step 31: after `dialogue.reply`, the page now calls `services/tts-service`, updates
  avatar subtitle text, auto-plays the generated audio when possible, and exposes a
  replay button plus playback state labels
- step 32: the avatar panel now shows one static 2D character baseline and switches
  between `idle` and `speaking` based on the current TTS playback state
- step 33: the avatar mouth now follows a deterministic coarse cue sequence during
  playback and returns to `closed` after audio ends
- step 34: the avatar panel now exposes two selectable roles and routes the chosen
  role into both new session bootstrap requests and the TTS voice used for that role
- step 35: the avatar stage now maps dialogue `stage`, `emotion`, and `risk_level`
  into deterministic expression presets so the same role no longer looks identical in
  `assess`, `intervene`, `reassess`, and `handoff`
- step 36: the capture panel now requests camera permission, starts and stops local
  preview, and uploads low-frequency `video_frame` snapshots to the gateway without
  attaching any visual inference yet
- step 37: the emotion panel now requests one placeholder snapshot from
  `services/affect-service` and renders text/audio/video/fusion cards plus sample source
  metadata without blocking the main dialogue chain
- step 38: the emotion panel keeps the same contract but the text lane can now render
  coarse labels such as `anxious`, `low_mood`, `guarded`, and `neutral`
- step 39: the same panel can now also render baseline audio labels such as
  `fast_high_energy_proxy`, `steady_high_energy_proxy`, and `slow_low_energy_proxy`
- step 40: the emotion panel can now also render baseline video labels such as
  `stable_gaze_proxy` and `face_not_detected_proxy` while the live browser path still
  falls back to camera-state placeholders
- step 41: the emotion panel can now render first-pass fused states such as
  `needs_clarification` and `multimodal_consistent_low_risk`, including an explicit
  conflict reason when text/audio/video disagree
- step 48: the control panel now exposes `Replay Export`, which replays one saved
  export JSON locally and reconstructs transcript, chat timeline, affect snapshot, TTS
  state, and avatar state without calling live services

## Files

- `index.html`
  - single-page console layout
- `styles.css`
  - responsive panel styling
- `app.js`
  - panel readiness check, session bootstrap flow, realtime connection, text submit
    ack handling, mock dialogue reply handling, chat timeline rendering, and session
    history restore plus session export, microphone recording, audio chunk upload, and
    finalized audio submission plus partial transcript preview back into the text dialogue loop,
    followed by frontend TTS synthesis, avatar audio playback, subtitle sync, static
    avatar state switching, basic mouth cue playback, dual-avatar selection, and
    stage-driven expression preset mapping, plus camera preview and low-frequency video
    frame upload, followed by affect panel snapshot fetch and rendering, plus export-log
    replay mode driven by cached session JSON
- `favicon.svg`
  - local icon to avoid asset 404 noise during preview

## Local Preview

From repository root:

- start the gateway:
  - `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`
- start the orchestrator:
  - `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/orchestrator main:app --host 0.0.0.0 --port 8010`
- start the dialogue service:
  - `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/dialogue-service main:app --host 0.0.0.0 --port 8030`
- start the TTS service:
  - `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/tts-service main:app --host 0.0.0.0 --port 8040`
- start the affect service:
  - `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/affect-service main:app --host 0.0.0.0 --port 8060`
- `python3 -m http.server 4173 --directory apps/web`

Then open:

- `http://127.0.0.1:4173`

## Runtime Notes

- `apps/web/config.js` is the deployment injection hook; hosted previews should
  overwrite it instead of trying to make the browser read `.env` directly
- `window.__APP_CONFIG__.apiBaseUrl` defaults to `http://127.0.0.1:8000`
- `window.__APP_CONFIG__.wsUrl` defaults to `ws://127.0.0.1:8000/ws`
- `window.__APP_CONFIG__.ttsBaseUrl` defaults to `http://127.0.0.1:8040`
- `window.__APP_CONFIG__.affectBaseUrl` defaults to `http://127.0.0.1:8060`
- `.env.example` exposes `WEB_PUBLIC_API_BASE_URL`, `WEB_PUBLIC_WS_URL`,
  `WEB_PUBLIC_TTS_BASE_URL`, and `WEB_PUBLIC_AFFECT_BASE_URL` as the canonical values
  that should be injected into `config.js` or `window.__APP_CONFIG__` during deployment
- `Replay Export` uses the latest cached export JSON and rebuilds one session locally
  without calling gateway, orchestrator, dialogue, affect, or TTS services
- pause and reset remain disabled
- `Send Text` is live only after session bootstrap and a connected realtime channel
- microphone controls can now upload temporary audio chunks to the gateway after a
  session exists; without a session they stay in local-only mode
- camera controls can now request video permission, keep a local preview alive, and
  upload low-frequency `video_frame` snapshots to `/api/session/{session_id}/video/frame`
  when a session exists
- 摄像头授权被拒绝时，页面会保持稳定，只更新本地权限和预览状态，不影响文本和音频主链路
- when `window.__APP_CONFIG__.enableAudioFinalize !== false`, stopping a recording also
  submits one complete audio blob to `/api/session/{session_id}/audio/finalize` and
  waits for the final transcript realtime acknowledgement
- when `window.__APP_CONFIG__.enableAudioPreview !== false`, recording also submits
  growing preview snapshots to `/api/session/{session_id}/audio/preview` so the page can
  display partial transcript text before stop
- the latest assistant reply shown in transcript, avatar, and fusion cards is derived
  from the same live events that feed the timeline
- after one valid assistant reply, the frontend requests one TTS asset, attempts
  autoplay, and still keeps subtitle text visible even if TTS synthesis or playback fails
- the frontend now rewrites Docker-internal TTS media URLs such as `http://tts-service:8040/...`
  back to `window.__APP_CONFIG__.ttsBaseUrl` before playback, so the browser does not try
  to fetch audio from an internal-only hostname
- autoplay is expected to be on for the Docker web container baseline; the web entrypoint
  now defaults `WEB_AUTOPLAY_ASSISTANT_AUDIO=true`
- `Replay Voice` reuses the latest successful `audio_url` without re-running dialogue generation
- transient autoplay/load failures now leave the speech state in `ready` with a retry
  message instead of surfacing the raw browser media error as a terminal state
- both avatars are intentionally static; only preset-driven facial/posture states plus
  coarse mouth motion are implemented, without continuous expressions or body gestures yet
- avatar switching updates the selected role immediately, and a new session binds the
  chosen `avatar_id` into the gateway session bootstrap request
- expression presets are deterministic frontend mappings:
  - `assess -> focused_assess`
  - `intervene -> steady_support`
  - `reassess -> calm_checkin`
  - `handoff` or `risk_level=high -> guarded_handoff`
- the mouth layer now uses a deterministic coarse cue sequence derived from reply text and
  TTS duration so playback visibly opens and closes even before a dedicated viseme model exists
- the current active `sessionId` is stored in browser storage and used to restore
  history through `GET /api/session/{session_id}/state`
- `Export` calls `GET /api/session/{session_id}/export` and downloads the returned JSON
  when browser download APIs are available
- `Replay Export` prefers the latest cached export payload; if a full `events` list is
  present it replays that sequence, otherwise it synthesizes a minimal replay from
  exported `messages`
- the control panel also shows the latest user and assistant `trace_id` values observed
  from realtime events
- the emotion panel now renders a deterministic placeholder snapshot from
  `POST /internal/affect/analyze`, including sample source fields reserved for later
  enterprise replay binding
- the same panel now also surfaces `fusion_result.conflict` and `fusion_result.conflict_reason`
  so later dialogue steps can consume multimodal disagreement without redesigning the UI

## Verification

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_start.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_realtime_connection.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_text_submit.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_timeline.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_export.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_trace_lineage.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_recording_controls.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_audio_chunk_upload.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_camera_capture.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_audio_final_transcript.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_audio_partial_transcript.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_tts_playback.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_baseline.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_mouth_drive.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_switch.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_expression_presets.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_emotion_panel.py`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_replay.py`
