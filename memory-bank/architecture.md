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

## 2026-03-10 - Replay Uses Exported Event Stream As The Single Source Of Truth

- Step 48 builds replay directly on top of exported session JSON. When events are present, the web shell replays them in order and never calls live services; when events are missing, it synthesizes a minimal replay sequence from exported messages.
- Replay stays a frontend concern: no new replay backend endpoint was introduced, and the browser-side export cache is now the handoff point between live sessions and offline demo playback.
- The replay sample under data/demo/session_replay_export.json is now the deterministic contract fixture for transcript, affect, retrieval, dialogue, TTS, and avatar state reconstruction.

## 2026-03-10 - Unified Event Stream For Full-Chain Traceability

- Step 47 keeps logging inside the existing system_events table instead of adding parallel retrieval or TTS log tables; transcript, affect, retrieval, dialogue, TTS, and avatar runtime events now share one envelope and one export path.
- Dialogue responses now echo retrieval_context so gateway can persist knowledge.retrieved separately from dialogue.reply; this keeps retrieval evidence auditable even if the final reply text is later shortened, rewritten, or repaired by fallback logic.
- Frontend runtime telemetry is best-effort only: apps/web posts tts/avatar events through a guarded runtime-event endpoint, but failures in that callback path must never block reply rendering, audio playback, or avatar state changes.

## 2026-03-10 - High-Risk Retrieval Guardrail

- rag-service now treats risk_level=high as a hard retrieval boundary: it filters to handoff_support and future safety_support categories before scoring, and it bypasses ordinary current_stage filtering so urgent safety cards are not excluded by assess/intervene metadata.
- The retrieval contract now relies on filters_applied as an auditable safety trace; high-risk guarded queries must emit risk_guardrail:high_only_safe_categories and stage:bypassed_for_high_risk_guardrail so downstream services and reviewers can distinguish protected retrieval from normal stage-based retrieval.

## 2026-03-10 - RAG grounding now spans orchestrator and dialogue

- Step 45 keeps the source-of-truth split intact: apps/orchestrator owns the call to services/rag-service and passes compact knowledge_cards into metadata, while services/dialogue-service consumes only that injected context and never reads data/kb/knowledge_cards.jsonl directly.
- Dialogue grounding is now server-enforced rather than prompt-only: if the model omits or invents knowledge_refs, services/dialogue-service injects the top retrieved source_id and appends one matching suggestion or follow-up so the final reply remains traceable to the retrieved card set.
- The curated card corpus now carries real low-versus-medium differentiation for sleep and breathing support, which makes risk-hinted retrieval verifiable before step 46 adds the stricter high-risk handoff-only guardrail.

## 2026-03-10 - RAG service now owns the first retrieval boundary

- Step 44 establishes services/rag-service/main.py as the first executable retrieval boundary: it loads data/kb/knowledge_cards.jsonl at startup, builds an in-memory sparse vector index, and exposes internal retrieval results without coupling retrieval to dialogue generation yet.
- The current retrieval contract already carries source_id, recommended_phrases, followup_questions, and contraindications, so step 45 should inject these fields into dialogue-service instead of re-reading the raw JSONL file directly from the dialogue layer.
- High-risk protection is currently enforced twice: structurally in the card dataset, where high-risk cards live only in handoff_support, and operationally in rag-service, where stage and risk metadata filtering shapes the candidate set before similarity scoring.

## 2026-03-10 - RAG now begins from a curated card corpus

- Step 43 establishes data/kb/knowledge_cards.jsonl as the first stable RAG asset: later retrieval work should index this curated card corpus instead of scraping enterprise validation transcripts or MAGICDATA public ASR references.
- High-risk knowledge remains structurally separated from ordinary support cards because verify_knowledge_cards.py enforces that cards carrying risk_level=high stay inside the handoff_support category.
- services/rag-service is still dataset-only at this point, so later steps must preserve the current separation of concerns: card authoring and validation live in data/kb plus scripts/verify_knowledge_cards.py, while indexing and retrieval should be added without mutating the curated source file format.

