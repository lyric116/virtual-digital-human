# Progress

## Purpose

This file is an append-only execution log for repository changes that have already been
implemented and validated. Each entry should capture scope, outputs, self-check results,
and the next safe handoff point for the next developer.

## Entry Format

Each appended entry must contain:

- `Date`
- `Title`
- `Scope`
- `Outputs`
- `Checks`
- `Next`

Automation appends new entries under the marker block below.

<!-- progress:entries:start -->

## 2026-03-11 - 2026-03-11 - Frontend TTS Playback Now Uses Browser-Reachable Audio URLs

### Scope

frontend tts playback, tts-service, docker web runtime

### Outputs

- Updated tts-service to derive audio_url from the incoming request base URL, added frontend normalization for Docker-internal TTS media hosts, changed the Docker web entrypoint default to WEB_AUTOPLAY_ASSISTANT_AUDIO=true, and downgraded transient autoplay/media-load failures from terminal error state to retryable ready state.

### Checks

- Verified node --check for apps/web/app.js and scripts/web_tts_playback_harness.js, targeted pytest for TTS/web playback (11 passed), and full pytest (223 passed).

### Next

- Recreate the web and tts-service containers, then re-run one browser dialogue reply to confirm autoplay and post-playback state are correct under Docker.

## 2026-03-11 - 2026-03-11 - Compose Runtime Env Loading Fixed For Nested Stacks

### Scope

deployment, compose, runtime configuration

### Outputs

- Updated core/full compose stacks to load ../../.env for runtime service configuration; removed explicit ASR/LLM/TTS/WEB env overrides that were masking repository-root credentials; aligned blank-env bootstrap handling in tts-service, rag-service, and affect-service.

### Checks

- Verified docker compose --env-file .env -f infra/compose/docker-compose.full.yml config, ruff check ., targeted compose/env tests, and full pytest (219 passed).

### Next

- Recreate the running containers with docker compose --env-file .env -f infra/compose/docker-compose.full.yml up -d --build --force-recreate and re-run the browser voice upload.

## 2026-03-11 - Fix blank env override for runtime bootstrap

### Scope

Resolved a runtime bootstrap bug where empty container environment variables prevented gateway, orchestrator, dialogue-service, and asr-service from loading real credentials from the repository .env file.

### Outputs

- bootstrap_runtime_env now overwrites blank values with .env values in gateway, orchestrator, dialogue-service, and asr-service
- regression coverage added for blank environment values in tests/test_env_parsing_consistency.py

### Checks

- UV_CACHE_DIR=.uv-cache uv run ruff check .
- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_env_parsing_consistency.py tests/test_asr_service.py tests/test_environment_inventory.py
- UV_CACHE_DIR=.uv-cache uv run pytest

### Next

- Recreate the asr-service and gateway containers so they pick up the fixed bootstrap logic and the current .env values
- Re-run the browser voice upload flow and confirm the previous 401 Unauthorized error is gone

## 2026-03-11 - Step 53 final acceptance checklist

### Scope

Built the final acceptance asset set so every competition-facing requirement has an explicit status and real evidence paths instead of informal notes.

### Outputs

- docs/final_acceptance_checklist.md with requirement-by-requirement acceptance status and remaining gap list
- docs/final_acceptance_checklist.json as the machine-checkable evidence inventory
- scripts/verify_final_acceptance_assets.py and tests/test_final_acceptance_checklist.py for checklist verification

### Checks

- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_final_acceptance_assets.py
- UV_CACHE_DIR=.uv-cache uv run ruff check .
- UV_CACHE_DIR=.uv-cache uv run pytest

### Next

- Close the remaining docker live validation gap on a local machine and attach the resulting logs/screenshots to the acceptance checklist
- After live docker validation, use the acceptance checklist as the source of truth for答辩材料 and final polish prioritization

## 2026-03-11 - Step 52 full compose deployment config

### Scope

Added the expanded deployment compose for the voice and avatar chain by extending the local-development container strategy from the core stack to asr-service and avatar-driver-service.

### Outputs

- infra/compose/docker-compose.full.yml with asr-service, avatar-driver-service, and gateway ASR wiring
- static verification coverage for the full compose asset via tests/test_full_compose.py and docker compose config
- README and deployment docs updated to distinguish core compose from full compose

### Checks

- docker compose -f infra/compose/docker-compose.full.yml config
- UV_CACHE_DIR=.uv-cache uv run ruff check .
- UV_CACHE_DIR=.uv-cache uv run pytest

### Next

- If local Docker container creation is available, run a full voice session against docker-compose.full.yml to close the live validation gap
- Continue implementation plan to step 53 final acceptance checklist after full compose live validation

## 2026-03-11 - Step 51 core compose stack and review fixes

### Scope

Closed the remaining review-driven gateway fixes, added a step-51 core compose stack for the text loop, and hardened the docker verifier so it fails fast instead of hanging when container startup is blocked.

### Outputs

- apps/api-gateway runtime config endpoint, bounded pending-event queue, tracked background tasks, and export snapshot persistence
- dockerized web shell assets plus docker-compose.core.yml for web, gateway, orchestrator, dialogue, rag, affect, tts, postgres, redis, and minio
- documentation updates clarifying that the core compose stack mounts the local repo and .venv site-packages for Python services

### Checks

- UV_CACHE_DIR=.uv-cache uv run ruff check .
- UV_CACHE_DIR=.uv-cache uv run pytest
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_core_compose_stack.py --compose-file infra/compose/docker-compose.core.yml --compose-up-timeout-seconds 5 --down-after (expected explicit timeout in current agent docker environment)

### Next

- If docker container creation works on the local machine, rerun scripts/verify_core_compose_stack.py without the short timeout for a full live compose proof
- Continue implementation plan from step 52 after the core compose stack is validated end-to-end locally

## 2026-03-11 - Fix review regressions

### Scope

rag-service, api-gateway, replay tests, environment docs

### Outputs

- Added semantic gating for non-high-risk RAG retrieval, cleaned orphan media files on media_indexes insert failure, corrected frontend config documentation, refreshed gateway/orchestrator route docs, and added replay/export completeness checks.

### Checks

- ruff check .; pytest 201 passed

### Next

- Continue implementation plan from the next pending step after review fixes.

## 2026-03-11 - Step 50 Ten-Turn Stability Regression

### Scope

Added a real 10-turn service-level regression that exercises affect, RAG, dialogue, summary generation, and one enterprise multimodal offline sample.

### Outputs

- Added scripts/eval_ten_turn_stability.py and scripts/verify_ten_turn_stability.py.
- Generated data/derived/eval-local/ten_turn_stability_report.md and ten_turn_stability_report.json.
- Documented the regression path in README.md and docs/08-data-ops-eval.md.

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_eval_ten_turn_stability.py -q
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_ten_turn_stability.py

### Next

- Proceed to step 51 and containerize the core services for clean-environment startup.

## 2026-03-11 - Step 49 Latency Baseline

### Scope

Established a reproducible latency report across five real text turns and one enterprise offline audio turn, using stable local TTS and explicit ASR-timeout accounting.

### Outputs

- Added scripts/eval_latency_report.py and scripts/verify_latency_report.py.
- Generated data/derived/eval-local/latency_report.md and latency_report.json.
- Documented the stable latency baseline in README.md and docs/08-data-ops-eval.md.

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_eval_latency_report.py -q
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_latency_report.py

### Next

- Proceed to step 50 and add a 10-turn stability regression harness.

## 2026-03-10 - Step 48 Session Replay Mode

### Scope

Completed implementation plan step 48 by adding a frontend replay path driven by exported session JSON, so one saved conversation can be reconstructed locally without calling live gateway, dialogue, affect, RAG, or TTS services.

### Outputs

- apps/web/app.js now stores export payloads in browser cache, exposes a Replay Export control, rebuilds a replay sequence from exported events or messages, and replays transcript, affect, dialogue, TTS, and avatar states in order.
- apps/web/index.html now includes a Replay Export control in the session panel.
- data/demo/session_replay_export.json now provides a deterministic full-chain replay sample with transcript.final, affect.snapshot, knowledge.retrieved, dialogue.reply, tts.*, and avatar.command events.
- scripts/web_session_replay_harness.js and scripts/verify_web_session_replay.py now verify replay mode without live services.
- tests/test_web_session_replay.py now covers the replay flow and documentation references.

### Checks

- node --check apps/web/app.js && node --check scripts/web_session_replay_harness.js && node --check scripts/web_tts_playback_harness.js
- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_web_session_replay.py tests/test_web_tts_playback.py tests/test_memory_bank.py -q
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_replay.py
- UV_CACHE_DIR=.uv-cache uv run pytest

### Next

- Step 49: build latency metrics across ASR, affect, dialogue, TTS, avatar, and total interaction time.

## 2026-03-10 - Step 47 Unified Trace Logging

### Scope

Completed implementation plan step 47 by extending the shared system_events stream to cover transcript, retrieval, dialogue, TTS, and avatar runtime events, while copying enterprise replay lineage into event payloads for export and audit.

### Outputs

- apps/api-gateway/main.py now persists transcript.final, knowledge.retrieved, and client-posted runtime events, and build_event_envelope now copies record_id/dataset/canonical_role/segment_id into event payloads when the session is replay-bound.
- services/dialogue-service/main.py now echoes retrieval_context so gateway logging can separate retrieval evidence from the final dialogue reply.
- apps/web/app.js now best-effort posts tts.synthesized, tts.playback.started, tts.playback.ended, and avatar.command back to the gateway without blocking the main reply path.
- scripts/verify_session_trace_logging.py was added as the live full-chain verifier for audio input, ASR, affect, RAG, dialogue, TTS, avatar runtime events, and export inspection.
- README.md, apps/api-gateway/README.md, docs/shared_contracts.md, docs/database_schema.md, and docs/08-data-ops-eval.md now document the unified trace model.

### Checks

