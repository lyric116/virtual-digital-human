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
