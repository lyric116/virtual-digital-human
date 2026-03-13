# Review Findings

Current status after re-verification and targeted fixes. This document records review findings and current verification status; it does not apply fixes itself.

## Current checks

- `UV_CACHE_DIR=.uv-cache uv run pytest` -> `234 passed`
- `UV_CACHE_DIR=.uv-cache uv run ruff check .` -> passed

## Previously reported issues

### Resolved — media files written before DB insert could leave orphaned files

Previous concern:

- uploaded media bytes were written to disk before the `media_indexes` row existed
- DB failures could leave orphaned local files behind

Current evidence:

- `apps/api-gateway/main.py:1709-1715`
- `apps/api-gateway/main.py:1726-1788`
- `apps/api-gateway/main.py:1825-1832`
- `apps/api-gateway/main.py:1832-1894`
- `apps/api-gateway/main.py:1928-1935`
- `apps/api-gateway/main.py:1946-2003`

Current state:

- all three media write paths now call `_delete_local_path(absolute_path)` on insert failure
- they also clean up when the insert returns no row

### Resolved — websocket pending-event queue had no bound or TTL

Previous concern:

- `_pending_events` could grow without limit for disconnected sessions

Current evidence:

- `apps/api-gateway/main.py:626-645`
- `apps/api-gateway/main.py:662-680`
- `tests/test_api_gateway_session_create.py:1438-1458`

Current state:

- pending events are now stored as `PendingRealtimeEvent`
- queues are pruned by age using `DEFAULT_PENDING_EVENT_TTL_SECONDS`
- queues are capped by `DEFAULT_MAX_PENDING_EVENTS_PER_SESSION`

### Resolved — some gateway env vars looked inventory-only

Previous concern:

- `SESSION_EXPORT_DIR`, `GATEWAY_PUBLIC_BASE_URL`, and `GATEWAY_WS_PATH` appeared documented but not actively used

Current evidence:

- `apps/api-gateway/main.py:103-113`
- `apps/api-gateway/main.py:133-163`
- `apps/api-gateway/main.py:2477-2496`
- `tests/test_api_gateway_session_create.py:1728-1755`

Current state:

- `GATEWAY_PUBLIC_BASE_URL` and `GATEWAY_WS_PATH` are used to derive runtime config and websocket URLs
- `SESSION_EXPORT_DIR` is used when persisting export snapshots and is exposed in runtime config

### Resolved — `docs/02-gateway-orchestrator.md` had stale route names

Current evidence:

- `docs/02-gateway-orchestrator.md:83-101`

Current state:

- the document now reflects current routes such as `/api/session/create`, `/api/session/{session_id}/audio/chunk`, `/api/session/{session_id}/export`, `WS /ws/session/{session_id}`, `/api/asr/transcribe`, and `/internal/avatar/offline-drive`

### Resolved — background dialogue pipeline tasks were unmanaged fire-and-forget tasks

Previous concern:

- request handlers used unsupervised `asyncio.create_task(...)`

Current evidence:

- `apps/api-gateway/main.py:3222-3249`
- `apps/api-gateway/main.py:3317-3321`
- `apps/api-gateway/main.py:3456-3460`
- `apps/api-gateway/main.py:3544-3551`

Current state:

- task scheduling is centralized in `schedule_background_task(...)`
- tasks are tracked on `app.state.background_tasks`
- shutdown now cancels tracked background tasks

### Resolved — lint failures

Current evidence:

- `UV_CACHE_DIR=.uv-cache uv run ruff check .` -> passed

## Current review findings

### Resolved — core compose verifier can race web config rendering and barely validates rendered config

Current evidence:

- `scripts/verify_core_compose_stack.py:64-100`
- `scripts/verify_core_compose_stack.py:117-147`
- `tests/test_core_compose.py:17-39`

Current state:

