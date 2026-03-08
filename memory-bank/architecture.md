# Architecture

## Purpose

This file records stable architectural understanding that future developers need in order
to keep implementation decisions consistent. It should explain current repository structure,
key file roles, module responsibilities, and new architecture insights discovered during
implementation.

## Repository Map

### `apps/`

- `apps/web`: frontend application shell
- `apps/api-gateway`: external API entrypoint and session-facing APIs
- `apps/orchestrator`: workflow orchestration across model and media services

### `services/`

- `services/asr-service`: speech recognition and offline evaluation service
- `services/affect-service`: multimodal affect and risk inference
- `services/rag-service`: knowledge retrieval
- `services/dialogue-service`: dialogue state machine and structured LLM output
- `services/tts-service`: speech synthesis
- `services/avatar-driver-service`: avatar playback and behavior driving

### `libs/`

- `libs/shared-schema`: shared JSON/event contracts
- `libs/prompt-templates`: reusable prompt and intervention templates
- `libs/eval-tools`: evaluation helpers

### `infra/`

- `infra/docker`: Dockerfiles
- `infra/compose`: compose definitions
- `infra/nginx`: reverse proxy and gateway config

### `data/`

- `data/val`: raw enterprise validation data, read-only
- `data/manifests`: sample index and mapping files
- `data/derived`: all generated assets including audio, transcripts, review tasks, and QC reports

### `scripts/`

- `build_data_artifacts.py`: rebuild manifest, transcript workflow, and QC report
- `prepare_asr_audio.py`: generate standardized `16kHz mono` ASR inputs
- `write_asr_drafts.py`: select ASR batches, import results, call external ASR
- `generate_review_checklist.py`: turn ASR draft batches into human review tasks

## Module Responsibilities

- The current stable core is the data workflow, not the product runtime.
- `val_manifest.jsonl` is the primary sample index for all offline data consumption.
- `val_transcripts_template.jsonl` is the central transcript workflow state machine.
- `qc_report.md` is the operational truth source for sample coverage and workflow status.
- `audio_16k_mono/` is the only approved offline ASR input source.

## Architecture Insights

Automation appends new insights under the marker block below.

<!-- architecture:insights:start -->

## 2026-03-08 - standalone asr baseline now sits before transcript workflow backfill

- services/asr-service is now a true leaf service: it accepts one whole audio file, computes input audio metadata locally, calls the configured external ASR provider, and returns a stable offline transcript contract without any dependency on the gateway or orchestrator.
- The live gate for step 18 is scripts/verify_asr_service.py, which proves two things together: the service can transcribe normalized enterprise audio, and the preprocessed 16kHz mono assets preserve duration while changing sample rate and channel count from the original 44.1kHz stereo source.
- qwen3-asr-flash currently provides text but not provider confidence in the compatible route used here, so the service contract now distinguishes between confidence_mean and confidence_available instead of fabricating a score.

## 2026-03-08 - audio upload is now a separate boundary before ASR

- Step 17 introduces a clean media ingestion boundary: the browser emits fixed-window audio chunks, the gateway stores raw bytes plus media_indexes metadata, and ASR still remains completely out of band.
- MEDIA_STORAGE_ROOT is now the canonical local landing zone for uploaded runtime media, and verify_audio_chunk_upload.py is the live gate that proves file creation plus chunk metadata persistence without depending on later transcript logic.
- The live verifier set no longer assumes fixed localhost ports for the earliest gateway checks, which removes false negatives caused by preoccupied developer ports and keeps end-to-end verification reproducible.

## 2026-03-08 - local recording stays browser-only in step 16

- Step 16 intentionally keeps captured audio inside the browser: permission, recording state, duration, and chunk counters are proven before any upload contract is introduced, which isolates browser capture failures from backend media ingestion work.
- scripts/verify_web_recording_controls.py is now the runtime gate for microphone safety because it proves allow and deny behavior without depending on host microphone hardware or a real browser automation stack.

## 2026-03-08 - trace continuity is now an explicit runtime contract

