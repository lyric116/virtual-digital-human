# API Gateway

## Purpose

This gateway currently covers steps 8, 10, 11, 12, 13, 14, 15, 17, 19, 20, 25, 26, 27, 28, 36, 42, and 47:

- step 8: create a session row in PostgreSQL
- step 10: provide a session-level realtime WebSocket with ready and heartbeat events
- step 11: accept plain text input, write it into PostgreSQL, and emit `message.accepted`
- step 12: call the mock orchestrator, persist the assistant reply, and emit
  `dialogue.reply`
- step 13: expose session state and ordered message history so the frontend can
  restore the chat timeline after refresh
- step 14: export session metadata, message history, stage history, and persisted
  system events as a single JSON response
- step 15: keep one stable `trace_id` across session rows, message rows, realtime
  envelopes, system events, and exported session artifacts
- step 17: accept fixed-window audio chunk uploads, store the binary locally, and
  persist temporary `audio_chunk` rows in `media_indexes`
- step 19: accept one finalized recording, call the standalone ASR service, persist an
  `audio_final` asset plus an `audio` user message, and reuse the existing realtime
  `message.accepted -> dialogue.reply` pipeline
- step 20: accept preview snapshots of the in-progress recording, call the standalone ASR
  service for a best-effort partial transcript, and emit `transcript.partial` immediately
  over the session realtime channel without persisting a new message row
- step 25: enforce the dialogue stage machine at persistence time so assistant replies
  can only move through `engage -> assess -> intervene -> reassess -> handoff` without
  invalid jumps
- step 26: package the recent dialogue turns as short-term memory and forward them to
  the dialogue service without adding any long-term profile layer
- step 27: generate and persist a compact dialogue summary every three user turns so
  longer sessions stop relying only on raw recent turns
- step 28: run a deterministic high-risk rule precheck before calling orchestrator so
  obvious self-harm or suicide expressions short-circuit directly to `handoff`
- step 36: accept low-frequency browser video frames, persist them as `video_frame`
  media rows, and keep the video path isolated from dialogue and affect inference
- step 42: request affect snapshots for normal dialogue turns, persist `affect.snapshot`
  evidence, and forward conflict signals so dialogue can prioritize clarification
- step 47: persist transcript, retrieval, dialogue, TTS, and avatar runtime events into
  one exportable `system_events` stream

## Files

- `main.py`
  - FastAPI app, request models, orchestrator bridge, and PostgreSQL-backed session repository

## Endpoints