- the verifier now waits for the web root to answer before fetching `config.js`
- it now parses and validates rendered `apiBaseUrl`, `wsUrl`, `ttsBaseUrl`, `affectBaseUrl`, `defaultAvatarId`, and `autoplayAssistantAudio` instead of previewing only the first line
- regression coverage now locks in that stronger verifier behavior

### Resolved — web runtime config inventory and tests drifted from the actual rendered config contract

Current evidence:

- `.env.example:12-17`
- `docs/environment.md:34-41`
- `tests/test_environment_inventory.py:27-119`

Current state:

- `WEB_AUTOPLAY_ASSISTANT_AUDIO` is now documented in both `.env.example` and `docs/environment.md`
- environment inventory tests now require both `WEB_PUBLIC_AFFECT_BASE_URL` and `WEB_AUTOPLAY_ASSISTANT_AUDIO`
- the documented web runtime contract and the regression suite are aligned again

### Resolved — internal HTTP calls treated proxy configuration inconsistently across gateway and orchestrator

Current evidence:

- `apps/api-gateway/main.py:2527-2667`
- `apps/api-gateway/main.py:2670-2702`
- `tests/test_api_gateway_session_create.py:462-606`

Current state:

- gateway internal HTTP calls now go through a shared opener that disables ambient proxies, matching orchestrator behavior
- internal calls to orchestrator, affect-service, dialogue summary, and ASR now follow one consistent proxy policy

### Resolved — live affect snapshots were not bound to saved audio/video media assets

Current evidence:

- `apps/api-gateway/main.py:2527-2600`
- `apps/api-gateway/main.py:2238-2379`
- `apps/api-gateway/main.py:2702-2803`
- `tests/test_api_gateway_session_create.py:716-785`
- `tests/test_api_gateway_video_frame.py:73-95`

Current state:

- gateway now binds persisted `audio_storage_path` and latest video frame path into the affect request metadata using the keys that affect-service actually consumes
- finalized audio messages now retain the saved audio storage path
- video frame uploads now expose the latest persisted frame path for downstream affect analysis wiring

### Resolved — downstream dialogue identifiers were trusted too loosely at the gateway boundary

Current evidence:

- `apps/orchestrator/main.py:154-185`
- `apps/api-gateway/main.py:2527-2585`
- `apps/api-gateway/main.py:3175-3198`
- `tests/test_orchestrator_mock_reply.py:83-117`
- `tests/test_api_gateway_session_create.py:462-606`

Current state:

- orchestrator now rejects dialogue replies whose `session_id` or `trace_id` do not match the request it sent
- gateway also normalizes the reply identity back to the authoritative session identifiers before later persistence/event use
- realtime `dialogue.reply` payloads now explicitly emit the persisted session identifiers

### Resolved — finalized-audio duration could diverge across response payloads, stored metadata, and emitted events

Current evidence:

- `apps/api-gateway/main.py:2586-2624`
- `apps/api-gateway/main.py:2761-2811`
- `apps/api-gateway/main.py:2997-3022`
- `apps/api-gateway/main.py:3560-3599`
- `tests/test_api_gateway_audio_finalize.py:119-212`
- `tests/test_api_gateway_session_create.py:1794-1895`

Current state:

- audio finalize now resolves one canonical duration value, preferring the request value and otherwise falling back to ASR duration
- that resolved duration is now written into message metadata, emitted in `transcript.final`, and returned by the finalize route
- successful finalize requests no longer surface conflicting duration values across those three interfaces

### Resolved — RAG retrieval failures no longer degrade silently

Current evidence:

- `apps/orchestrator/main.py:258-277`
- `apps/api-gateway/main.py:3008-3035`
- `tests/test_orchestrator_mock_reply.py:266`
- `tests/test_api_gateway_session_create.py:1068`
- `docs/shared_contracts.md:291`

Current state:

- orchestrator now marks retrieval attempts with `knowledge_retrieval_attempted`
- retrieval failures now propagate machine-readable `knowledge_retrieval_status="failed"` plus an error message instead of disappearing silently
- gateway now records `knowledge.retrieved` even when retrieval failed or returned no cards, so degraded grounding remains visible in persisted/realtime trails

