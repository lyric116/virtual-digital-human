# Shared Contracts

## Purpose

This document is the canonical contract reference for cross-service payloads. Gateway,
orchestrator, frontend, evaluation tools, and model services must all follow these field
names before any service-specific implementation is added.

## Naming Rules

- Use `snake_case` for all field names.
- Use `lower.dot.case` for realtime `event_type` values.
- Use ISO 8601 UTC timestamps with timezone suffix, for example
  `2026-03-07T12:30:00Z`.
- Use explicit unit suffixes for numeric timing fields, for example `duration_ms`.
- Keep identifier fields stable across services: never rename `session_id`,
  `trace_id`, `record_id`, or `message_id`.

## Cross-Cutting Identifiers

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `trace_id` | string | Yes | End-to-end request trace spanning gateway, orchestrator, and services. |
| `session_id` | string | Yes | User conversation session id. |
| `message_id` | string | No | Unique id for one user or assistant message. |
| `record_id` | string | No | Offline replay key from enterprise manifest, format `dataset/session/role/segment`. |
| `dataset` | string | No | Source dataset such as `noxi` or `recola` during replay or evaluation. |
| `canonical_role` | string | No | Normalized role such as `speaker_a` or `speaker_b`. |
| `segment_id` | string | No | Segment id within one dataset sample. |

These replay fields are optional in live sessions but required when replaying enterprise
validation data.

## Session Object

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `session_id` | string | Yes | Stable session id returned by gateway. |
| `trace_id` | string | Yes | Trace root created at session start. |
| `status` | string | Yes | `created`, `active`, `paused`, `closed`, or `error`. |
| `stage` | string | Yes | `engage`, `assess`, `intervene`, `reassess`, or `handoff`. |
| `input_modes` | array[string] | Yes | Enabled inputs, for example `["text", "audio", "video"]`. |
| `avatar_id` | string | No | Current selected avatar id. |
| `metadata` | object | No | Session-scoped runtime data such as persisted `dialogue_summary`. |
| `started_at` | string | Yes | Session creation time. |
| `updated_at` | string | Yes | Last mutation time. |

## Event Envelope

Every realtime message sent over WebSocket or recorded in `system_events` must use this
envelope.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `event_id` | string | Yes | Unique event id. |
| `event_type` | string | Yes | Event name such as `session.created` or `dialogue.reply`. |
| `schema_version` | string | Yes | Contract version, initial value `v1alpha1`. |
| `source_service` | string | Yes | Producer such as `api_gateway`, `orchestrator`, `asr_service`. |
| `session_id` | string | Yes | Session that owns the event. |
| `trace_id` | string | Yes | Trace id for log correlation. |
| `message_id` | string | No | Related message id when the event is tied to one turn. |
| `emitted_at` | string | Yes | Event emission time. |
| `payload` | object | Yes | Event-specific payload. |

## Event Names

- `session.created`
- `session.connection.ready`
- `session.heartbeat`
- `session.state.updated`
- `message.accepted`
- `transcript.partial`
- `transcript.final`
- `affect.snapshot`
- `dialogue.reply`
- `dialogue.summary.updated`
- `avatar.command`
- `session.error`

## Text Input Request

This contract is used by `POST /session/{id}/text` and also as the canonical stored shape
for text input inside the gateway.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `message_id` | string | Yes | Client or gateway generated message id. |
| `session_id` | string | Yes | Target session id. |
| `trace_id` | string | Yes | Trace id for this turn. |
| `role` | string | Yes | Always `user` for direct user input. |
| `content_text` | string | Yes | Submitted text content. |
| `submitted_at` | string | Yes | Submission time. |
| `client_seq` | integer | No | Monotonic client-side sequence number. |

## Audio Chunk Upload

This contract is used by `POST /api/session/{id}/audio/chunk`. The raw request body
contains the audio bytes. Chunk metadata travels in query parameters and the accepted
response is persisted into `media_indexes`.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `session_id` | string | Yes | Target session id. |
| `trace_id` | string | Yes | Session trace id copied into the stored media row. |
| `chunk_seq` | integer | Yes | Monotonic audio chunk sequence starting from `1`. |
| `chunk_started_at_ms` | integer | No | Offset of this chunk within the current recording. |
| `duration_ms` | integer | No | Fixed recording window length for this chunk. |
| `is_final` | boolean | Yes | Whether this is the last chunk emitted after stop. |
| `mime_type` | string | Yes | Browser media type such as `audio/webm`. |
| `byte_size` | integer | Yes | Stored byte size for the chunk body. |
| `storage_backend` | string | Yes | `local` in step 17, later `minio` when object storage is enabled. |
| `storage_path` | string | Yes | Local path or object key for the stored chunk. |
| `media_id` | string | Yes | Stable media index id returned by the gateway. |