- node --check apps/web/app.js && node --check scripts/web_tts_playback_harness.js
- UV_CACHE_DIR=.uv-cache uv run python -m py_compile apps/api-gateway/main.py apps/orchestrator/main.py services/dialogue-service/main.py scripts/verify_session_trace_logging.py
- UV_CACHE_DIR=.uv-cache uv run pytest
- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_memory_bank.py tests/test_shared_contracts.py -q
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_session_trace_logging.py currently remains environment-blocked in this sandbox because local PostgreSQL host connectivity closes unexpectedly even though the Docker container is healthy.

### Next

- Step 48: build replay mode on top of exported system_events so a saved session can be reconstructed without calling live model services.

## 2026-03-10 - Step 46 High-Risk RAG Guardrail

### Scope

Completed implementation plan step 46 by enforcing a retrieval-side high-risk guardrail in rag-service so urgent queries bypass ordinary stage filtering and only return handoff-safe knowledge cards.

### Outputs

- services/rag-service/main.py now restricts high-risk retrieval to handoff_support and future safety_support categories before similarity scoring.
- tests/test_rag_service.py now verifies that a high-risk query sent from current_stage=assess still returns only handoff cards and records the guardrail flags.
- scripts/verify_rag_service.py now exercises the guarded path with a non-handoff stage and fails if ordinary support cards leak into the results.
- docs/06-rag-kb.md, services/rag-service/README.md, docs/shared_contracts.md, and README.md now document the high-risk retrieval boundary.

### Checks

- UV_CACHE_DIR=.uv-cache uv run python -m py_compile services/rag-service/main.py scripts/verify_rag_service.py
- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_rag_service.py tests/test_knowledge_cards.py -q
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_knowledge_cards.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_rag_service.py
- UV_CACHE_DIR=.uv-cache uv run pytest

### Next

- Step 47: connect high-risk retrieval guardrails to dialogue-level response restrictions and logging if the implementation plan requires further safety hardening.

## 2026-03-10 - Step 45 Dialogue RAG Grounding

### Scope

Completed implementation plan step 45 by routing rag-service retrieval through orchestrator into dialogue-service, grounding reply content against the retrieved cards, and making the same sleep query resolve to different knowledge_refs and follow-up language under low versus medium risk hints.

### Outputs

- apps/orchestrator/main.py
- services/dialogue-service/main.py
- data/kb/knowledge_cards.jsonl
- scripts/verify_dialogue_rag_grounding.py
- tests/test_orchestrator_mock_reply.py
- tests/test_dialogue_service.py
- docs/05-dialogue-state-llm.md
- docs/06-rag-kb.md
- apps/orchestrator/README.md
- services/dialogue-service/README.md
- README.md

### Checks

- UV_CACHE_DIR=.uv-cache uv run python -m py_compile apps/orchestrator/main.py services/dialogue-service/main.py scripts/verify_dialogue_rag_grounding.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_knowledge_cards.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_rag_service.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_rag_grounding.py
- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_orchestrator_mock_reply.py tests/test_dialogue_service.py tests/test_rag_service.py tests/test_knowledge_cards.py tests/test_environment_inventory.py tests/test_shared_contracts.py
- UV_CACHE_DIR=.uv-cache uv run pytest with 186 passed

### Next

- Step 46: add explicit high-risk retrieval guardrails so only handoff-safe knowledge can appear once risk reaches high.

## 2026-03-10 - Step 44 RAG Retrieval Baseline

### Scope

Completed implementation plan step 44 by adding a standalone rag-service that loads the curated knowledge-card dataset, builds an in-memory sparse retrieval index, applies stage and risk metadata filters, and returns scored source_id-bearing retrieval results without yet touching dialogue-service.

### Outputs

- services/rag-service/main.py
- services/rag-service/README.md
- scripts/verify_rag_service.py
- tests/test_rag_service.py
- docs/06-rag-kb.md
- docs/shared_contracts.md
- docs/environment.md
- .env.example
- README.md

### Checks

- UV_CACHE_DIR=.uv-cache uv run python -m py_compile services/rag-service/main.py scripts/verify_rag_service.py
- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_rag_service.py tests/test_environment_inventory.py tests/test_shared_contracts.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_rag_service.py
- UV_CACHE_DIR=.uv-cache uv run pytest with 184 passed

### Next

- Step 45: inject retrieved knowledge refs and support phrases into dialogue-service while keeping the current source_id traceability.

## 2026-03-10 - Step 43 Knowledge Card Dataset

### Scope

Completed implementation plan step 43 by introducing the first curated knowledge-card dataset for RAG, validating field coverage and category boundaries, and documenting the separation between curated support content, enterprise multimodal validation data, and MAGICDATA ASR evaluation data.

### Outputs

- data/kb/knowledge_cards.jsonl
- data/kb/README.md
- services/rag-service/README.md
- scripts/verify_knowledge_cards.py
- tests/test_knowledge_cards.py
- docs/06-rag-kb.md
- README.md

### Checks

- UV_CACHE_DIR=.uv-cache uv run python -m py_compile scripts/verify_knowledge_cards.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_knowledge_cards.py
- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_knowledge_cards.py

### Next

- Step 44: implement indexing and retrieval on top of the now-fixed curated card dataset instead of cleaning raw knowledge content during retrieval work.

## 2026-03-10 - Step 42 Affect Conflict Clarification

### Scope

Completed implementation plan step 42 by routing affect-service fusion conflicts into the dialogue path, persisting affect.snapshot evidence in the gateway, and forcing clarification-first replies when multimodal evidence disagrees with the user text.

### Outputs

- apps/api-gateway/main.py; services/dialogue-service/main.py; scripts/verify_dialogue_conflict_clarification.py; tests/test_api_gateway_session_create.py; tests/test_dialogue_service.py; tests/test_api_gateway_audio_finalize.py; tests/test_api_gateway_audio_preview.py; docs/05-dialogue-state-llm.md; apps/api-gateway/README.md; services/dialogue-service/README.md; docs/shared_contracts.md; README.md

### Checks

- UV_CACHE_DIR=.uv-cache uv run python -m py_compile apps/api-gateway/main.py services/dialogue-service/main.py scripts/verify_dialogue_conflict_clarification.py; UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_gateway_session_create.py tests/test_dialogue_service.py tests/test_api_gateway_audio_finalize.py tests/test_api_gateway_audio_preview.py; UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_conflict_clarification.py; UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py; UV_CACHE_DIR=.uv-cache uv run pytest with 177 passed.

### Next

- Step 43: build a small structured knowledge-card set before introducing retrieval, so the next stage can keep the current clarification-first safety behavior while adding grounded support content.

## 2026-03-10 - Step 41 First Fusion Rules

### Scope

Completed implementation plan step 41 by adding the first rule-based multimodal fusion layer in affect-service, wiring conflict-aware fusion states into the existing Emotion Panel contract, and verifying both a constructed neutral-text versus low-energy-audio conflict sample and one manifest-aligned enterprise sample.

### Outputs

- services/affect-service/main.py; scripts/verify_affect_service.py; scripts/web_emotion_panel_harness.js; scripts/verify_web_emotion_panel.py; tests/test_affect_service.py; tests/test_web_emotion_panel.py; docs/04-multimodal-affect.md; docs/shared_contracts.md; services/affect-service/README.md; apps/web/README.md; README.md

### Checks

- UV_CACHE_DIR=.uv-cache uv run python -m py_compile services/affect-service/main.py scripts/verify_affect_service.py scripts/verify_web_emotion_panel.py; UV_CACHE_DIR=.uv-cache uv run pytest tests/test_affect_service.py tests/test_web_emotion_panel.py; UV_CACHE_DIR=.uv-cache uv run python scripts/verify_affect_service.py; UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_emotion_panel.py; UV_CACHE_DIR=.uv-cache uv run pytest with 173 passed.

### Next

- Step 42: route fusion conflicts into dialogue clarification so multimodal disagreement changes reply strategy instead of remaining UI-only.

## 2026-03-10 - Step 40 Video Baseline States

### Scope

Implemented step 40 by upgrading affect-service video-lane analysis with deterministic offline frame states for synthetic frame fixtures and enterprise face3d bindings, while keeping the live browser path on non-blocking camera-state placeholders.

### Outputs

- Added offline video-frame analysis for synthetic .npy frames with stable_gaze_proxy and face_not_detected_proxy outputs.
- Added enterprise face3d-based offline verification so one real validation sample can drive a video-lane result without coupling the online path to enterprise video decoding.
- Extended the web emotion panel harness so the frontend can render distinct baseline video labels without changing the affect snapshot contract.

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_affect_service.py tests/test_web_emotion_panel.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_affect_service.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_emotion_panel.py
- UV_CACHE_DIR=.uv-cache uv run pytest

### Next

- Implement step 41 fusion rules using the now-upgraded text, audio, and video lane outputs.

## 2026-03-10 - Step 39 Audio Feature Baseline

### Scope

Implemented step 39 by upgrading affect-service audio-lane analysis from a pure upload-state placeholder into deterministic baseline feature summaries when a bound local audio file is available, while preserving live capture placeholders when only browser recording state exists.

### Outputs

- Added baseline audio features mean_rms, pause_ratio, segment_rate, energy_band, and tempo_band to affect-service audio analysis.
- Added synthetic fast/high-energy and slow/low-energy audio regression coverage plus two enterprise audio sample checks.
- Extended the web emotion panel harness so the frontend can render distinct audio lane labels without changing the affect snapshot contract.

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_affect_service.py tests/test_web_emotion_panel.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_affect_service.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_emotion_panel.py
- UV_CACHE_DIR=.uv-cache uv run pytest

### Next

- Implement step 40 visual baseline states without coupling enterprise video files into the online path.

## 2026-03-10 - Step 38 Text Affect Baseline

### Scope

Implemented step 38 by upgrading affect-service text-lane classification from a single anxious placeholder into deterministic coarse labels that now cover anxious, low_mood, guarded, neutral, and distressed while preserving the existing affect snapshot contract and panel rendering path.

### Outputs

- Upgraded services/affect-service text-lane rules to classify distressed/anxious/low_mood/guarded/neutral.
- Added enterprise transcript regression coverage using NoXI samples speaker_a/1 and speaker_b/2 from the transcript workflow.
- Kept the frontend emotion panel contract unchanged while aligning the local web harness with the new text labels.

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_affect_service.py tests/test_web_emotion_panel.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_affect_service.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_emotion_panel.py
- UV_CACHE_DIR=.uv-cache uv run pytest