## 2026-03-10 - Affect conflict is now part of the dialogue control plane

- Step 42 makes affect-service output operational instead of display-only: the gateway now requests affect snapshots for normal turns, persists affect.snapshot events, and forwards metadata.affect_snapshot to dialogue-service. dialogue-service now short-circuits multimodal conflict into clarification-first replies, so future dialogue, RAG, and safety work must preserve affect_conflict evidence fields and avoid bypassing this control path.

## 2026-03-10 - Fusion is now the first multimodal decision layer

- Step 41 makes services/affect-service more than three independent lanes: fusion_result is now the first place where text, audio, and video evidence are reconciled into stable multimodal states such as needs_clarification or multimodal_consistent_low_risk. Conflict handling now depends on whether audio/video evidence is truly active, so face_not_detected_proxy must not count as real visual evidence while manifest-aligned transcript, audio_path_16k_mono, and face3d_path inputs can be used together for deterministic offline fusion regression.

## 2026-03-10 - Affect Video Baseline

- Affect-service video analysis now has a split path: offline synthetic frames and enterprise face3d inputs can produce stable_gaze_proxy or face_not_detected_proxy, while the live browser path still uses camera-state placeholders.
- The project still does not depend on a heavy video decoder or real face detector in the online loop; step 40 deliberately fixes the contract and offline verification path first.
- Fusion can now distinguish between a real no-face result and a generic camera-live placeholder because face_not_detected_proxy no longer counts as active video evidence.

## 2026-03-10 - Affect Audio Baseline

- Affect-service audio analysis now has a two-tier path: real local audio files go through deterministic feature extraction, while live browser capture without a bound file stays on a non-blocking placeholder path.
- The current audio baseline uses mean_rms, pause_ratio, and segment_rate to derive energy_band and tempo_band, which then map to stable coarse labels for the Emotion Panel.
- Enterprise validation audio is now part of affect verification through traced sample paths, but the online frontend path still avoids direct coupling to enterprise media files.

## 2026-03-10 - Affect Text Labels

- The affect-service text lane is now the first lane with meaningful semantics: it emits deterministic distressed/anxious/low_mood/guarded/neutral labels while audio/video remain proxy lanes.
- Enterprise transcript workflow is now part of affect verification, using a longer NoXI utterance as neutral and a short acknowledgement-only NoXI utterance as guarded.
- The outer affect snapshot contract did not change, so later steps can replace lane internals without changing Emotion Panel bindings or gateway integration.

## 2026-03-10 - Affect Snapshot Contract Is Now The Multimodal Mount Point

- services/affect-service is now the stable step-37 boundary for text/audio/video/fusion placeholder output, so steps 38-41 should replace lane internals without changing the outer response shape or the frontend panel ids.
- apps/web/app.js now treats affect refreshes as best-effort side calls: the dialogue, ASR, camera, and TTS main chains continue even when affect-service is unavailable or returns invalid data.
- Affect sample source display uses source_context.origin, dataset, record_id, and note, which reserves a direct path for enterprise manifest binding without redesigning the Emotion Panel later.

## 2026-03-10 - media ingestion requires explicit parameter validation

- Session bootstrap from the web shell must now advertise [text, audio, video] so exported session metadata matches the actual capture capabilities. Gateway media helpers must reject invalid sequence numbers, dimensions, and negative durations at the boundary with stable 400 responses; otherwise bad browser input can leak into media_indexes or trigger late response-model failures.

## 2026-03-10 - step 36 isolates video ingestion from inference

- The browser video path now ends at POST /api/session/{session_id}/video/frame and media_indexes rows with media_kind=video_frame. This route stores low-frequency snapshots only and must stay isolated from dialogue, ASR, and affect inference until later steps deliberately consume video_frame assets.

## 2026-03-10 - avatar-driver-service is now an offline validation boundary