- The text path no longer treats trace_id as an implicit session field only: the active session, latest user turn, latest assistant turn, persisted business events, and exported stage history all surface the same trace so one interaction can be correlated without reconstructing context from timestamps alone.
- verify_trace_lineage.py is now the runtime gate for trace safety; if a future change alters websocket flushing, export shaping, or database writes, this script should fail before the branch is considered stable.

## 2026-03-08 - session export depends on persisted business events

- system_events is now part of the live text path, not just a future schema placeholder: the gateway persists session.created, message.accepted, dialogue.reply, and session.error so export can replay a session without scraping websocket logs.
- The frontend export action is intentionally request-response, not realtime: app.js fetches GET /api/session/{session_id}/export, caches the payload for tests, and only uses browser download APIs as a delivery layer on top of the same JSON contract.

## 2026-03-08 - timeline restore uses persisted message timestamps

- The gateway realtime dialogue.reply event must carry the assistant message submitted_at from PostgreSQL, and the frontend must prefer that value over envelope emitted_at; otherwise refresh rebuilds a different timeline than the live view.
- The frontend restore path depends on one stable session-state contract: browser storage keeps the active session id, GET /api/session/{session_id}/state returns ordered messages, and app.js reconstructs stage transition entries locally from assistant metadata.

## 2026-03-08 - Mock Dialogue Reply Now Sits Between Text Accept And UI Rendering

- apps/orchestrator/main.py is now the stable mock business-logic boundary for early dialogue work: it owns the structured dialogue reply contract, while the gateway remains responsible for persistence and websocket fan-out.
- The frontend no longer treats text submission as the end of a turn; a turn is now only complete after a valid dialogue.reply passes client-side contract checks and updates the current stage plus latest reply placeholders.
- ORCHESTRATOR_BASE_URL is now a required internal runtime variable because the gateway must call the orchestrator as a client and cannot safely derive a usable client address from the orchestrator bind host alone.

## 2026-03-08 - Text Submit Ack Is A Realtime Contract Boundary

- apps/api-gateway/main.py now treats message.accepted as a queued session event, not just an HTTP response; the browser send flow is only complete after the websocket acknowledgement is received.
- Queued realtime envelopes must be JSON-serializable before websocket send_json is called; accepted message payloads include submitted_at timestamps, so jsonable_encoder is now part of the stable gateway boundary for business events.
- scripts/verify_web_text_submit.py now reserves a temporary localhost port instead of assuming a fixed port, which prevents false failures when prior verification runs or local tools leave a port occupied.

## 2026-03-08 - Session Realtime Transport Baseline

- apps/api-gateway/main.py now owns the minimal realtime transport contract for the project: it validates session existence, upgrades the session websocket, and emits only ready, heartbeat, and error envelopes in v1alpha1 shape.
- apps/web/app.js now has a narrow client-side transport state machine separate from dialogue state: idle, connecting, connected, reconnecting, unsupported, and closed. This keeps step 10 focused on transport reliability rather than business logic.
- scripts/web_realtime_harness.js provides a package-free Node harness for transport tests, while scripts/verify_web_realtime_connection.py is the live runtime gate that proves heartbeat and reconnect work against the actual gateway implementation.
- The websockets package is now a required runtime dependency because uvicorn without it downgraded websocket upgrades to plain HTTP and caused false-negative transport failures.

## 2026-03-07 - Web Session Bootstrap Flow

- apps/web/app.js now owns a narrow browser state machine for session bootstrap only: idle, loading, ready, and error; it does not yet manage messages, transcript buffers, or audio capture.
- scripts/web_session_start_harness.js provides a package-free Node-based DOM harness so frontend behavior can be regression-tested without adding a browser automation stack or npm dependencies.
- scripts/verify_web_session_start.py is the runtime gate for step 9; it starts the gateway, runs the frontend harness in live mode, simulates a browser refresh by creating a fresh document, and verifies that both created sessions are persisted in PostgreSQL.
- GATEWAY_CORS_ORIGINS is now required for practical local browser preview because apps/web is served from a different origin than the gateway during early development.

## 2026-03-07 - Gateway Session Creation Baseline