## Video Frame Upload

This contract is used by `POST /api/session/{id}/video/frame`. The raw request body
contains one browser-captured snapshot. The gateway stores the binary and records one
`video_frame` row in `media_indexes` without calling any vision model yet.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `session_id` | string | Yes | Target session id. |
| `trace_id` | string | Yes | Session trace id copied into the stored media row. |
| `frame_seq` | integer | Yes | Monotonic frame sequence starting from `1`. |
| `captured_at_ms` | integer | No | Browser-side capture timestamp or offset for this frame. |
| `width` | integer | No | Captured frame width in pixels. |
| `height` | integer | No | Captured frame height in pixels. |
| `mime_type` | string | Yes | Browser media type such as `image/jpeg`. |
| `byte_size` | integer | Yes | Stored byte size for the frame body. |
| `storage_backend` | string | Yes | `local` in step 36, later `minio` when object storage is enabled. |
| `storage_path` | string | Yes | Local path or object key for the stored frame. |
| `media_id` | string | Yes | Stable media index id returned by the gateway. |

## Audio Preview And Partial Transcript

This contract is used by `POST /api/session/{id}/audio/preview`. The raw request body
contains the current accumulated recording snapshot. The gateway sends the snapshot to
the standalone ASR service and emits `transcript.partial` over WebSocket without
persisting a new row in `messages`.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `session_id` | string | Yes | Target session id. |
| `trace_id` | string | Yes | Session trace id reused by the partial transcript event. |
| `transcript_kind` | string | Yes | Always `partial` for preview requests. |
| `preview_seq` | integer | Yes | Monotonic preview sequence within one recording. |
| `recording_id` | string | Yes | Browser-side recording id used to ignore stale partial events. |
| `text` | string | Yes | Best-effort partial transcript text. |
| `language` | string | No | Language tag when the provider exposes it. |
| `confidence` | number | No | Mean confidence if available from the ASR provider. |
| `confidence_available` | boolean | Yes | Whether `confidence` is real. |
| `duration_ms` | integer | No | Duration of the preview snapshot. |
| `asr_engine` | string | No | Provider or model identifier, for example `qwen3-asr-flash`. |
| `generated_at` | string | Yes | Time when the ASR service produced the preview text. |

## Audio Finalize And Accepted Audio Message

This contract is used by `POST /api/session/{id}/audio/finalize`. The raw request body
contains one complete recording. The gateway stores the binary as `audio_final`, calls
the standalone ASR service, writes one user message with `source_kind='audio'`, and then
reuses the existing `message.accepted -> dialogue.reply` realtime path.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `media_id` | string | Yes | Stored `audio_final` media id created by the gateway. |
| `message_id` | string | Yes | Accepted user message id created from the final transcript. |
| `session_id` | string | Yes | Target session id. |
| `trace_id` | string | Yes | Session trace id copied into the accepted user message. |
| `role` | string | Yes | Always `user` for the accepted transcript message. |
| `status` | string | Yes | `accepted` when the final transcript is ready. |
| `source_kind` | string | Yes | Always `audio` for this path. |
| `content_text` | string | Yes | Final ASR transcript text written into `messages`. |
| `mime_type` | string | Yes | Media type of the finalized recording, for example `audio/wav`. |
| `duration_ms` | integer | No | Browser-reported recording duration passed to the gateway. |
| `submitted_at` | string | Yes | Time when the accepted transcript message was stored. |

## Transcript Result

This payload is used for offline ASR backfill and later live transcript events. In step
20, the live audio path emits `transcript.partial` during recording but still uses only
the accepted final user message, not a separate `transcript.final` event, after stop.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `record_id` | string | No | Offline manifest record id when transcript comes from enterprise data. |
| `session_id` | string | Yes | Live or replay session id. |
| `trace_id` | string | Yes | Trace id for transcript generation. |
| `message_id` | string | No | Related user message id if one already exists. |
| `transcript_kind` | string | Yes | `partial` or `final`. |
| `text` | string | Yes | Transcript text emitted to downstream consumers. |
| `language` | string | No | Language tag such as `fr-FR` or `zh-CN`. |
| `confidence` | number | No | Mean confidence for the transcript result. |
| `confidence_available` | boolean | No | Whether the provider exposed a real confidence score. |
| `duration_ms` | integer | No | Audio duration that produced the transcript. |
| `asr_engine` | string | No | Model or provider identifier. |
| `workflow_status` | string | No | Offline workflow state such as `pending_asr`, `draft_ready`, `pending_review`, `verified`. |
| `draft_segments` | array[object] | No | Segment-level draft details when available. |
| `audio_path_16k_mono` | string | No | Standardized offline audio path for evaluation. |