- Step 35A keeps enterprise 3D_FV_files out of the live avatar path: services/avatar-driver-service reads face3d_path plus optional emotion_path, normalizes 3D tensors, and emits sampled driver frames only for offline validation and reporting.
- The offline avatar-driver response now makes frame_count, feature_dim, emotion_row_count, alignment_status, and mismatch_steps explicit, so later avatar evaluation can reason about 751-vs-750 timing mismatches without re-reading raw files everywhere.
- The generated report under data/derived/avatar_driver/ is now the stable artifact that proves enterprise 3D features are wired into the repository as an executable evaluation path rather than just stored data.

## 2026-03-10 - dialogue now targets gpt-5.2 and tts has a local fallback boundary

- Dialogue and summary generation now target gpt-5.2 through the LLM_* contract, and the real verifier set must continue to run serially because this shared provider has much higher latency than the earlier baseline.
- services/tts-service is no longer a pure remote edge_tts wrapper: it now owns a second provider_used mode called wave_fallback, so downstream playback and regression tooling must trust the returned audio_format instead of assuming mp3.
- Live verifier scripts that boot local uvicorn services must treat cleanup as best-effort; otherwise successful behavioral checks can still report failure because child process shutdown takes longer than the verifier timeout.

## 2026-03-10 - Stage semantics now reach the avatar layer

- Step 35 keeps the avatar layer rule-based: apps/web now resolves stage, emotion, and risk_level into a small fixed preset set instead of trying to infer continuous expressions from raw text or audio.
- guarded_handoff is now the hard visual safety state for both high-risk replies and explicit handoff stage responses, so the avatar layer cannot accidentally render an upbeat style when the business state is serious.
- The new expression preset output remains purely frontend-owned and testable through the web_tts_playback_harness, which keeps stage-driven expression regression checks independent from upstream LLM availability.

## 2026-03-09 - Dual avatar selection stays frontend-owned in V1

- Step 34 keeps avatar switching inside apps/web: the frontend now owns the active avatar registry, selected avatar state, and the mapping from selected avatar to the session bootstrap avatar_id and TTS voice_id.
- The current effective speaking avatar remains session-scoped, while a newly selected avatar is staged for the next session; this avoids silently changing the persisted backend session avatar_id mid-session.
- services/tts-service already had provider-agnostic voice aliases, so adding the second avatar only required using coach_male_01 in the frontend and verification tooling rather than changing the service contract.

## 2026-03-09 - Baseline mouth cues stay frontend-owned

- Step 33 keeps mouth motion as a frontend concern: apps/web derives a coarse cue sequence from reply text and TTS duration, then advances mouth states locally during playback instead of introducing a separate viseme service too early.
- The current mouth baseline is deliberately deterministic and low-cost; it is acceptable for it to be approximate as long as playback shows repeated mouth changes and always returns to closed after silence.

## 2026-03-09 - Static avatar baseline state mapping

- Step 32 keeps the avatar layer intentionally thin: apps/web owns the first visual avatar state machine, and it currently derives idle versus speaking directly from frontend TTS playback rather than from any separate avatar-driver service.
- The repository now treats the single-avatar static stage as the minimum digital-human baseline; the second avatar, mouth motion, and stage-driven expressions remain separate later steps and should not be backfilled into this baseline implicitly.

## 2026-03-09 - Frontend TTS playback boundary

- The browser now calls services/tts-service directly after dialogue.reply, so TTS_CORS_ORIGINS and WEB_PUBLIC_TTS_BASE_URL are part of the stable local preview contract.
- Avatar playback is intentionally non-blocking: subtitle text updates from dialogue.reply immediately, while TTS synthesis or playback failure only downgrades speech state and must not break the text dialogue chain.

## 2026-03-09 - tts-service now owns speech asset generation