### Next

- Implement step 39 audio baseline features in affect-service without changing the panel contract.

## 2026-03-10 - Step 37 Emotion Panel And Affect Service

### Scope

Completed implementation plan step 37 by adding a standalone affect-service placeholder contract, wiring the frontend emotion panel to text/audio/video/fusion snapshot rendering, and reserving enterprise sample source fields in the UI.

### Outputs

- services/affect-service/main.py
- services/affect-service/README.md
- apps/web/index.html
- apps/web/app.js
- apps/web/styles.css
- scripts/web_emotion_panel_harness.js
- scripts/verify_affect_service.py
- scripts/verify_web_emotion_panel.py
- tests/test_affect_service.py
- tests/test_web_emotion_panel.py
- docs/04-multimodal-affect.md
- docs/shared_contracts.md
- docs/environment.md

### Checks

- Ran node --check apps/web/app.js and scripts/web_emotion_panel_harness.js.
- Ran uv run python -m py_compile on affect-service and verifier scripts.
- Ran uv run pytest tests/test_affect_service.py tests/test_web_emotion_panel.py tests/test_web_shell.py tests/test_environment_inventory.py and confirmed 13 tests passed.
- Ran uv run python scripts/verify_affect_service.py and uv run python scripts/verify_web_emotion_panel.py.
- Ran uv run pytest and confirmed 162 tests passed.

### Next

- Implementation plan step 38: replace text-lane placeholders with a real lightweight text emotion baseline.
- Keep the affect outer contract stable while later steps replace lane internals.

## 2026-03-10 - Review fixes for session input modes and media validation

### Scope

Reviewed the current project, confirmed two real defects, and fixed them: the frontend session bootstrap now advertises video capability, and media ingestion helpers now reject invalid sequence, dimension, and duration values with stable 400 responses instead of passing bad input into storage logic.

### Outputs

- apps/web/app.js; apps/api-gateway/main.py; scripts/web_session_start_harness.js; tests/test_web_session_start.py; tests/test_api_gateway_audio_chunk.py; tests/test_api_gateway_video_frame.py; tests/test_api_gateway_audio_preview.py; tests/test_api_gateway_audio_finalize.py; docs/shared_contracts.md

### Checks

- Ran node --check apps/web/app.js and scripts/web_session_start_harness.js; UV_CACHE_DIR=.uv-cache uv run pytest tests/test_web_session_start.py tests/test_api_gateway_audio_chunk.py tests/test_api_gateway_video_frame.py tests/test_api_gateway_audio_preview.py tests/test_api_gateway_audio_finalize.py tests/test_shared_contracts.py; UV_CACHE_DIR=.uv-cache uv run pytest with 156 passed.

### Next

- Continue the implementation plan after the fixed review baseline, starting from step 37 or the next user-directed module.

## 2026-03-10 - Camera preview and frame upload baseline

### Scope

Completed implementation plan step 36 by adding camera permission handling, local preview, low-frequency video_frame upload, gateway persistence, and live verification.

### Outputs

- apps/api-gateway/main.py; apps/web/index.html; apps/web/app.js; apps/web/styles.css; scripts/web_camera_capture_harness.js; scripts/verify_web_camera_capture.py; tests/test_api_gateway_video_frame.py; tests/test_web_camera_capture.py

### Checks

- Ran node --check apps/web/app.js and scripts/web_camera_capture_harness.js; UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_gateway_video_frame.py tests/test_web_camera_capture.py tests/test_web_shell.py; UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_camera_capture.py (outside sandbox for local socket access); UV_CACHE_DIR=.uv-cache uv run pytest with 152 passed.

### Next

- Implementation plan step 37: add lightweight visual feature extraction baseline on top of the new video ingestion path without coupling it to dialogue yet.

## 2026-03-10 - step 35A offline avatar-driver validation

### Scope

Completed implementation plan step 35A by adding a standalone avatar-driver-service that reads enterprise 3D_FV_files, validates timing alignment against paired emotion CSV rows, emits deterministic sampled driver frames, and writes a checked offline validation report from a real enterprise sample.

### Outputs

- services/avatar-driver-service/main.py
- services/avatar-driver-service/README.md
- scripts/verify_avatar_driver_offline.py
- tests/test_avatar_driver_service.py
- data/derived/avatar_driver/offline_validation_report.md
- data/derived/avatar_driver/offline_validation_report.json
- README.md and docs/07-tts-avatar.md now describe the offline avatar-driver validation lane

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_avatar_driver_service.py -> 3 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_avatar_driver_offline.py -> passed
- UV_CACHE_DIR=.uv-cache uv run pytest -> 145 passed

### Next

- Step 36: add camera permission, preview, and low-frequency frame upload without touching the stable text/audio main path

## 2026-03-10 - gpt-5.2 confirmation and tts fallback hardening

### Scope

Confirmed the .env dialogue model switch to gpt-5.2 with real live verifiers, fixed the step-27 summary verifier race by adding a gateway summary fallback, and hardened steps 30-35 by adding local wav fallback for tts-service plus safer verifier shutdown handling.

### Outputs

- apps/api-gateway/main.py summary refresh now falls back locally when remote summary generation fails
- services/tts-service/main.py now uses edge_tts first and falls back to a locally generated wav asset when remote synthesis times out or fails
- scripts/verify_dialogue_summary_memory.py now waits for persisted summaries instead of checking too early
- scripts/verify_tts_service.py, scripts/verify_web_tts_playback.py, scripts/verify_web_avatar_switch.py, scripts/verify_web_avatar_mouth_drive.py, and scripts/verify_web_avatar_baseline.py now avoid cleanup errors masking successful live results
- README.md, docs/environment.md, docs/05-dialogue-state-llm.md, docs/07-tts-avatar.md, docs/shared_contracts.md, and handoff summary files now describe gpt-5.2 plus mp3-or-wav TTS behavior

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_gateway_session_create.py tests/test_tts_service.py tests/test_web_tts_playback.py tests/test_web_avatar_switch.py tests/test_web_avatar_mouth_drive.py tests/test_web_avatar_baseline.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_llm_samples.py -> passed with gpt-5.2
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_schema_validation.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_stage_machine.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_short_term_memory.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_summary_memory.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_tts_service.py -> passed via wav fallback
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_tts_playback.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_switch.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_mouth_drive.py -> passed
- UV_CACHE_DIR=.uv-cache uv run pytest -> 142 passed

### Next

- Continue implementation_plan with step 35A after keeping dialogue live verifiers serialized and leaving qwen3-asr-flash limited to ASR

## 2026-03-10 - Step 35 avatar expression presets

### Scope

Completed implementation plan step 35 by mapping dialogue stage, emotion, and risk_level into deterministic avatar expression presets in the frontend so the same static avatar no longer looks identical across assess, intervene, reassess, and handoff stages.

### Outputs

- Added expression preset resolution in apps/web/app.js with guarded_handoff as the hard safety override for high-risk or handoff replies
- Extended apps/web/index.html and apps/web/styles.css with expression preset telemetry and preset-specific visual states
- Added scripts/verify_web_avatar_expression_presets.py and tests/test_web_avatar_expression_presets.py for deterministic stage-to-expression verification

### Checks

- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_expression_presets.py -> passed
- UV_CACHE_DIR=.uv-cache uv run pytest -> 140 passed

### Next

- Step 35A: wire enterprise 3D face features into an offline avatar-driver validation path

## 2026-03-09 - Step 34 dual avatar switch

### Scope

Completed implementation plan step 34 by adding two selectable static avatar roles in the frontend, routing the selected role into session bootstrap and TTS synthesis, and verifying that switching changes both the rendered stage profile and the voice output.

### Outputs

- Added companion_female_01 and coach_male_01 avatar profiles to apps/web/app.js with explicit labels, notes, and voice previews
- Extended apps/web/index.html and apps/web/styles.css with two selectable avatar option cards plus profile-specific stage styling
- Updated scripts/web_tts_playback_harness.js, added tests/test_web_avatar_switch.py, and added live verification in scripts/verify_web_avatar_switch.py

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_web_shell.py tests/test_web_avatar_baseline.py tests/test_web_avatar_mouth_drive.py tests/test_web_tts_playback.py tests/test_web_avatar_switch.py -> 11 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_switch.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_tts_playback.py -> passed
- UV_CACHE_DIR=.uv-cache uv run pytest -> 138 passed

### Next

- Step 35: map dialogue stage and emotion to expression presets

## 2026-03-09 - Step 33 basic mouth drive

### Scope

Added a deterministic coarse mouth cue layer so the single static avatar no longer stays frozen while reply audio is playing, and the mouth always returns to closed after playback ends.

### Outputs

- Added frontend mouth cue generation in apps/web/app.js using reply text plus TTS duration to drive closed/small/wide/round mouth states
- Extended avatar stage markup and styling with mouth state telemetry and cue-driven mouth shapes
- Added short/long reply regression coverage in tests/test_web_avatar_mouth_drive.py and live verification in scripts/verify_web_avatar_mouth_drive.py

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 136 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_mouth_drive.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_tts_playback.py -> passed

### Next

- Step 34: add the second avatar and role switching

## 2026-03-09 - Step 32 static avatar baseline

### Scope

Replaced the placeholder avatar cards with one static 2D baseline character and bound its visual state to the current TTS playback lifecycle so the stage visibly switches between idle and speaking.

### Outputs

- Added one single-avatar baseline stage in apps/web/index.html with explicit idle/speaking labels and a static 2D figure
- Mapped frontend avatar visual state directly from TTS playback in apps/web/app.js without introducing lip sync or a second avatar
- Added avatar baseline regression coverage through tests/test_web_avatar_baseline.py and scripts/verify_web_avatar_baseline.py

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 134 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_avatar_baseline.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_tts_playback.py -> passed

### Next

- Step 33: add basic mouth open-close driving while audio is playing