## Affect Snapshot

This payload is used by `POST /internal/affect/analyze` and rendered directly by the
frontend emotion panel in step 37. The first implementation is deterministic and
placeholder-driven, but later text, audio, video, and fusion analysis should preserve
the same outer shape.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `session_id` | string | Yes | Current session id. |
| `trace_id` | string | No | Trace id associated with the current affect refresh. |
| `current_stage` | string | Yes | Dialogue stage at the time of this snapshot. |
| `generated_at` | string | Yes | Snapshot generation time. |
| `source_context.origin` | string | Yes | Data source such as `web-shell` or `enterprise_validation_manifest`. |
| `source_context.dataset` | string | Yes | Source dataset such as `live_web`, `noxi`, or `recola`. |
| `source_context.record_id` | string | Yes | Stable sample identifier for replay or live session binding. |
| `source_context.note` | string | No | Human-readable binding note shown in the UI. |
| `text_result.status` | string | Yes | `ready`, `pending`, or `offline`. |
| `text_result.label` | string | Yes | Coarse text-lane label. |
| `text_result.confidence` | number | Yes | Placeholder confidence in step 37, real confidence later. |
| `text_result.detail` | string | Yes | Human-readable explanation shown in the UI. |
| `audio_result.*` | object | Yes | Same shape as `text_result` for the audio lane. |
| `video_result.*` | object | Yes | Same shape as `text_result` for the video lane. |
| `fusion_result.emotion_state` | string | Yes | Unified affect state shown in the panel. |
| `fusion_result.risk_level` | string | Yes | `low`, `medium`, or `high`. |
| `fusion_result.confidence` | number | Yes | Fused confidence value. |
| `fusion_result.conflict` | boolean | Yes | Whether the current lanes disagree strongly enough to require clarification. |
| `fusion_result.conflict_reason` | string | No | Conflict explanation placeholder. |
| `fusion_result.detail` | string | Yes | Human-readable fusion summary. |

## Dialogue Result

This payload is produced by dialogue orchestration and consumed by frontend, logs, and
avatar selection.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `session_id` | string | Yes | Current session id. |
| `trace_id` | string | Yes | Trace id for this dialogue turn. |
| `message_id` | string | Yes | Assistant message id. |
| `reply` | string | Yes | Assistant reply text shown to user. |
| `emotion` | string | Yes | Current coarse emotion label. |
| `risk_level` | string | Yes | `low`, `medium`, or `high`. |
| `stage` | string | Yes | `engage`, `assess`, `intervene`, `reassess`, or `handoff`. |
| `next_action` | string | Yes | Action selected by orchestrator. |
| `knowledge_refs` | array[string] | No | Retrieved KB ids used for grounding. |
| `avatar_style` | string | No | Style hint used by TTS and avatar layers. |
| `safety_flags` | array[string] | No | Triggered policy or risk flags. Gateway high-risk precheck may emit `high_risk_rule_precheck` and `rule_hit:*`; dialogue fallback may emit `dialogue_fallback_response` and `dialogue_fallback_reason:*`. |

## Dialogue Summary

This payload is produced after every configured summary interval and stored in
`sessions.metadata.dialogue_summary`. It is also emitted as `dialogue.summary.updated`
for export and reconnect observability.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `session_id` | string | Yes | Current session id. |
| `trace_id` | string | Yes | Session trace id. |
| `summary_text` | string | Yes | Compact Chinese summary of recent dialogue state. |
| `current_stage` | string | Yes | Stage captured when the summary was generated. |
| `user_turn_count` | integer | Yes | User-turn count covered by the summary snapshot. |
| `generated_at` | string | Yes | Summary generation time. |
| `summary_version` | integer | No | Internal summary shape version. |
| `generated_from_message_id` | string | No | Assistant message id that triggered the summary refresh. |

## TTS Synthesize Response