- `GET /health`
- `GET /api/runtime/config`
- `POST /api/session/create`
- `GET /api/session/{session_id}/state`
- `GET /api/session/{session_id}/export`
- `POST /api/session/{session_id}/text`
- `POST /api/session/{session_id}/audio/chunk`
- `POST /api/session/{session_id}/video/frame`
- `POST /api/session/{session_id}/audio/preview`
- `POST /api/session/{session_id}/audio/finalize`
- `POST /api/session/{session_id}/runtime-event`
- `GET /ws/session/{session_id}` as a WebSocket upgrade endpoint

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000`

## Notes

- `GET /api/runtime/config` returns the current browser-facing API/WS URLs plus the
  direct affect/TTS service URLs derived from gateway settings, so containerized or
  templated web shells can resolve runtime endpoints from one place.
- `POST /api/session/{session_id}/text` now writes both the accepted user message and the
  assistant reply into the `messages` table defined in
  `infra/docker/postgres/init/001_base_schema.sql`.
- `GET /api/session/{session_id}/state` returns the current session metadata and the
  ordered message list used by the frontend to rebuild chat history.
- `GET /api/session/{session_id}/export` reads the current session, ordered messages,
  derived stage history, and persisted `system_events` rows to build the downloadable
  export payload used by the web shell.
- `GET /api/session/{session_id}/export` now also writes one best-effort JSON snapshot
  under `SESSION_EXPORT_DIR` so deployments can keep a local export artifact without an
  extra wrapper job.
- The gateway calls the orchestrator through `ORCHESTRATOR_BASE_URL`.
- `GATEWAY_CORS_ORIGINS` controls which local frontend preview origins can call the API
  from the browser.
- The realtime endpoint currently emits `session.connection.ready`, `session.heartbeat`,
  `message.accepted`, `transcript.partial`, `transcript.final`, `dialogue.reply`, and
  `session.error`.
- Background dialogue pipeline work is now tracked in `app.state.background_tasks` and
  cancelled on shutdown instead of being left as anonymous fire-and-forget tasks.
- `system_events` now carries the end-to-end trace baseline: `session.created`,
  `message.accepted`, `transcript.partial`, `transcript.final`, `affect.snapshot`,
  `knowledge.retrieved`, `dialogue.reply`, `dialogue.summary.updated`, plus
  `tts.*` / `avatar.command` runtime events posted back from the frontend.
- The text-first trace contract is now explicit: the session row, every message row,
  every persisted business event, the websocket envelopes, and the export payload all
  carry the same session `trace_id`.
- `POST /api/session/{session_id}/audio/chunk` does not invoke ASR yet; it only stores
  the raw chunk under `MEDIA_STORAGE_ROOT` and records an `audio_chunk` index row.
- `POST /api/session/{session_id}/video/frame` stores one low-frequency browser
  snapshot under `MEDIA_STORAGE_ROOT` and records a `video_frame` row in
  `media_indexes`. It does not trigger vision inference or dialogue updates yet.
- `POST /api/session/{session_id}/audio/finalize` stores one complete recording under
  `MEDIA_STORAGE_ROOT`, sends the binary to `services/asr-service`, writes the final
  transcript as a user message with `source_kind='audio'`, and then triggers the same
  mock dialogue flow used by the text path.
- `POST /api/session/{session_id}/audio/preview` accepts a current recording snapshot,
  sends it to `services/asr-service`, emits `transcript.partial`, and persists the same
  event into `system_events`.
- `POST /api/session/{session_id}/audio/finalize` now also persists one
  `transcript.final` event before the accepted transcript message continues into the
  dialogue pipeline.
- `POST /api/session/{session_id}/runtime-event` is a guarded browser callback used by
  the web shell to write `tts.synthesized`, `tts.playback.started`,
  `tts.playback.ended`, and `avatar.command` into `system_events` without letting client
  failures break the main reply path.
- The gateway treats the LLM stage as a proposal, not ground truth. It records
  `stage_before`, `model_stage`, and `stage_machine_reason` in assistant message metadata,
  then emits the resolved stage in `dialogue.reply`.
- When the gateway rewrites a proposed stage, it also rewrites `next_action` to match the
  resolved stage and keeps both requested values in metadata as
  `model_stage` / `model_next_action`.
- Before each dialogue request, the gateway reads the latest few messages from PostgreSQL
  and forwards them as `metadata.short_term_memory`, excluding the just-accepted current
  user turn so the prompt does not duplicate the same message twice.
- Every third user turn, the gateway asks orchestrator for a compact summary, stores it in
  `sessions.metadata.dialogue_summary`, and records a `dialogue.summary.updated` event so
  exports and reconnects keep one stable summary snapshot.
- Before any orchestrator call, the gateway now applies a deterministic high-risk text
  rule layer. If an obvious self-harm or suicide expression is detected, the gateway
  generates a fixed safety reply locally, forces `risk_level=high` and `stage=handoff`,
  and marks the assistant message with `high_risk_rule_precheck`.
- For normal turns, the gateway now also requests one affect snapshot before dialogue.
  If fusion marks the sample as conflict, the gateway persists `affect.snapshot` into
  `system_events`, forwards the snapshot inside `metadata.affect_snapshot`, and exposes
  `affect_conflict*` fields on the resulting `dialogue.reply` event payload.
- When dialogue requests carry retrieval context back from orchestrator/dialogue-service,
  the gateway persists one `knowledge.retrieved` event before `dialogue.reply`, keeping
  retrieved `source_ids`, applied filters, and grounded refs separately auditable.