## 2026-03-09 - Step 31 frontend TTS playback

### Scope

Connected apps/web to services/tts-service so one dialogue reply now becomes one playable avatar speech asset with subtitle sync and replay controls.

### Outputs

- Added frontend TTS request path in apps/web/app.js with playback state, replay, and non-fatal failure handling
- Extended avatar panel markup and styling for speech state, voice asset metadata, replay control, and hidden audio element
- Added browser-facing TTS CORS support in services/tts-service and created web_tts_playback harness plus live verifier

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 132 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_tts_service.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_tts_playback.py -> passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py -> passed

### Next

- Step 32: add one static 2D avatar baseline with speaking/idle state switching

## 2026-03-09 - step 30 single-voice tts baseline

### Scope

Completed implementation plan step 30 by adding a standalone tts-service that synthesizes one assistant reply into one local playable speech asset through edge-tts, serves the generated audio back over HTTP, and verifies three real Chinese samples with increasing durations.

### Outputs

- services/tts-service/main.py
- services/tts-service/README.md
- scripts/verify_tts_service.py
- tests/test_tts_service.py
- docs/07-tts-avatar.md

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 130 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_tts_service.py

### Next

- Continue implementation plan with step 31 frontend audio playback and subtitle sync using the new TTS audio_url output

## 2026-03-09 - step 29 dialogue fallback recovery

### Scope

Completed implementation plan step 29 by teaching dialogue-service to return a safe fallback DialogueReplyResponse when the upstream LLM path times out, returns empty content, or produces invalid output, and added a live verifier that proves the web flow still reaches dialogue.reply under forced failure.

### Outputs

- services/dialogue-service/main.py
- scripts/verify_dialogue_fallback_reply.py
- docs/05-dialogue-state-llm.md
- docs/environment.md
- .env.example

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 126 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_fallback_reply.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py

### Next

- Continue implementation plan with step 30 single-voice TTS on top of the now-stable dialogue fallback path

## 2026-03-09 - step 28 high-risk precheck and immediate message ack

### Scope

Completed implementation plan step 28 by adding a gateway-owned high-risk rule precheck that short-circuits obvious self-harm or suicide expressions to a deterministic handoff reply before any orchestrator call, and tightened the normal text path so message.accepted is emitted before long LLM follow-up work.

### Outputs

- apps/api-gateway/main.py
- scripts/verify_dialogue_high_risk_precheck.py
- scripts/web_mock_reply_harness.js
- scripts/verify_web_mock_reply.py
- docs/05-dialogue-state-llm.md

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 125 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_high_risk_precheck.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py

### Next

- Continue implementation plan with step 29 timeout and invalid-format fallback on top of the new high-risk rule layer

## 2026-03-09 - add cross-chat handoff summary

### Scope

Added a durable handoff summary in markdown and json so a new conversation can resume the repository state, decisions, and next step without replaying the full chat history.

### Outputs

- memory-bank/handoff-summary.md
- memory-bank/handoff-summary.json
- memory-bank/README.md

### Checks

- Verified the new handoff files were created under memory-bank/
- Planned JSON parse and markdown heading validation next

### Next

- Use the handoff summary as the first read in a new chat before progress.md and architecture.md

## 2026-03-09 - Fix gateway async IO and verifier regressions

### Scope

Resolved blocking gateway routes, websocket delivery edge cases, MIME normalization, upstream error translation, orphan audio cleanup, and stale live verifiers after the real dialogue-service cutover.

### Outputs

- Moved gateway text/audio routes and message pipeline blocking work onto asyncio.to_thread plus background dispatch.
- Fixed ConnectionRegistry enqueue/flush semantics to avoid duplicate delivery and preserve queued events on send failure.
- Normalized parameterized MIME types across gateway and asr-service and added orphan final-audio cleanup on ASR failure.
- Unified env parsing in gateway, orchestrator, dialogue-service, and refreshed live verifier scripts to start dialogue-service where orchestrator now depends on it.

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 122 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_infra_stack.py --compose-file infra/compose/docker-compose.yml
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_realtime_connection.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_short_term_memory.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_audio_final_transcript.py

### Next

- Continue implementation_plan from step 28 after this stability pass.

## 2026-03-09 - switch dialogue llm baseline to gpt-5.4

### Scope

Repointed the dialogue path away from the old qwen-plus baseline, updated the documented LLM defaults to gpt-5.4, and reran steps 24-27 regression with the user-provided OpenAI-compatible endpoint.

### Outputs

- .env.example and dialogue-related docs now describe gpt-5.4 through LLM_BASE_URL / LLM_API_KEY / LLM_MODEL instead of qwen-plus
- scripts/verify_dialogue_short_term_memory.py and scripts/verify_dialogue_summary_memory.py now allow a longer turn wait window that matches real multi-turn LLM latency better
- Step-24 to step-27 live verification is confirmed with gpt-5.4 when the verifiers are run serially rather than in parallel

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 107 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_llm_samples.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_schema_validation.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_short_term_memory.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_summary_memory.py

### Next

- Continue implementation plan with step 28 after keeping dialogue live verifiers serialized for the shared gpt-5.4 endpoint

## 2026-03-09 - step 27 dialogue summaries

### Scope

Added staged dialogue summaries that are generated every three user turns, persisted into session metadata, and reused on later dialogue requests without changing the frontend shell.

### Outputs

- services/dialogue-service/main.py now exposes /internal/dialogue/summarize and generates structured Chinese summary_text payloads through the real LLM boundary
- apps/orchestrator/main.py now proxies /internal/dialogue/summarize so the gateway still talks only to orchestrator for dialogue capabilities
- apps/api-gateway/main.py now persists sessions.metadata.dialogue_summary, emits dialogue.summary.updated, and forwards existing summaries back into metadata.dialogue_summary on later turns
- scripts/verify_dialogue_summary_memory.py now proves summary generation after three turns plus persistence across state reload and export

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 107 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_short_term_memory.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_summary_memory.py

### Next

- Continue implementation plan with step 28 high-risk rule precheck on top of the now-persisted summary context

## 2026-03-09 - post-review fixes for steps 23-26

### Scope

Fixed the issues found in the follow-up review by syncing next_action with resolved stage transitions, excluding the current user turn from short-term memory, and making live verifier scripts fail fast when PostgreSQL is not reachable.

### Outputs

- apps/api-gateway/main.py now normalizes next_action whenever the stage machine rewrites the model-proposed stage
- apps/api-gateway/main.py now excludes the current accepted user message from metadata.short_term_memory
- scripts/verify_web_mock_reply.py and scripts/verify_dialogue_short_term_memory.py now preflight PostgreSQL and emit a clear infrastructure error if Docker-backed services are not up

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 103 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_short_term_memory.py

### Next

- Continue implementation plan from step 27 with dialogue summaries on top of the corrected stage and short-term-memory baseline

## 2026-03-09 - step 26 short-term dialogue memory

### Scope

Added a gateway-side short-term memory layer that reads recent message rows, forwards them as metadata.short_term_memory to dialogue-service, and verifies factual recall after two turns with the real LLM stack.

### Outputs

- apps/api-gateway/main.py now fetches recent dialogue context and injects it into request_dialogue_reply metadata
- services/dialogue-service/main.py prompt now instructs the LLM to use short_term_memory for recent-turn continuity and factual recall
- scripts/verify_dialogue_short_term_memory.py proves the system can recall a user name after two turns
- README and dialogue/gateway docs now describe short-term memory as the only pre-summary memory layer

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 101 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_short_term_memory.py

### Next

- Implement step 27 staged dialogue summaries so longer sessions stop relying only on raw-turn memory

## 2026-03-09 - step 25 dialogue stage machine

### Scope

Added a gateway-owned stage machine that treats the LLM stage as a proposal, resolves invalid jumps before persistence, and propagates the resolved stage through realtime events and assistant metadata.

### Outputs

- apps/api-gateway/main.py now resolves stage transitions before updating sessions and assistant message metadata
- scripts/verify_dialogue_stage_machine.py simulates a fixed multi-turn sequence and checks the exact resolved order
- README, docs/05-dialogue-state-llm.md, and apps/api-gateway/README.md now document gateway-enforced stage transitions

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 100 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_stage_machine.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py

### Next

- Implement step 26 short-term conversation memory without changing the current UI structure

## 2026-03-09 - step 24 real llm dialogue baseline

### Scope

Replaced dialogue-service mock generation with real openai-compatible LLM inference, validated five fixed samples with latency checks, and restored the web text reply live verifier to start dialogue-service explicitly.

### Outputs

- services/dialogue-service/main.py now calls the configured LLM and preserves DialogueReplyResponse contract
- scripts/verify_dialogue_llm_samples.py verifies five fixed text samples and high-risk routing
- scripts/verify_web_mock_reply.py now starts dialogue-service so web text reply live verification matches the new service topology
- README and dialogue-related docs now describe standard LLM_* configuration and the qwen-plus baseline

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest -> 98 passed
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_llm_samples.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_schema_validation.py
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py

### Next

- Implement step 25 session stage machine on top of the now-stable real LLM contract

## 2026-03-09 - Step 23 Dialogue Service Schema Gate

### Scope

Completed implementation plan step 23 by introducing a standalone dialogue-service that owns mock reply generation plus strict schema validation, then rewiring orchestrator to proxy through that service instead of constructing dialogue payloads locally.

### Outputs

- services/dialogue-service/main.py and services/dialogue-service/README.md now provide GET /health, POST /internal/dialogue/respond, and POST /internal/dialogue/validate as the stable dialogue schema boundary.
- apps/orchestrator/main.py and apps/orchestrator/README.md now route dialogue requests to DIALOGUE_SERVICE_BASE_URL and validate the returned payload before handing it back to the gateway.
- scripts/verify_dialogue_schema_validation.py now starts dialogue-service and orchestrator locally, proves valid payloads pass, invalid payloads fail with HTTP 422, and confirms orchestrator returns the validated assess-stage reply for a sleep-pressure sample.
- tests/test_dialogue_service.py, tests/test_orchestrator_mock_reply.py, tests/test_environment_inventory.py, and README.md now lock the new dialogue-service contract and required environment inventory.

