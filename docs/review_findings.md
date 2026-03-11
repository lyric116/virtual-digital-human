# Review Findings

Current status after re-verification and a fresh static review. This document records observed issues only; it does not apply fixes.

## Current checks

- `UV_CACHE_DIR=.uv-cache uv run pytest` -> `211 passed`
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

### Open — RAG retrieval failures still degrade silently and drop observability

Evidence:

- `apps/orchestrator/main.py:258-265`
- `apps/api-gateway/main.py:3003-3010`
- `apps/api-gateway/main.py:3092-3095`

Current state:

- `attach_rag_context()` still swallows retrieval `RuntimeError` and falls back to the original dialogue payload with no explicit failure marker
- gateway retrieval evidence is still conditional on non-empty `retrieval_context.source_ids`, so failed retrieval attempts do not emit a corresponding observable event
- this means a user can receive a normal `dialogue.reply` while grounding quietly disappeared from the event/export trail

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

### Open — environment inventory and compose/runtime docs still drift from actual behavior

Evidence:

- `README.md:273-277`
- `docs/environment.md:56-60`
- `.env.example:25-30`
- `apps/orchestrator/main.py:51-68`
- `infra/compose/docker-compose.core.yml:79-80`
- `infra/compose/docker-compose.core.yml:121-122`
- `infra/compose/docker-compose.core.yml:217-218`
- `infra/compose/docker-compose.full.yml:79-80`
- `infra/compose/docker-compose.full.yml:121-122`
- `infra/compose/docker-compose.full.yml:146-147`
- `infra/compose/docker-compose.full.yml:261-262`
- `tests/test_environment_inventory.py:42-46`

Current state:

- the docs/test inventory still treated `ORCHESTRATOR_SESSION_TTL_SECONDS` as a required runtime input even though orchestrator settings do not read it at all
- README had implied runtime containers uniformly load `../../.env` via `env_file`, but current compose files only do that for a subset of services
- the resulting operator expectation is still broader than what the actual runtime wiring guarantees

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

### Resolved — summary refresh failures now emit observable `session.error`

Current evidence:

- `apps/api-gateway/main.py:3137-3177`
- `tests/test_api_gateway_session_create.py:1383-1483`

Current state:

- the post-reply summary refresh path no longer silently swallows failures
- if summary refresh persistence or summary event recording fails, the gateway now emits `session.error`
- the primary `dialogue.reply` still succeeds, but the failure is visible in persisted/realtime event streams

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