This payload is returned by the standalone TTS service after one assistant reply is
converted into one playable speech asset.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `tts_id` | string | Yes | Stable speech asset id. |
| `session_id` | string | No | Session id when synthesis is tied to one live dialogue turn. |
| `trace_id` | string | No | Trace id for one playback generation request. |
| `message_id` | string | No | Assistant message id that owns the speech asset. |
| `voice_id` | string | Yes | Actual TTS voice identifier used by the provider. |
| `subtitle` | string | Yes | Subtitle text paired with the audio asset. |
| `audio_format` | string | Yes | Returned audio format such as `mp3` or `wav`. |
| `audio_url` | string | Yes | URL that can be fetched directly for playback. |
| `duration_ms` | integer | Yes | Expected playback duration. |
| `byte_size` | integer | Yes | Stored audio byte size. |
| `provider_used` | string | Yes | Actual provider path used for this asset, currently `edge_tts` or `wave_fallback`. |
| `fallback_used` | boolean | Yes | Whether the local fallback path generated the asset. |
| `fallback_reason` | string | No | Machine-readable fallback reason when `fallback_used=true`. |
| `generated_at` | string | Yes | Asset generation time. |

## Avatar Offline Drive Response

This payload is returned by the offline avatar-driver service when one enterprise 3D
feature sample is converted into a validation-friendly driver structure.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `record_id` | string | No | Manifest record id tied to the sample. |
| `avatar_id` | string | Yes | Target avatar identifier used for validation. |
| `source_face3d_path` | string | Yes | Relative path of the source `3D_FV_files` asset. |
| `source_emotion_path` | string | No | Relative path of the paired emotion CSV when available. |
| `frame_count` | integer | Yes | Number of normalized 3D feature frames. |
| `feature_dim` | integer | Yes | Feature width after normalization. |
| `emotion_row_count` | integer | No | Number of paired emotion rows. |
| `alignment_status` | string | Yes | `aligned`, `mismatch`, or `unverified`. |
| `mismatch_steps` | integer | No | Absolute difference between 3D frames and emotion rows. |
| `driver_frames` | array[object] | Yes | Sampled driver parameter frames for offline inspection. |
| `driver_summary` | object | Yes | Aggregated driver stats plus optional emotion summary. |

## Avatar Command

This payload is emitted after TTS and dialogue planning and consumed by avatar playback.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `session_id` | string | Yes | Session id. |
| `trace_id` | string | Yes | Trace id. |
| `message_id` | string | Yes | Assistant message id that owns the playback. |
| `avatar_id` | string | Yes | Target avatar id. |
| `audio_url` | string | Yes | Speech asset to play. |
| `tts_voice_id` | string | No | TTS voice identifier used to generate `audio_url`. |
| `viseme_seq` | array[object] | No | Ordered viseme timeline for lip sync. |
| `expression` | object | No | Expression parameters such as `valence` and `arousal`. |
| `gesture` | string | No | Gesture preset, for example `soft_nod`. |
| `source_stage` | string | No | Dialogue stage that produced the command. |
| `source_risk_level` | string | No | Risk level used to damp or strengthen expression. |
| `duration_ms` | integer | No | Expected playback duration. |

## Error Response

This format is used by HTTP APIs and `session.error` events.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `error_code` | string | Yes | Stable machine-readable error id. |
| `message` | string | Yes | Human-readable summary. |
| `trace_id` | string | Yes | Trace id used to find logs. |
| `session_id` | string | No | Session id if the error is session-scoped. |
| `retryable` | boolean | Yes | Whether the caller can retry the same action. |
| `details` | object | No | Structured context safe to expose to clients. |

## Minimal Examples

### `session.created`

```json
{
  "event_id": "evt_001",
  "event_type": "session.created",
  "schema_version": "v1alpha1",
  "source_service": "api_gateway",
  "session_id": "sess_001",
  "trace_id": "trace_001",
  "emitted_at": "2026-03-07T12:30:00Z",
  "payload": {
    "session_id": "sess_001",
    "trace_id": "trace_001",
    "status": "created",
    "stage": "engage",
    "input_modes": ["text", "audio"],
    "avatar_id": "companion_female_01",
    "started_at": "2026-03-07T12:30:00Z",
    "updated_at": "2026-03-07T12:30:00Z"
  }
}
```

### `dialogue.reply`

```json
{
  "event_id": "evt_002",
  "event_type": "dialogue.reply",
  "schema_version": "v1alpha1",
  "source_service": "orchestrator",
  "session_id": "sess_001",
  "trace_id": "trace_001",
  "message_id": "msg_assistant_001",
  "emitted_at": "2026-03-07T12:30:08Z",
  "payload": {
    "session_id": "sess_001",
    "trace_id": "trace_001",
    "message_id": "msg_assistant_001",
    "reply": "谢谢你愿意说出来，我们先慢一点。",
    "emotion": "anxious",
    "risk_level": "medium",
    "stage": "assess",
    "next_action": "ask_followup",
    "knowledge_refs": ["breathing_478"],
    "avatar_style": "warm_support",
    "safety_flags": []
  }
}
```