### Checks

- Ran UV_CACHE_DIR=.uv-cache uv run python -m py_compile services/dialogue-service/main.py apps/orchestrator/main.py scripts/verify_dialogue_schema_validation.py scripts/verify_web_mock_reply.py tests/test_dialogue_service.py tests/test_orchestrator_mock_reply.py tests/test_environment_inventory.py.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest tests/test_dialogue_service.py tests/test_orchestrator_mock_reply.py tests/test_environment_inventory.py tests/test_web_mock_reply.py and confirmed 14 tests passed.
- Ran UV_CACHE_DIR=.uv-cache uv run python scripts/verify_dialogue_schema_validation.py and confirmed valid dialogue payloads returned 200, invalid stage payloads returned 422, and orchestrator forwarded one validated assess-stage reply.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest and confirmed 97 tests passed.

### Next

- Proceed to implementation plan step 24 by swapping dialogue-service mock generation for a real LLM while preserving the current response contract.
- Keep orchestrator as a proxy and control layer; do not move dialogue reply construction back into apps/orchestrator.

## 2026-03-09 - Expanded MAGICDATA Baseline And Added ASR Regression Gate

### Scope

Expanded the local MAGICDATA Chinese frozen evaluation subset from a small seed set to a broader 36-record core, then added a single ASR regression entrypoint that chains enterprise live checks, postprocess verification, baseline gating, and MAGICDATA threshold enforcement.

### Outputs

- scripts/prepare_magicdata_eval.py now defaults to a 36-record frozen core subset by selecting 12 records from each available split plus speaker_gender group and emits richer selection metadata in the summary.
- scripts/verify_asr_regression.py now runs the stable ASR regression sequence and enforces configurable WER and SER thresholds on the local MAGICDATA baseline when the corpus is present.
- README.md, services/asr-service/README.md, docs/03-asr.md, docs/08-data-ops-eval.md, docs/data_spec.md, and docs/implementation_plan.md now document the larger frozen subset and the new unified regression entrypoint.
- tests/test_verify_asr_regression.py now locks threshold behavior, and tests/test_prepare_magicdata_eval.py now locks the expanded subset summary fields.

### Checks

- Ran UV_CACHE_DIR=.uv-cache uv run python -m py_compile scripts/prepare_magicdata_eval.py scripts/verify_magicdata_asr_eval.py scripts/verify_asr_regression.py tests/test_prepare_magicdata_eval.py tests/test_verify_asr_regression.py.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest tests/test_prepare_magicdata_eval.py tests/test_verify_asr_regression.py tests/test_eval_asr_baseline.py tests/test_asr_service.py and confirmed 13 tests passed.
- Ran UV_CACHE_DIR=.uv-cache uv run python scripts/prepare_magicdata_eval.py and confirmed the local frozen subset expanded to 36 locked records.
- Ran UV_CACHE_DIR=.uv-cache uv run python scripts/verify_magicdata_asr_eval.py and observed WER=0.021368 with SER=0.055556 on the expanded subset.
- Ran UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_regression.py and confirmed the combined ASR gate passed with MAGICDATA metrics under the configured thresholds.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest and confirmed 94 tests passed.

### Next

- Keep future ASR optimization changes gated by scripts/verify_asr_regression.py instead of ad hoc command sequences.
- Treat the MAGICDATA threshold gate as tolerance-based because external ASR outputs can drift slightly between runs.

## 2026-03-09 - MAGICDATA Chinese ASR Evaluation Integration

### Scope

Added a local-only MAGICDATA Mandarin evaluation pipeline that extracts dev and test archives, builds a full official-reference catalog plus a frozen core subset, then runs real WER/SER evaluation through the existing standalone ASR service without touching the enterprise transcript workflow.

### Outputs

- scripts/prepare_magicdata_eval.py now extracts MAGICDATA archives when needed and generates data/derived/transcripts-local/magicdata_eval_all.jsonl plus data/derived/transcripts-local/magicdata_eval_core.jsonl.
- scripts/verify_magicdata_asr_eval.py now starts services/asr-service locally, runs scripts/eval_asr_baseline.py against the frozen Chinese core subset, and writes local reports under data/derived/eval-local/.
- README.md, services/asr-service/README.md, docs/03-asr.md, docs/08-data-ops-eval.md, docs/data_spec.md, and docs/implementation_plan.md now document the separate Chinese public-eval path and its local-only storage rules.
- tests/test_prepare_magicdata_eval.py and tests/test_eval_asr_baseline.py now lock the MAGICDATA import shape and Chinese character-level WER behavior.

### Checks

- Ran UV_CACHE_DIR=.uv-cache uv run python -m py_compile scripts/prepare_magicdata_eval.py scripts/verify_magicdata_asr_eval.py tests/test_prepare_magicdata_eval.py tests/test_eval_asr_baseline.py.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest tests/test_prepare_magicdata_eval.py tests/test_eval_asr_baseline.py tests/test_asr_service.py and confirmed 11 tests passed.
- Ran UV_CACHE_DIR=.uv-cache uv run python scripts/prepare_magicdata_eval.py and generated a local full reference catalog with 36072 rows plus a frozen 18-row core subset.
- Ran UV_CACHE_DIR=.uv-cache uv run python scripts/verify_magicdata_asr_eval.py and confirmed qwen3-asr-flash produced WER=0.042017 and SER=0.111111 on the frozen Chinese subset.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest and confirmed 92 tests passed.

### Next

- Keep MAGICDATA artifacts local under data/derived/transcripts-local and data/derived/eval-local; do not commit dataset-derived content.
- Use scripts/verify_magicdata_asr_eval.py as the reproducible Chinese ASR baseline gate before changing postprocess or provider settings.

## 2026-03-08 - Step 22 ASR Baseline Evaluation Gate

### Scope

Completed implementation plan step 22 by adding a read-only ASR baseline evaluator that computes WER and SER only from human-verified, evaluation-locked transcript rows, plus a deterministic verifier that proves complete reporting on temporary fixtures and blocked reporting on the current real workflow.

### Outputs

- scripts/eval_asr_baseline.py now filters transcript workflow rows with workflow_status=verified, locked_for_eval=true, and text_status=human_verified, then writes Markdown and JSON baseline artifacts.
- scripts/verify_asr_baseline_eval.py now proves two cases end to end: a temporary complete WER/SER report from locked fixture rows and a blocked report from the current real enterprise workflow.
- tests/test_eval_asr_baseline.py now locks the evaluator's gating rules, token error metrics, and blocked-report behavior.
- data/derived/eval/asr_baseline_report.md and data/derived/eval/asr_baseline_details.json now record the current real repository state as blocked because no formal evaluation subset has been locked yet.
- README.md, docs/03-asr.md, docs/08-data-ops-eval.md, and services/asr-service/README.md now document the step 22 evaluator and its strict provenance gate.

### Checks

- Ran UV_CACHE_DIR=.uv-cache uv run python -m py_compile scripts/eval_asr_baseline.py scripts/verify_asr_baseline_eval.py tests/test_eval_asr_baseline.py.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest tests/test_eval_asr_baseline.py tests/test_asr_service.py tests/test_asr_postprocess.py tests/test_environment_inventory.py and confirmed 16 tests passed.
- Ran UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_baseline_eval.py and confirmed a complete fixture report plus a blocked real-workflow report.
- Ran UV_CACHE_DIR=.uv-cache uv run python scripts/eval_asr_baseline.py --hypothesis-source draft and wrote the current blocked baseline report under data/derived/eval/.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest and confirmed 90 tests passed.

### Next

- Proceed to implementation plan step 22A by freezing a small manually reviewed subset with locked_for_eval=true so the blocked report can turn into the first formal WER/SER baseline.
- Keep eval_asr_baseline.py read-only; do not let evaluation tooling modify transcript workflow state.

## 2026-03-08 - Step 21 ASR Postprocess And Native DashScope Route

### Scope

Completed implementation plan step 21 by adding deterministic ASR postprocessing inside services/asr-service and switching qwen3-asr-flash to DashScope's native multimodal endpoint as the primary runtime transport, with the older compatible route retained only as a fallback.

### Outputs

- services/asr-service/main.py now performs silence-based segmentation, punctuation restoration, and hotword normalization before returning final transcript_text.
- services/asr-service/hotwords.json defines the current deterministic domain rewrite map used by the ASR service.
- tests/test_asr_postprocess.py and scripts/verify_asr_postprocess.py now prove before-versus-after transcript enhancement on the same wav sample.
- README.md, docs/environment.md, docs/03-asr.md, .env.example, and services/asr-service/README.md now document the native DashScope route and the new ASR postprocess controls.

### Checks

- Ran UV_CACHE_DIR=.uv-cache uv run python -m py_compile services/asr-service/main.py tests/test_asr_service.py tests/test_asr_postprocess.py scripts/verify_asr_postprocess.py.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest tests/test_asr_service.py tests/test_asr_postprocess.py tests/test_environment_inventory.py and confirmed 13 tests passed.
- Ran UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_postprocess.py and confirmed the enhanced transcript added hotword cleanup, pause-aware segmentation, and final punctuation.
- Ran UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_service.py and confirmed three enterprise samples transcribed successfully through the standalone service after switching to the native DashScope route.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest and confirmed 87 tests passed.

### Next

- Proceed to implementation plan step 22 by freezing a small human-verified ASR evaluation subset and generating the first reproducible baseline report.
- Keep qwen3-asr-flash transport changes inside services/asr-service so later dialogue and gateway work continue to depend only on the stable ASR HTTP contract.

## 2026-03-08 - Step 20 Partial Transcript Preview Loop

### Scope

Completed implementation plan step 20 by adding preview-time audio ASR requests, transcript.partial realtime events, and frontend partial transcript rendering during recording while keeping the finalized audio message contract from step 19 unchanged.

### Outputs

