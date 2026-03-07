CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('created', 'active', 'paused', 'closed', 'error')),
    stage TEXT NOT NULL CHECK (stage IN ('engage', 'assess', 'intervene', 'reassess', 'handoff')),
    input_modes JSONB NOT NULL DEFAULT '[]'::jsonb,
    avatar_id TEXT,
    record_id TEXT,
    dataset TEXT,
    canonical_role TEXT,
    segment_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_trace_id ON sessions (trace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_record_id ON sessions (record_id);

CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    trace_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'processing', 'completed', 'failed')),
    source_kind TEXT NOT NULL DEFAULT 'text' CHECK (source_kind IN ('text', 'audio', 'replay', 'system')),
    content_text TEXT NOT NULL,
    transcript_record_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created_at ON messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_trace_id ON messages (trace_id);

CREATE TABLE IF NOT EXISTS system_events (
    event_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    trace_id TEXT NOT NULL,
    message_id TEXT REFERENCES messages(message_id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    source_service TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    emitted_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_events_session_emitted_at ON system_events (session_id, emitted_at);
CREATE INDEX IF NOT EXISTS idx_system_events_trace_id ON system_events (trace_id);
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events (event_type);

CREATE TABLE IF NOT EXISTS evaluation_records (
    eval_id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(session_id) ON DELETE SET NULL,
    trace_id TEXT,
    record_id TEXT,
    dataset TEXT,
    canonical_role TEXT,
    segment_id TEXT,
    scope TEXT NOT NULL CHECK (scope IN ('session', 'asr', 'dialogue', 'multimodal', 'system')),
    metric_name TEXT NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    metric_unit TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_records_session_metric ON evaluation_records (session_id, metric_name);
CREATE INDEX IF NOT EXISTS idx_evaluation_records_record_id ON evaluation_records (record_id);

CREATE TABLE IF NOT EXISTS media_indexes (
    media_id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(session_id) ON DELETE SET NULL,
    trace_id TEXT,
    message_id TEXT REFERENCES messages(message_id) ON DELETE SET NULL,
    media_kind TEXT NOT NULL CHECK (
        media_kind IN ('audio_chunk', 'audio_final', 'video_frame', 'avatar_audio', 'avatar_motion', 'export')
    ),
    storage_backend TEXT NOT NULL CHECK (storage_backend IN ('local', 'minio')),
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    byte_size BIGINT CHECK (byte_size IS NULL OR byte_size >= 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_indexes_session_kind ON media_indexes (session_id, media_kind);
CREATE INDEX IF NOT EXISTS idx_media_indexes_trace_id ON media_indexes (trace_id);