- services/tts-service is now the single boundary that turns assistant text into a playable speech asset, stores it under TTS_STORAGE_ROOT, and returns audio_url plus duration metadata without involving avatar logic yet.
- The current step-30 baseline uses edge-tts with one Chinese voice and actual mp3 output even if older config still mentions wav, so downstream playback should trust the returned audio_format field rather than assuming wav.
- Voice aliases such as companion_female_01 are now provider-agnostic frontend/backend identifiers that are resolved inside tts-service to concrete engine voices, which keeps later multi-avatar work from hardcoding edge-tts voice ids in UI code.

## 2026-03-09 - dialogue-service now owns main-chain fallback

- When the upstream LLM path times out, returns empty content, or produces invalid JSON/fields, services/dialogue-service/respond must return a contract-valid fallback reply instead of surfacing a transport error to gateway and frontend.
- The fallback path is observable through safety_flags using dialogue_fallback_response plus dialogue_fallback_reason:*, which lets replay, export, and future evaluation distinguish real model output from degraded-safe replies without breaking the shared dialogue contract.
- DIALOGUE_FORCE_FAILURE_MODE is now a verifier-only switch used to simulate timeout or malformed-output cases in live integration tests; it should remain unset in normal runtime.

## 2026-03-09 - gateway now owns pre-llm high-risk short-circuit

- Obvious self-harm or suicide language is now intercepted in apps/api-gateway before any orchestrator or dialogue-service call; the gateway itself generates a fixed handoff reply, forces risk_level=high and stage=handoff, and records high_risk_rule_precheck in safety_flags.
- message.accepted is now emitted to realtime clients before the slower dialogue follow-up path runs, so frontend send confirmation is no longer blocked on real LLM latency.
- scripts/web_mock_reply_harness.js now supports configurable connect, sent, and reply timeouts so live verifiers can tolerate real gpt-5.4 latency without weakening fast mock-mode tests.

## 2026-03-09 - handoff summary is now the first resume surface

- memory-bank/handoff-summary.md is now the canonical first-read file when resuming work in a new chat; it summarizes goal, model policy, completed steps, current stable commit, and next planned step before a developer drills into progress.md or architecture.md.
- memory-bank/handoff-summary.json provides the same repository snapshot in machine-readable form so future automation or agents can recover the current state without scraping long markdown logs.

## 2026-03-09 - Gateway pipeline and live verifiers after real dialogue-service

- Gateway HTTP handlers must return quickly and move DB plus upstream network work into background thread execution; otherwise websocket heartbeats and concurrent UI flows are vulnerable to event-loop stalls.
- Any live verifier that boots orchestrator for dialogue-bearing flows must also boot dialogue-service and wire DIALOGUE_SERVICE_BASE_URL, because orchestrator is no longer a self-contained mock reply provider.

## 2026-03-09 - dialogue llm switched to gpt-5.4

- The dialogue path is now explicitly separated from ASR model configuration: ASR stays on ASR_* and qwen3-asr-flash, while dialogue and summary generation must only use LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL with gpt-5.4 as the current baseline.
- When the configured LLM endpoint is a shared local OpenAI-compatible proxy, live verifiers for reply generation, short-term memory, and dialogue summary must be run serially; parallel execution can create false negatives even when the single-chain path is healthy.

## 2026-03-09 - step 27 dialogue summary layer

- The dialogue stack now has two bounded context layers: metadata.short_term_memory carries the last few raw turns, while sessions.metadata.dialogue_summary carries one persisted compressed summary every three user turns for longer-session continuity.
- The gateway owns summary persistence and eventing, not summary generation: it requests summaries through orchestrator, stores them in sessions.metadata.dialogue_summary, and records dialogue.summary.updated in system_events so reconnect and export both see the same summary snapshot.

## 2026-03-09 - dialogue verifier scripts require database preflight

- Live verifier scripts that exercise the gateway text path now perform an explicit PostgreSQL readiness check before starting local services, so missing Docker foundation services fail with a direct infrastructure error instead of secondary websocket or session-create symptoms.
- The gateway stage machine now owns both the final stage and the final next_action whenever it clamps model output, which keeps persisted assistant metadata and dialogue.reply events internally consistent.