- apps/api-gateway/main.py now exposes POST /api/session/{session_id}/audio/preview, calls the standalone ASR service for best-effort preview text, and emits transcript.partial immediately over the session websocket without persisting a new message row.
- apps/web/app.js and apps/web/index.html now request preview snapshots during recording, render partial transcript text in the transcript panel and timeline summary, ignore stale preview events with recording_id plus preview_seq, and still switch to the final accepted transcript after stop.
- scripts/web_audio_final_transcript_harness.js now exercises chunk upload, transcript.partial, audio/finalize, and assistant reply in one recording simulation; scripts/verify_web_audio_partial_transcript.py validates the live partial-before-final behavior.
- tests/test_api_gateway_audio_preview.py and tests/test_web_audio_partial_transcript.py now lock the preview contract and frontend partial rendering path; README.md, apps/api-gateway/README.md, apps/web/README.md, and docs/shared_contracts.md now document the preview boundary.

### Checks

- Ran node --check apps/web/app.js scripts/web_audio_final_transcript_harness.js scripts/web_audio_chunk_upload_harness.js.
- Ran UV_CACHE_DIR=.uv-cache uv run python -m py_compile apps/api-gateway/main.py scripts/verify_web_audio_partial_transcript.py tests/test_api_gateway_audio_preview.py tests/test_web_audio_partial_transcript.py.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest and confirmed 82 tests passed.
- Ran live verification with scripts/verify_web_text_submit.py, scripts/verify_web_mock_reply.py, and scripts/verify_audio_chunk_upload.py after the realtime event changes and confirmed the older text and chunk paths still worked.
- Ran live verification with scripts/verify_web_audio_partial_transcript.py and confirmed partial transcript text appeared during recording, then final transcript plus assistant reply arrived after stop through qwen3-asr-flash.

### Next

- Proceed to implementation plan step 21 by improving ASR readability with silence handling, punctuation, and hotword normalization without changing the frontend contract again.
- Keep transcript.partial as a preview-only realtime event and continue using the accepted audio user message as the sole persisted final transcript artifact.

## 2026-03-08 - Step 19 Audio Final Transcript Loop

### Scope

Completed implementation plan step 19 by wiring the finalized browser recording through the gateway, standalone ASR service, and existing realtime dialogue pipeline so audio input now lands in the same chat flow as text input without introducing partial transcript events.

### Outputs

- apps/api-gateway/main.py now exposes POST /api/session/{session_id}/audio/finalize, stores audio_final media, calls services/asr-service, writes one user message with source_kind='audio', and reuses dispatch_message_pipeline for message.accepted plus dialogue.reply.
- apps/web/app.js now submits one finalized recording after stop, waits for the final ASR-backed acknowledgement, updates transcript/timeline cards from audio messages, and keeps step 17 chunk uploads intact.
- scripts/web_audio_final_transcript_harness.js, scripts/verify_web_audio_final_transcript.py, tests/test_api_gateway_audio_finalize.py, and tests/test_web_audio_final_transcript.py now cover mock and live audio-finalize behavior.
- README.md, apps/api-gateway/README.md, apps/web/README.md, and docs/shared_contracts.md now document the audio/finalize contract and the final-transcript boundary for step 19.

### Checks

- Ran node --check apps/web/app.js scripts/web_audio_final_transcript_harness.js scripts/web_audio_chunk_upload_harness.js.
- Ran UV_CACHE_DIR=.uv-cache uv run python -m py_compile apps/api-gateway/main.py scripts/verify_web_audio_final_transcript.py tests/test_api_gateway_audio_finalize.py tests/test_web_audio_final_transcript.py.
- Ran UV_CACHE_DIR=.uv-cache uv run pytest and confirmed 76 tests passed.
- Ran live verification with scripts/verify_web_text_submit.py, scripts/verify_web_mock_reply.py, and scripts/verify_audio_chunk_upload.py against temporary local services.
- Ran live verification with scripts/verify_web_audio_final_transcript.py and confirmed one finalized audio recording produced an audio user message, an audio_final media asset, and one assistant reply through qwen3-asr-flash.

### Next

- Proceed to implementation plan step 20 by adding partial transcript events without changing the final accepted audio message contract.
- Keep POST /api/session/{session_id}/audio/chunk as the temporary media-ingestion boundary and avoid moving ASR work back into chunk uploads.

## 2026-03-08 - Step 18C Transcript Review Workflow

### Scope

Completed implementation plan step 18C by adding a dedicated transcript review CLI for queue export, review start, and review completion, then generating the active review queue and updating the current manual review checklist to use the standardized workflow instead of hand-editing JSONL state.

### Outputs

- scripts/manage_transcript_review.py
- scripts/verify_transcript_review_flow.py
- tests/test_manage_transcript_review.py
- data/derived/transcripts/review_tasks/review_queue_active.md
- data/derived/transcripts/review_tasks/review_batch_003_manual_review.md
- README.md
- docs/03-asr.md
- docs/08-data-ops-eval.md
- docs/data_spec.md
- scripts/generate_review_checklist.py

### Checks

- Ran uv run python -m py_compile scripts/manage_transcript_review.py scripts/verify_transcript_review_flow.py scripts/generate_review_checklist.py scripts/write_asr_drafts.py scripts/build_data_artifacts.py.
- Ran uv run pytest tests/test_manage_transcript_review.py tests/test_write_asr_drafts.py tests/test_asr_service.py tests/test_environment_inventory.py and confirmed 14 tests passed.
- Ran uv run python scripts/verify_transcript_review_flow.py and confirmed one temporary row moved to pending_review while another moved to verified with review_history preserved.
- Generated data/derived/transcripts/review_tasks/review_queue_active.md with 12 active review records and regenerated the active review_batch_003 checklist.
- Ran uv run pytest and confirmed 70 tests passed.

### Next

- Proceed to implementation plan step 19 by wiring verified ASR final text back into the main gateway and frontend flow.
- Keep reviewer state changes on manage_transcript_review.py and avoid manual edits to workflow_status, review_status, or review_history.

## 2026-03-08 - Step 18B Service Batch Write-Back

### Scope

Completed implementation plan step 18B by adding a service-backed ASR batch write-back command, verifying it against a temporary live batch, and then writing a new balanced 4-record batch into the real transcript workflow without touching final_text.

### Outputs

- scripts/write_asr_drafts.py
- scripts/verify_asr_draft_batch.py
- tests/test_write_asr_drafts.py
- data/derived/transcripts/batches/review_batch_003.jsonl
- data/derived/transcripts/batches/review_batch_003_service_results.jsonl
- data/derived/transcripts/review_tasks/review_batch_003_manual_review.md
- data/derived/qc_report.md
- data/derived/transcripts/val_transcripts_template.jsonl
- README.md
- docs/03-asr.md
- docs/08-data-ops-eval.md

### Checks

- Ran uv run python -m py_compile scripts/write_asr_drafts.py scripts/verify_asr_draft_batch.py.
- Ran uv run pytest tests/test_write_asr_drafts.py tests/test_asr_service.py tests/test_environment_inventory.py and confirmed 11 tests passed.
- Ran live verification with scripts/verify_asr_draft_batch.py and confirmed 4 temporary rows transitioned to draft_ready while 1114 untouched rows stayed pending_asr.
- Ran uv run pytest and confirmed 67 tests passed.
- Wrote review_batch_003 into the real transcript workflow and confirmed current counts are draft_ready=12 and pending_asr=1114.

### Next

- Proceed to implementation plan step 18C by defining how reviewers move draft_ready records into pending_review or verified.
- Use review_batch_003_manual_review.md as the first active checklist for manual transcript validation.

## 2026-03-08 - Canonical ASR Environment Variables

### Scope

Removed legacy ASR env alias support from the ASR service, ASR draft import script, and live ASR verifier so the repository now resolves ASR configuration only through ASR_API_KEY, ASR_BASE_URL, and ASR_MODEL.

### Outputs

- scripts/write_asr_drafts.py
- services/asr-service/main.py
- scripts/verify_asr_service.py
- .env.example
- docs/environment.md
- README.md
- tests/test_environment_inventory.py
- tests/test_asr_service.py

### Checks

- Ran uv run python -m py_compile scripts/write_asr_drafts.py services/asr-service/main.py scripts/verify_asr_service.py.
- Ran uv run pytest tests/test_environment_inventory.py tests/test_asr_service.py and confirmed 8 tests passed.
- Ran uv run pytest and confirmed 64 tests passed.
- Ran live ASR verification against qwen3-asr-flash with scripts/verify_asr_service.py and confirmed 3 enterprise samples transcribed successfully.

### Next

- Continue implementation plan step 18B by writing a small new ASR draft batch with the canonical ASR_* variables.
- Keep all future ASR tooling and deployment docs on ASR_API_KEY, ASR_BASE_URL, and ASR_MODEL only.

## 2026-03-08 - step 18 standalone offline asr baseline service

### Scope

Completed implementation_plan step 18 by adding an independent ASR service that accepts one complete audio file, returns one final transcript result, and validates the baseline against three preprocessed enterprise samples without introducing streaming or partial transcript events.

### Outputs

- services/asr-service/main.py and services/asr-service/README.md now provide GET /health and POST /api/asr/transcribe for complete-file transcription using the configured external ASR provider
- scripts/verify_asr_service.py now starts the standalone service, uploads three enterprise validation samples from audio_path_16k_mono, verifies transcript and duration fields, and prints original-vs-derived audio format differences
- tests/test_asr_service.py, docs/03-asr.md, docs/environment.md, docs/shared_contracts.md, README.md, and .env.example now document the offline ASR boundary, runtime variables, and current confidence limitations for qwen3-asr-flash

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_asr_service.py tests/test_environment_inventory.py tests/test_shared_contracts.py
- UV_CACHE_DIR=.uv-cache uv run pytest
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_asr_service.py

### Next

- Proceed to implementation_plan step 18B: use the standalone ASR service baseline to batch-write draft transcripts back into the transcript workflow without touching final_text.

## 2026-03-08 - step 17 audio chunk upload and temporary media indexing

### Scope

Completed implementation_plan step 17 by streaming browser recording chunks to the gateway, storing raw chunk files under the local media root, and persisting temporary audio_chunk rows in media_indexes without invoking ASR.

### Outputs