### Open — compose "deployment" stacks remain host-coupled dev harnesses

Evidence:

- `infra/compose/docker-compose.core.yml:65-67`
- `infra/compose/docker-compose.core.yml:86-88`
- `infra/compose/docker-compose.core.yml:160-162`
- `infra/compose/docker-compose.core.yml:201-203`
- `infra/compose/docker-compose.full.yml:153-155`
- `infra/compose/docker-compose.full.yml:172-174`
- `infra/compose/docker-compose.full.yml:200-202`
- `infra/compose/docker-compose.full.yml:245-247`
- `README.md:231-236`
- `tests/test_core_compose.py:41-50`
- `tests/test_full_compose.py:12-22`

Current state:

- both core/full stacks still mount the repo root into `/app` and bind host `.venv/lib/python3.11/site-packages` into the container runtime
- startup therefore still depends on a prepared host checkout plus host-side `uv sync`, which is consistent with a local dev harness but not with a portable deployment artifact

### Open — compose/runtime documentation still needs careful reading despite inventory cleanup

Evidence:

- `README.md:273-278`
- `docs/environment.md:56-60`
- `.env.example:25-29`
- `tests/test_environment_inventory.py:42-46`
- `infra/compose/docker-compose.core.yml:79-80`
- `infra/compose/docker-compose.core.yml:121-122`
- `infra/compose/docker-compose.core.yml:217-218`
- `infra/compose/docker-compose.full.yml:79-80`
- `infra/compose/docker-compose.full.yml:121-122`
- `infra/compose/docker-compose.full.yml:146-147`
- `infra/compose/docker-compose.full.yml:261-262`

Current state:

- the stale `ORCHESTRATOR_SESSION_TTL_SECONDS` inventory claim has been removed from docs/tests, so that part of the drift is fixed
- README now correctly narrows the claim: `--env-file .env` is compose-time substitution from the repo root, while only a subset of runtime containers load `../../.env` through `env_file`
- the remaining risk is operational misunderstanding: these compose stacks still do not provide a single uniform runtime env contract across all services

### Open — final acceptance and deployment docs still overstate current compose readiness

Evidence:

- `docs/final_acceptance_checklist.md:27-38`
- `docs/09-deploy-deliverables.md:5-14`
- `docs/09-deploy-deliverables.md:65-67`
- `docs/final_acceptance_checklist.json:107-116`
- `infra/compose/docker-compose.core.yml:65-67`
- `infra/compose/docker-compose.full.yml:153-155`

Current state:

- acceptance materials still frame the current asset set as `Docker 交付与统一部署`, while the compose files remain host-coupled dev/demo harnesses
- deploy docs still use stronger `可落地` / `完整部署配置` language than the evidence supports for a portable deployment artifact
- this creates a stronger delivery-readiness signal than the repository can currently prove

### Open — compose acceptance checks still give false confidence

Evidence:

- `tests/test_core_compose.py:41-59`
- `tests/test_full_compose.py:12-31`
- `scripts/verify_final_acceptance_assets.py:15-35`
- `docs/final_acceptance_checklist.json:107-116`

Current state:

- `tests/test_full_compose.py` still performs static token checks and cannot prove the full compose stack actually boots or matches the documented deployment contract
- existing compose tests still encode host `.venv`-mounted dev behavior as the expected baseline, which is easy to misread as deployment correctness
- `scripts/verify_final_acceptance_assets.py` only validates evidence-path existence and status shape, so acceptance can stay green even when the underlying deployment claim is overstated

### Resolved — export snapshot write failures are now explicit

Current evidence:

- `apps/api-gateway/main.py:2446-2461`
- `apps/api-gateway/main.py:2477-2486`
- `apps/api-gateway/main.py:3292-3318`
- `tests/test_api_gateway_session_create.py:1724-1766`