## 2026-03-09 - short-term memory is gateway-computed context

- After step 26, short-term dialogue memory is computed from the persisted messages table inside apps/api-gateway and forwarded as metadata.short_term_memory; dialogue-service does not query storage directly.
- The current memory layer is intentionally capped to the most recent few turns and is designed for factual continuity only; summary compression remains a separate later step.

## 2026-03-09 - gateway owns final stage progression

- After step 25, services/dialogue-service may propose any legal stage, but apps/api-gateway is the only component allowed to finalize session stage progression and persist stage-machine metadata such as stage_before, model_stage, and stage_machine_reason.
- Stage history and exported dialogue events now reflect the resolved stage rather than the raw model proposal, which keeps frontend replay and offline analysis aligned with the enforced conversation flow.

## 2026-03-09 - dialogue service owns real llm contract boundary

- The real LLM now only produces semantic dialogue fields inside services/dialogue-service, while session_id, trace_id, and message_id remain server-owned to prevent identifier drift across orchestrator, gateway, and exports.
- Live web verifiers that exercise assistant replies must start dialogue-service explicitly after step 24 because orchestrator no longer has any local reply generation path.

## 2026-03-09 - Dialogue Payload Construction Now Belongs To dialogue-service

- services/dialogue-service is now the only approved place to construct and validate dialogue reply payloads; apps/orchestrator should proxy to it and reject malformed replies rather than generating reply JSON locally.
- POST /internal/dialogue/validate is now the explicit schema gate for dialogue payloads, which gives step 24 and later LLM work a direct place to prove contract safety before replies hit gateway or frontend code.
- DIALOGUE_SERVICE_BASE_URL is now part of the core internal topology: gateway calls orchestrator, orchestrator calls dialogue-service, and later dialogue model changes should stay behind that boundary.

## 2026-03-09 - External ASR Regression Must Use Thresholds, Not Exact Output Matching

- The expanded MAGICDATA frozen core subset is now 36 records by default, selected as 12 records from each available split plus speaker_gender group, which gives a broader Chinese baseline without paying the cost of scoring the full public corpus.
- scripts/verify_asr_regression.py is now the stable ASR regression entrypoint and should replace ad hoc manual sequencing whenever ASR postprocess, provider settings, or baseline scripts change.
- Because qwen3-asr-flash is an external provider path, repeated runs on the same frozen subset can drift slightly in WER and SER; regression gates must therefore enforce thresholds rather than exact metric equality.

## 2026-03-09 - MAGICDATA Public Chinese ASR Eval Stays Outside The Enterprise Workflow

- scripts/prepare_magicdata_eval.py now defines a second ASR evaluation lane: MAGICDATA official references are imported into data/derived/transcripts-local/, not into val_transcripts_template.jsonl, so public Chinese WER baselines and enterprise transcript review remain isolated.
- The frozen MAGICDATA core subset is the only public-Chinese file allowed to carry locked_for_eval=true; the full imported catalog remains unlocked to prevent accidental high-cost API evaluation over the entire corpus.
- Because MAGICDATA licensing is local-only in this repository context, raw archives, extracted audio, transcript catalogs, and report outputs under data/external/, data/derived/transcripts-local/, and data/derived/eval-local/ must stay gitignored while scripts, tests, and docs remain versioned.

## 2026-03-08 - Formal ASR Evaluation Is Now Gated By Locked Human References

- scripts/eval_asr_baseline.py is now the only approved ASR WER/SER entrypoint in the repository; it is read-only and will only score rows that are simultaneously verified, locked_for_eval=true, and text_status=human_verified.
- data/derived/eval/asr_baseline_report.md and asr_baseline_details.json now represent repository-level evaluation readiness: they may legitimately be blocked when no locked subset exists, and that blocked state is preferable to silently scoring machine drafts as gold references.
- Step 22 and step 22A are now intentionally separated: evaluation tooling can ship before a formal reference subset exists, but the first real baseline metric run cannot happen until transcript review explicitly locks approved samples for evaluation.