- apps/web/app.js and apps/web/index.html now upload recorded audio chunks through POST /api/session/{session_id}/audio/chunk, surface upload state in the capture panel, and stop uploading after recording ends
- apps/api-gateway/main.py now accepts raw audio chunk uploads, stores them under MEDIA_STORAGE_ROOT, and returns AudioChunkAcceptedResponse data backed by media_indexes rows
- scripts/web_audio_chunk_upload_harness.js, scripts/verify_audio_chunk_upload.py, tests/test_web_audio_chunk_upload.py, and tests/test_api_gateway_audio_chunk.py now cover browser chunk flow, gateway storage, file existence, and metadata correctness
- scripts/verify_gateway_session_create.py, scripts/verify_web_session_start.py, and scripts/verify_web_realtime_connection.py now use dynamic localhost ports so the live regression suite remains stable when fixed ports are occupied

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_gateway_session_create.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_start.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_realtime_connection.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_text_submit.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_timeline.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_export.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_trace_lineage.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_recording_controls.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_audio_chunk_upload.py

### Next

- Proceed to implementation_plan step 18: add an offline ASR service baseline that accepts a complete audio file and returns one final transcript result.

## 2026-03-08 - step 16 microphone permission and local recording controls

### Scope

Completed implementation_plan step 16 by adding browser-side microphone permission handling, start/stop recording controls, clear allow/deny status messaging, and local recording state tracking without uploading audio.

### Outputs

- apps/web/app.js, apps/web/index.html, and apps/web/styles.css now provide microphone permission, local recording start/stop controls, status pills, and capture-state rendering without any upload behavior
- scripts/web_recording_harness.js and scripts/verify_web_recording_controls.py now validate allow and deny permission flows plus start/stop recording state transitions
- tests/test_web_recording_controls.py, tests/test_web_shell.py, README.md, and apps/web/README.md now cover the new browser-side recording surface and verification command

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_web_shell.py tests/test_web_recording_controls.py tests/test_web_trace_lineage.py tests/test_web_export.py
- UV_CACHE_DIR=.uv-cache uv run pytest
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_gateway_session_create.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_start.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_realtime_connection.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_text_submit.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_timeline.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_export.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_trace_lineage.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_recording_controls.py

### Next

- Proceed to implementation_plan step 17: upload recorded audio in fixed-size chunks to the gateway and persist temporary media chunk indexes without ASR.

## 2026-03-08 - step 15 trace continuity across text flow

### Scope

Completed implementation_plan step 15 by surfacing trace identifiers in the web shell, extending export stage history with trace_id, and adding a live verifier that proves one text turn keeps the same trace across session rows, message rows, realtime envelopes, system events, and exported payloads.

### Outputs

- apps/web/app.js and apps/web/index.html now show the active session trace plus the latest user and reply trace values
- apps/api-gateway/main.py now includes trace_id in exported stage_history entries so export artifacts remain trace-consistent with messages and events
- scripts/web_trace_harness.js and tests/test_web_trace_lineage.py validate frontend trace surfacing in mock mode
- scripts/verify_trace_lineage.py validates trace continuity across websocket events, PostgreSQL rows, and exported session JSON in live mode

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_gateway_session_create.py tests/test_web_shell.py tests/test_web_export.py tests/test_web_trace_lineage.py tests/test_web_mock_reply.py tests/test_web_timeline.py
- UV_CACHE_DIR=.uv-cache uv run pytest
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_gateway_session_create.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_start.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_realtime_connection.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_text_submit.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_timeline.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_export.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_trace_lineage.py

### Next

- Proceed to implementation_plan step 16: start browser-side microphone permission handling and recording controls without uploading audio yet.

## 2026-03-08 - step 14 session json export

### Scope

Completed implementation_plan step 14 by adding a gateway export endpoint, persisting core system events, wiring the frontend Export action, and validating downloadable session JSON end to end.

### Outputs

- apps/api-gateway/main.py now exposes GET /api/session/{session_id}/export and persists session.created, message.accepted, dialogue.reply, and session.error into system_events
- apps/web/app.js now enables Export after session bootstrap, fetches the session export payload, caches it for test inspection, and downloads JSON when browser APIs are available
- scripts/web_export_harness.js and scripts/verify_web_export.py validate export payload content, stage history, and database event persistence
- README.md, apps/web/README.md, and apps/api-gateway/README.md now document the export flow and verification command

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_gateway_session_create.py tests/test_web_shell.py tests/test_web_export.py tests/test_web_mock_reply.py tests/test_web_timeline.py
- UV_CACHE_DIR=.uv-cache uv run pytest
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_gateway_session_create.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_start.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_realtime_connection.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_text_submit.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_timeline.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_export.py

### Next

- Proceed to implementation_plan step 15: ensure every message and event in the text path has a stable trace identifier that can be correlated across database rows, realtime envelopes, and exported session payloads.

## 2026-03-08 - step 13 recoverable chat timeline

### Scope

Completed implementation_plan step 13 by adding gateway session state retrieval, frontend chat timeline rendering, stage transition entries, and browser-side history restore after refresh.

### Outputs

- apps/api-gateway/main.py now exposes GET /api/session/{session_id}/state with ordered message history
- apps/web/app.js rebuilds timeline entries from realtime events and restored message history
- scripts/web_timeline_harness.js and scripts/verify_web_timeline.py validate three-turn ordering and refresh recovery
- README.md, apps/web/README.md, and apps/api-gateway/README.md document the timeline restore flow

### Checks

- UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_gateway_session_create.py tests/test_orchestrator_mock_reply.py tests/test_web_shell.py tests/test_web_session_start.py tests/test_web_realtime_connection.py tests/test_web_text_submit.py tests/test_web_mock_reply.py tests/test_web_timeline.py
- UV_CACHE_DIR=.uv-cache uv run pytest
- UV_CACHE_DIR=.uv-cache uv run python scripts/verify_gateway_session_create.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_session_start.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_realtime_connection.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_text_submit.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_mock_reply.py && UV_CACHE_DIR=.uv-cache uv run python scripts/verify_web_timeline.py

### Next

- Proceed to implementation_plan step 14: export the current text session as JSON with session metadata, messages, stage changes, and base events.

## 2026-03-08 - Step 12 Mock Orchestrator Reply Loop

### Scope

Completed implementation plan step 12 by introducing a dedicated mock orchestrator service, calling it from the gateway after user text acceptance, persisting the assistant reply, and delivering a validated dialogue.reply event back to the frontend.

### Outputs

- Added apps/orchestrator/main.py and apps/orchestrator/README.md with GET /health and POST /internal/dialogue/respond returning schema-validated mock dialogue output.
- Extended apps/api-gateway/main.py so POST /api/session/{session_id}/text now bridges to the orchestrator, persists the assistant reply into PostgreSQL, and queues dialogue.reply or session.error over the existing session websocket.
- Updated apps/web/app.js and apps/web/index.html so the frontend consumes dialogue.reply, updates latest reply placeholders, fusion summary, and stage transition text, and rejects invalid reply payloads.
- Added dedicated verification assets for step 12: scripts/web_mock_reply_harness.js, scripts/verify_web_mock_reply.py, tests/test_orchestrator_mock_reply.py, and tests/test_web_mock_reply.py.

### Checks

- Verified Node syntax checks pass for apps/web/app.js and all browser harness scripts.
- Verified py_compile passes for apps/api-gateway/main.py, apps/orchestrator/main.py, scripts/verify_web_text_submit.py, and scripts/verify_web_mock_reply.py.
- Verified targeted step 12 regression tests pass across environment inventory, gateway, orchestrator, and web harness coverage.
- Verified live gateway session creation, session bootstrap, realtime reconnect, text submit, and mock dialogue reply flows against local PostgreSQL-backed services.

### Next

- Implement step 13: render user message, assistant reply, and stage updates as a recoverable chat timeline instead of only latest-value placeholders.
- Keep dialogue.reply field names and stage enum stable so the later real dialogue service can replace the mock orchestrator without a frontend contract rewrite.

## 2026-03-08 - Step 11 Text Submission Gateway Flow

### Scope

Completed implementation plan step 11 by letting the web shell submit plain text to the gateway, persist the accepted user message in PostgreSQL, and wait for a realtime message.accepted acknowledgement before marking the send as successful.

### Outputs

- Added POST /api/session/{session_id}/text in apps/api-gateway/main.py and persisted accepted user text messages into the messages table while promoting the parent session to active.
- Extended apps/web/app.js, apps/web/index.html, and apps/web/styles.css so Send Text is enabled only after session bootstrap plus a connected realtime channel, and the page now shows submit status, last accepted message id, and last accepted timestamp.
- Added text-submit harness and live verifier assets: scripts/web_text_submit_harness.js, scripts/verify_web_text_submit.py, and tests/test_web_text_submit.py.
- Added a regression guard so message.accepted envelopes are JSON-serializable before they are queued to the realtime transport.

### Checks

- Verified Node syntax checks pass for the frontend shell and all browser harness scripts.
- Verified py_compile passes for apps/api-gateway/main.py and scripts/verify_web_text_submit.py.
- Verified 34 automated tests pass with UV_CACHE_DIR=.uv-cache uv run pytest.
- Verified live gateway session creation, web session bootstrap, websocket reconnect, and text submission flows against local PostgreSQL-backed services.

### Next

- Implement step 12: record assistant placeholder events so the timeline can show a deterministic system response stub after the first accepted user text.
- Keep the realtime message.accepted contract stable so later orchestrator and assistant reply events can layer onto the same session channel without changing the frontend transport state machine.

## 2026-03-08 - Step 10 Session Realtime Connection

### Scope

Implemented the first session-level realtime channel so the web shell can open a WebSocket after session bootstrap, send heartbeat pings, detect unexpected disconnects, and reconnect automatically without introducing business messages.

### Outputs

- Added /ws/session/{session_id} in apps/api-gateway/main.py with session.connection.ready, session.heartbeat, and session.error envelopes.
- Extended apps/web/app.js and apps/web/index.html to show realtime status, last heartbeat, and connection logs, and to reconnect after an unexpected socket close.
- Added runtime and mock verification assets: scripts/web_realtime_harness.js and scripts/verify_web_realtime_connection.py.
- Installed the websockets dependency through uv so uvicorn can actually accept WebSocket upgrades.