Current state:

- `create_session_export_record()` now only builds the export payload
- the export route persists the snapshot explicitly
- snapshot write `OSError` now returns `503` with `error_code="session_export_snapshot_failed"`
- structured `details` include the export operation and configured export directory

### Resolved — affect snapshot failures now emit observable `session.error`

Current evidence:

- `apps/api-gateway/main.py:3088-3111`
- `tests/test_api_gateway_session_create.py:1152`

Current state:

- affect snapshot request failures are no longer reduced to `None` with no trace
- gateway now records `session.error` with `error_code="affect_snapshot_failed"` and retry metadata while allowing the primary reply path to continue
- the degraded path is now visible in persisted and realtime event streams

### Resolved — summary refresh failures now emit observable `session.error`

Current evidence:

- `apps/api-gateway/main.py:3137-3177`
- `tests/test_api_gateway_session_create.py:1383-1483`

Current state:

- the post-reply summary refresh path no longer silently swallows failures
- if summary refresh persistence or summary event recording fails, the gateway now emits `session.error`
- the primary `dialogue.reply` still succeeds, but the failure is visible in persisted/realtime event streams

### Resolved — malformed WAV uploads now return structured validation errors

Current evidence:

- `services/asr-service/main.py:788-801`
- `tests/test_asr_service.py:140`

Current state:

- invalid WAV bytes are now rejected during file inspection with `400` and `error_code="audio_file_invalid"`
- unreadable uploads no longer bubble out as framework-level 500 responses
- the ASR engine is not invoked for obviously broken WAV payloads

### Resolved — dialogue fallback no longer masks unexpected local bugs as successful replies

Current evidence:

- `services/dialogue-service/main.py:696-727`
- `tests/test_dialogue_service.py:279`
- `tests/test_dialogue_service.py:309`

Current state:

- expected upstream-style failures such as `TimeoutError` and `RuntimeError` still produce the designed fallback reply
- unexpected local exceptions now surface through translated HTTP errors instead of being wrapped as normal business success
- this preserves graceful degradation without hiding real implementation faults from callers

### Resolved — terminal websocket closes no longer trigger endless reconnect loops

Current evidence:

- `apps/web/app.js:2597-2607`
- `apps/web/app.js:2920-2927`
- `tests/test_web_realtime_connection.py:57-63`

Current state:

- the browser now distinguishes terminal closes such as `4404` / `session_not_found` from transient disconnects
- terminal closes move the UI into a stable `closed` state instead of scheduling another reconnect attempt
- transient forced drops still recover through the existing reconnect path

### Resolved — deprecated FastAPI shutdown hook migrated to lifespan handling

Current evidence:

- `apps/api-gateway/main.py:3239-3260`
- `tests/test_api_gateway_session_create.py:1807-1829`
- `UV_CACHE_DIR=.uv-cache uv run pytest` no longer reports the previous FastAPI `on_event` deprecation warning from the gateway

Current state:

- tracked background task shutdown is now handled through a lifespan-based cleanup path
- `shutdown_background_tasks()` is reusable and directly test-covered
- the deprecated `@app.on_event("shutdown")` hook has been removed

## Re-checks that remain intentionally not classified as bugs

### Browser runtime config still uses `window.__APP_CONFIG__`

Evidence:

- `apps/web/index.html:372-383`
- `apps/web/app.js:131-150`
- `apps/web/config.js:1`
- `infra/docker/web/entrypoint.sh:4-18`
- `README.md:262-264`

This is now documented and supported. It remains an important deployment caveat, but it is no longer a mismatch report by itself.

### Low/medium-risk RAG no-overlap grounding concern does not hold in current code

Evidence:

- `services/rag-service/main.py:394-401`
- `tests/test_rag_service.py:133-149`

The current retrieval path drops non-high-risk results when there is no meaningful semantic overlap and records `semantic:no_overlap_no_results`.