## 2026-03-08 - Qwen3 ASR Now Uses DashScope Native Transport

- services/asr-service now treats https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation as the canonical qwen3-asr-flash endpoint; old compatible-mode routing is retained only as a fallback and should no longer be the default in docs or env templates.
- The ASR postprocess layer is now part of the service boundary, not a downstream cleanup step: silence detection, punctuation restoration, and hotword normalization must happen before transcript_text leaves services/asr-service so gateway, review, and dialogue modules all consume the same normalized text.
- services/asr-service/hotwords.json is now a stable repository asset and the approved place for deterministic ASR term normalization; new domain phrase rewrites should be added there instead of scattering replacements through gateway or frontend code.

## 2026-03-08 - Partial Transcript Is Now A Preview-Only Realtime Layer

- POST /api/session/{session_id}/audio/preview is now the only live path allowed to produce transcript.partial; it is intentionally non-persistent, while POST /api/session/{session_id}/audio/finalize remains the only path that can create a user message and advance the dialogue turn.
- ConnectionRegistry now tries to push business events to active websocket clients immediately instead of waiting for the next heartbeat flush, which is required for usable partial transcript latency and now affects all realtime event types.
- The frontend treats preview and final transcript as two separate layers: partial transcript text is tied to one recording_id and preview_seq for staleness control, while the persisted final audio message still replaces the partial view and drives the assistant reply pipeline.

## 2026-03-08 - Audio Finalize Reuses The Existing Turn Pipeline

- POST /api/session/{session_id}/audio/finalize is now the only live boundary between browser recording and ASR: chunk uploads remain temporary media ingestion, while only the finalized recording is allowed to create a user message and trigger dialogue orchestration.
- The gateway no longer needs a separate audio-specific reply path; once ASR returns a final transcript, dispatch_message_pipeline treats the accepted audio turn exactly like text, which keeps realtime events, persistence, export, and trace behavior aligned across input modalities.
- scripts/web_audio_final_transcript_harness.js is now the runtime gate for this boundary because it proves one fake recording can still accumulate chunk uploads, then transition into a finalized transcript and assistant reply without requiring a real browser or microphone.

## 2026-03-08 - Transcript Review Now Has A Single Control Surface

- scripts/manage_transcript_review.py is now the only approved write path for human transcript review state: queue-report exposes the active worklist, start-review moves a draft into pending_review, and complete-review is the gate that can produce verified human_verified text.
- review_queue_active.md is now the operational queue artifact for reviewers, while per-batch checklist files such as review_batch_003_manual_review.md are task-focused drill-down documents; future review tooling should update the queue and checklist pair together instead of relying on ad hoc spreadsheets or direct JSONL edits.

## 2026-03-08 - ASR Drafts Now Flow Through The Standalone Service

- scripts/write_asr_drafts.py now has a transcribe-service path that treats services/asr-service as the only batch write-back boundary; transcript draft generation should go through the local ASR HTTP contract instead of calling provider APIs directly from downstream tooling whenever the repository wants reproducible batch behavior.
- review_batch_003 establishes the stable artifact pattern for ASR rollout: select a balanced pending_asr batch, write draft results into val_transcripts_template.jsonl, regenerate qc_report.md, and produce a matching manual review checklist before any reviewer updates state.

## 2026-03-08 - Legacy ASR Env Aliases Removed

- scripts/write_asr_drafts.py, services/asr-service/main.py, and scripts/verify_asr_service.py now resolve ASR configuration only from ASR_API_KEY, ASR_BASE_URL, and ASR_MODEL; future tooling must not reintroduce provider-specific or shorthand aliases such as key, baseurl, OPENAI_*, or DASHSCOPE_*.
- The DashScope qwen3-asr-flash path still uses the OpenAI-compatible client at runtime, but that transport detail is now fully hidden behind canonical ASR_* environment variables so provider changes can stay internal to the ASR module boundary.

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