- apps/api-gateway/main.py is now the first runnable backend service and owns session bootstrap responsibilities only: health check, input validation, session_id generation, trace_id generation, and database persistence.
- The gateway uses PostgreSQL directly at this stage to keep the first backend slice narrow and testable before introducing the orchestrator or message pipelines.
- scripts/verify_gateway_session_create.py performs real end-to-end verification by starting uvicorn locally, posting to /api/session/create, and then checking the persisted row in PostgreSQL; this is the runtime gate for step 8.
- tests/test_api_gateway_session_create.py avoids FastAPI TestClient in this environment and instead validates the contract through direct function calls and route inspection, which keeps CI stable while runtime verification covers the live HTTP path.

## 2026-03-07 - Frontend Shell Is Now A Stable Mount Point

- apps/web is now a standalone static shell with six named panels that match the implementation plan, so later frontend features should extend these mount points instead of redesigning the page structure again.
- The shell intentionally avoids framework and API coupling at this stage, which keeps step-8 session wiring narrow: only the control panel and session display need to move first.

## 2026-03-07 - Demo Mode Now Has A Stable Asset Root

- data/demo is now the canonical location for lightweight mock and replay assets, and later frontend or orchestrator mock flows should consume these files instead of embedding one-off fixtures in code.
- Early export behavior should target the shape in data/demo/session_export_sample.json so session export remains predictable before live APIs are implemented.

## 2026-03-07 - Verified Table Names And Keys Are Now Stable

- The baseline PostgreSQL surface is now fixed to sessions, messages, system_events, evaluation_records, and media_indexes, and later service code should reuse these names instead of inventing parallel tables for the same concerns.
- Replay lineage fields record_id, dataset, canonical_role, and segment_id now exist directly in the session and evaluation storage model so enterprise data replay can share the same tracing model as live sessions.

## 2026-03-07 - Foundation Infra Is Now A Verified Baseline

- infra/compose/docker-compose.yml is now the canonical foundation stack for local development and must remain limited to PostgreSQL, Redis, and MinIO until application services are added step by step.
- Foundation verification now depends on named volumes plus explicit marker checks after restart, so future infra changes must preserve persistence semantics instead of only checking container liveness.

## 2026-03-07 - Event Envelope And Replay Identifiers Are Now Locked

- All cross-service realtime traffic now centers on a shared event envelope with event_id, event_type, schema_version, source_service, session_id, trace_id, emitted_at, and payload.
- Offline replay identifiers record_id, dataset, canonical_role, and segment_id are now part of the canonical contract surface so replay and live paths can converge without renaming fields.

## 2026-03-07 - Canonical Environment Variables Now Have A Single Source Of Truth

- docs/environment.md and .env.example are now the required source of truth for runtime configuration across web, gateway, orchestrator, infra, and model services.
- Compatibility aliases such as OPENAI_API_KEY, DASHSCOPE_API_KEY, key, baseurl, and model are explicitly quarantined to current ASR bridge tooling and should not leak into new service code.

## 2026-03-07 - Transcript Workflow Is The Current Core Integration Layer

- `data/derived/transcripts/val_transcripts_template.jsonl` is now the most important
  integration file in the repository.
- It is the handoff layer between:
  - raw enterprise data
  - external ASR output
  - human review
  - later text-based evaluation and replay
- Future ASR, text analysis, replay, and evaluation work should use transcript workflow
  state instead of inventing separate tracking tables.

## 2026-03-07 - DashScope Qwen3 ASR Requires Compatible-Mode Routing

- `qwen3-asr-flash` works for real ASR calls in this repository.
- The successful path is the DashScope OpenAI-compatible route:
  - `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Pointing the current ASR script at
  `https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription`
  is not compatible with the current `transcribe-openai` implementation.

## 2026-03-07 - Human Review Is Mandatory, Not Cosmetic

- First real ASR drafts contain French content while transcript metadata still defaults
  to `zh-CN`.
- This proves transcript review must validate:
  - transcript text
  - punctuation and omissions
  - language metadata
  - review flags
- No later evaluation step should treat `draft_ready` as equivalent to verified text.
<!-- architecture:insights:end -->