### Checks

- Verified 28 automated tests pass, including mock realtime connection and forced reconnect coverage.
- Verified live gateway session creation, frontend session bootstrap, and realtime reconnect flow against the running local services.

### Next

- Implement step 11: accept a text message from the web shell, write it into the database, and acknowledge it over the existing session channel.
- Keep the websocket envelope stable so message.accepted can be added on top of the same connection without another frontend transport rewrite.

## 2026-03-07 - Step 9 Frontend Session Start

### Scope

Connected the web shell start button to the live gateway session-create endpoint so the page now displays the active session id, status, stage, trace id, and last update timestamp.

### Outputs

- Updated apps/web/index.html, styles.css, and app.js so Start Session creates a new backend session and refresh-safe state starts empty on every page load.
- Added browser-side verification harness scripts/web_session_start_harness.js and live verifier scripts/verify_web_session_start.py.
- Enabled gateway CORS configuration for local frontend preview and documented the new runtime variables in .env.example and docs/environment.md.

### Checks

- Verified mock success and mock failure browser flows through the Node harness.
- Verified 24 automated tests pass, including refresh isolation and frontend failure handling.
- Verified live Docker-backed flow where two frontend session starts create two distinct PostgreSQL session rows.

### Next

- Implement step 10: establish a session-level realtime connection between the web shell and gateway without business messages.
- Keep the session bootstrap contract stable so the upcoming websocket layer can reuse session_id and trace_id without schema changes.

## 2026-03-07 - Step 8 Session Creation Gateway

### Scope

Implemented the first live backend endpoint in api-gateway so the project can create and persist a session before any transcript or dialogue logic is added.

### Outputs

- Added FastAPI app entry at apps/api-gateway/main.py with /health and /api/session/create.
- Persisted sessions into PostgreSQL with generated session_id and trace_id using the baseline schema.
- Added runtime verifier scripts/verify_gateway_session_create.py and contract tests in tests/test_api_gateway_session_create.py.

### Checks

- Verified compose stack, database schema, and live session creation against PostgreSQL.
- Confirmed pytest coverage for contract shape, validation failure, and documentation presence.

### Next

- Implement step 9: add a start-session action in the frontend shell that calls the gateway create-session endpoint.
- Keep the gateway contract stable so orchestrator and logging modules can reuse the session identifiers.

## 2026-03-07 - Static Frontend Shell

### Scope

Completed implementation plan step 7 by building a single-page frontend console shell with six static panels for capture, avatar, transcript, emotion, chat timeline, and session control, without wiring any live APIs yet.

### Outputs

- apps/web/index.html
- apps/web/styles.css
- apps/web/app.js
- apps/web/favicon.svg
- apps/web/README.md
- tests/test_web_shell.py

### Checks

- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py tests/test_shared_contracts.py tests/test_infra_compose.py tests/test_db_schema_assets.py tests/test_demo_assets.py tests/test_web_shell.py and confirmed 18 tests passed.
- Validated the static shell serves a reachable index page with all six panel headings present.
- Validated favicon.svg is reachable so preview mode does not emit an unnecessary favicon 404.

### Next

- Implementation plan step 8: add the session-creation API in the gateway and persist a session row to PostgreSQL.
- Keep frontend work static until the session API is available, then wire only the start-session control first.

## 2026-03-07 - Reusable Demo Assets

### Scope

Completed implementation plan step 6 by adding a lightweight demo asset directory for text-first session replay, audio metadata mocks, video-frame mock payloads, and sample session export output.

### Outputs

- data/demo/README.md
- data/demo/text_session_script.json
- data/demo/audio_sample.md
- data/demo/video_frame_sample.md
- data/demo/session_export_sample.json
- tests/test_demo_assets.py

### Checks

- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py tests/test_shared_contracts.py tests/test_infra_compose.py tests/test_db_schema_assets.py tests/test_demo_assets.py and confirmed 15 tests passed.
- Verified demo JSON assets are parseable and README points to the demo asset directory.
- Confirmed the demo directory now covers text script, audio description, video-frame description, and export sample.

### Next

- Implementation plan step 7: build the frontend single-page layout with six static panels.
- Keep mock flows anchored to data/demo assets instead of ad hoc inline fixtures.

## 2026-03-07 - Baseline PostgreSQL Schema

### Scope

Completed implementation plan step 5 by defining the initial PostgreSQL schema for sessions, messages, system events, evaluation records, and media indexes, wiring the SQL init file into the compose stack, and verifying inserts plus foreign-key linkage against the running database.

### Outputs

- infra/docker/postgres/init/001_base_schema.sql
- docs/database_schema.md
- scripts/verify_db_schema.py
- tests/test_db_schema_assets.py
- infra/compose/docker-compose.yml

### Checks

- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py tests/test_shared_contracts.py tests/test_infra_compose.py tests/test_db_schema_assets.py and confirmed 12 tests passed.
- Ran uv run python scripts/verify_infra_stack.py --compose-file infra/compose/docker-compose.yml and verified health=healthy, persistence=verified.
- Ran uv run python scripts/verify_db_schema.py --compose-file infra/compose/docker-compose.yml and verified inserts across sessions, messages, system_events, evaluation_records, and media_indexes.

### Next

- Implementation plan step 6: prepare reusable demo data assets for text, audio, video-frame, and export flows.
- Keep later gateway and orchestrator code aligned with the verified table names and shared contract identifiers.

## 2026-03-07 - Foundation Compose Stack And Infra Verifier

### Scope

Completed implementation plan step 4 by adding the baseline Docker Compose stack for PostgreSQL, Redis, and MinIO, documenting how to run it, and verifying health plus persistence through an automated checker.

### Outputs

- infra/compose/docker-compose.yml
- infra/compose/README.md
- scripts/verify_infra_stack.py
- tests/test_infra_compose.py
- docs/environment.md
- .env.example

### Checks

- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py tests/test_shared_contracts.py tests/test_infra_compose.py and confirmed 10 tests passed.
- Ran uv run python scripts/verify_infra_stack.py --compose-file infra/compose/docker-compose.yml and verified health=healthy, persistence=verified.
- Confirmed the stack uses named volumes and health checks for PostgreSQL, Redis, and MinIO.

### Next

- Implementation plan step 5: define the initial PostgreSQL schema for sessions, messages, system events, eval records, and media indexes.
- Keep service runtime code aligned with the foundation compose stack and the documented environment inventory.

## 2026-03-07 - Shared Contracts And Schema Index

### Scope

Completed implementation plan step 3 by defining the cross-service contract catalog for sessions, realtime events, text input, transcripts, dialogue output, avatar commands, and error responses, and by adding tests to prevent field-name drift.

### Outputs

- docs/shared_contracts.md
- libs/shared-schema/README.md
- tests/test_shared_contracts.py
- README.md
- libs/README.md

### Checks

- Verified the contract document covers session, event envelope, transcript, dialogue, avatar, and error payloads.
- Verified snake_case naming and rejected camelCase aliases in automated tests.
- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py tests/test_shared_contracts.py and confirmed 8 tests passed.

### Next

- Implementation plan step 4: start PostgreSQL, Redis, and MinIO with health checks and persistent volumes.
- Keep future service code aligned with docs/shared_contracts.md before generating machine-readable schemas.

## 2026-03-07 - Environment Inventory And Config Sample

### Scope

Completed implementation plan step 2 by defining the canonical runtime configuration inventory, adding a sample env file, and enforcing consistency with automated tests.

### Outputs

- docs/environment.md
- .env.example
- tests/test_environment_inventory.py
- README.md
- memory-bank/README.md

### Checks

- Verified required variables for gateway, orchestrator, PostgreSQL, Redis, MinIO, LLM, ASR, TTS, and avatar driver are present in both docs and .env.example.
- Ran uv run python -m py_compile for repository scripts.
- Ran uv run pytest tests/test_memory_bank.py tests/test_environment_inventory.py and confirmed 5 tests passed.

### Next

- Implementation plan step 3: define shared contracts and schema skeletons.
- Keep using scripts/update_memory_bank.py before each tested commit.

## 2026-03-07 - ASR Batch, Review Tasks, And Repo Skeleton

### Scope

- Completed enterprise validation data preparation and transcript workflow baseline.
- Implemented implementation plan `18A` and `18B` supporting scripts.
- Verified DashScope `qwen3-asr-flash` on real samples.
- Generated first manual review task list.
- Completed implementation plan step `1` by creating the monorepo directory skeleton.

### Outputs

- `scripts/build_data_artifacts.py`
- `scripts/prepare_asr_audio.py`
- `scripts/write_asr_drafts.py`
- `scripts/generate_review_checklist.py`
- `data/manifests/val_manifest.jsonl`
- `data/derived/audio_16k_mono/`
- `data/derived/transcripts/val_transcripts_template.jsonl`
- `data/derived/transcripts/batches/review_batch_001.jsonl`
- `data/derived/transcripts/batches/review_batch_001_qwen3-asr-flash_results.jsonl`
- `data/derived/transcripts/review_tasks/review_batch_001_manual_review.md`
- `data/derived/qc_report.md`
- `README.md`
- `apps/`
- `services/`
- `libs/`
- `infra/`
- `tests/`

### Checks

- Generated `16kHz mono` audio for all `1126` manifest records.
- Confirmed `audio_path_16k_mono` is populated in manifest and transcript workflow.
- Wrote `8` real ASR drafts with `qwen3-asr-flash`.
- Confirmed transcript workflow status moved to:
  - `draft_ready = 8`
  - `pending_asr = 1118`
- Regenerated `qc_report.md` after draft write-back.
- Verified Python scripts with `uv run python -m py_compile`.

### Next

- Run manual review for `review_batch_001`.
- Execute implementation plan step `2`: environment variable inventory and `.env.example`.
- Execute implementation plan step `3`: shared contracts and schema definitions.
<!-- progress:entries:end -->
