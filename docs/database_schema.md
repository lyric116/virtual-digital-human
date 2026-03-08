# Database Schema

## Purpose

This document defines the initial PostgreSQL schema introduced in implementation plan step
5. The goal is to support the text-first system baseline, event tracing, evaluation
records, and media indexing before any business API logic is added.

## Source Of Truth

- SQL init file: `infra/docker/postgres/init/001_base_schema.sql`
- Runtime verification script: `scripts/verify_db_schema.py`

## Tables

### `sessions`

Stores one row per live or replay session.

Key fields:

- `session_id` primary key
- `trace_id` root trace id
- `status` and `stage`
- `input_modes`
- optional replay lineage: `record_id`, `dataset`, `canonical_role`, `segment_id`
- timestamps: `started_at`, `updated_at`, `closed_at`

### `messages`

Stores user, assistant, and system messages.

Key fields:

- `message_id` primary key
- `session_id` foreign key to `sessions`
- `trace_id`
- `role`
- `status`
- `source_kind`
- `content_text`
- `transcript_record_id`
- timestamps: `submitted_at`, `created_at`, `updated_at`

### `system_events`

Stores normalized realtime events and backend system events using the shared envelope.

Key fields:

- `event_id` primary key
- `session_id` foreign key to `sessions`
- optional `message_id` foreign key to `messages`
- `trace_id`
- `event_type`
- `schema_version`
- `source_service`
- `payload`
- `emitted_at`

### `evaluation_records`

Stores metric outputs from ASR, dialogue, multimodal, and system-level evaluation runs.

Key fields:

- `eval_id` primary key
- optional `session_id`
- optional replay lineage: `record_id`, `dataset`, `canonical_role`, `segment_id`
- `scope`
- `metric_name`
- `metric_value`
- `metric_unit`
- `metadata`

### `media_indexes`

Indexes uploaded or generated media assets without storing the binary itself in PostgreSQL.

Key fields:

- `media_id` primary key
- optional `session_id`
- optional `message_id`
- `trace_id`
- `media_kind`
- `storage_backend`
- `storage_path`
- `mime_type`
- `duration_ms`
- `byte_size`

Current live use:

- step 17 stores browser-uploaded audio chunks as `media_kind='audio_chunk'` with local
  `storage_path` entries rooted under `MEDIA_STORAGE_ROOT`

## Relationships

- `messages.session_id -> sessions.session_id`
- `system_events.session_id -> sessions.session_id`
- `system_events.message_id -> messages.message_id`
- `evaluation_records.session_id -> sessions.session_id`
- `media_indexes.session_id -> sessions.session_id`
- `media_indexes.message_id -> messages.message_id`

## Design Boundaries

- This schema does not yet include affect windows, retrieval logs, or long-term user
  profiles.
- All ids are `TEXT` for now to keep gateway and offline replay identifiers aligned.
- Status and type fields use `CHECK` constraints instead of custom database enums to keep
  early migrations simple.
- JSONB fields are included only for flexible metadata and payload storage, not to hide
  core relational fields.

## Verification Standard

Step 5 is only considered complete when:

1. the SQL file can be applied to the running PostgreSQL container
2. one `sessions` row and one `messages` row can be inserted successfully
3. one `system_events`, `evaluation_records`, and `media_indexes` row can also be written
4. foreign-key linkage between `sessions` and `messages` is confirmed
