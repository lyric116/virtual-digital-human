from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any, Literal, Protocol
from urllib import parse as urllib_parse
from urllib import error as urllib_error
from urllib import request as urllib_request
from uuid import uuid4

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, ValidationError, field_validator


ROOT = Path(__file__).resolve().parents[2]
ALLOWED_INPUT_MODES = {"text", "audio", "video"}
SCHEMA_VERSION = "v1alpha1"
HEARTBEAT_INTERVAL_MS = 5000
DEFAULT_MEDIA_STORAGE_ROOT = "data/derived/live_media"
MIME_EXTENSION_MAP = {
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "application/octet-stream": ".bin",
}


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def bootstrap_runtime_env() -> None:
    merged = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env")}
    for key, value in merged.items():
        os.environ.setdefault(key, value)


def parse_csv_env(value: str | None, fallback: list[str]) -> list[str]:
    if not value:
        return fallback
    items = [item.strip() for item in value.split(",")]
    return [item for item in items if item]


@dataclass
class GatewaySettings:
    database_url: str
    default_avatar_id: str
    gateway_host: str
    gateway_port: int
    cors_origins: list[str]
    orchestrator_base_url: str
    orchestrator_timeout_seconds: float
    asr_service_base_url: str
    asr_timeout_seconds: float
    media_storage_root: str

    @classmethod
    def from_env(cls) -> "GatewaySettings":
        database_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
        if not database_url:
            host = os.getenv("POSTGRES_HOST", "localhost")
            port = os.getenv("POSTGRES_PORT", "5432")
            database = os.getenv("POSTGRES_DB", "virtual_human")
            user = os.getenv("POSTGRES_USER", "app")
            password = os.getenv("POSTGRES_PASSWORD", "change_me")
            database_url = f"postgresql://{user}:{password}@{host}:{port}/{database}"

        return cls(
            database_url=database_url,
            default_avatar_id=os.getenv("AVATAR_DEFAULT_ID_A")
            or os.getenv("WEB_DEFAULT_AVATAR_ID")
            or "companion_female_01",
            gateway_host=os.getenv("GATEWAY_HOST", "0.0.0.0"),
            gateway_port=int(os.getenv("GATEWAY_PORT", "8000")),
            cors_origins=parse_csv_env(
                os.getenv("GATEWAY_CORS_ORIGINS"),
                ["http://127.0.0.1:4173", "http://localhost:4173"],
            ),
            orchestrator_base_url=os.getenv("ORCHESTRATOR_BASE_URL")
            or f"http://127.0.0.1:{os.getenv('ORCHESTRATOR_PORT', '8010')}",
            orchestrator_timeout_seconds=float(
                os.getenv("ORCHESTRATOR_REQUEST_TIMEOUT_SECONDS", "60")
            ),
            asr_service_base_url=(
                f"http://"
                f"{'127.0.0.1' if os.getenv('ASR_SERVICE_HOST', '127.0.0.1') in {'0.0.0.0', '::'} else os.getenv('ASR_SERVICE_HOST', '127.0.0.1')}"
                f":{os.getenv('ASR_SERVICE_PORT', '8020')}"
            ),
            asr_timeout_seconds=float(os.getenv("ASR_TIMEOUT_SECONDS", "60")),
            media_storage_root=os.getenv("MEDIA_STORAGE_ROOT", DEFAULT_MEDIA_STORAGE_ROOT),
        )


class SessionCreateRequest(BaseModel):
    input_modes: list[str] = Field(default_factory=lambda: ["text", "audio"])
    avatar_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    record_id: str | None = None
    dataset: str | None = None
    canonical_role: str | None = None
    segment_id: str | None = None

    @field_validator("input_modes")
    @classmethod
    def validate_input_modes(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("input_modes must contain at least one mode")
        unsupported = [item for item in value if item not in ALLOWED_INPUT_MODES]
        if unsupported:
            raise ValueError(f"unsupported input modes: {', '.join(sorted(set(unsupported)))}")
        return value


class SessionCreatedResponse(BaseModel):
    session_id: str
    trace_id: str
    status: str
    stage: str
    input_modes: list[str]
    avatar_id: str | None
    started_at: datetime
    updated_at: datetime


class TextMessageSubmitRequest(BaseModel):
    content_text: str
    client_seq: int | None = Field(default=None, ge=1)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("content_text")
    @classmethod
    def validate_content_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("content_text must not be empty")
        return normalized


class TextMessageAcceptedResponse(BaseModel):
    message_id: str
    session_id: str
    trace_id: str
    role: str
    status: str
    source_kind: str
    content_text: str
    submitted_at: datetime
    client_seq: int | None = None


class AudioChunkAcceptedResponse(BaseModel):
    media_id: str
    session_id: str
    trace_id: str
    media_kind: Literal["audio_chunk"]
    storage_backend: Literal["local", "minio"]
    storage_path: str
    mime_type: str
    duration_ms: int | None = Field(default=None, ge=0)
    byte_size: int = Field(ge=0)
    chunk_seq: int = Field(ge=1)
    chunk_started_at_ms: int | None = Field(default=None, ge=0)
    is_final: bool = False
    created_at: datetime


class AudioFinalAcceptedResponse(BaseModel):
    media_id: str
    message_id: str
    session_id: str
    trace_id: str
    role: str
    status: str
    source_kind: str
    content_text: str
    mime_type: str
    duration_ms: int | None = Field(default=None, ge=0)
    submitted_at: datetime


class TranscriptPartialAcceptedResponse(BaseModel):
    session_id: str
    trace_id: str
    transcript_kind: Literal["partial"]
    preview_seq: int = Field(ge=1)
    recording_id: str
    text: str
    language: str | None = None
    confidence: float | None = None
    confidence_available: bool = False
    duration_ms: int | None = Field(default=None, ge=0)
    asr_engine: str | None = None
    generated_at: datetime


class MessageHistoryResponse(BaseModel):
    message_id: str
    session_id: str
    trace_id: str
    role: str
    status: str
    source_kind: str
    content_text: str
    submitted_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class SessionStateResponse(BaseModel):
    session: SessionCreatedResponse
    messages: list[MessageHistoryResponse] = Field(default_factory=list)


class SessionStageHistoryResponse(BaseModel):
    stage: Literal["engage", "assess", "intervene", "reassess", "handoff"]
    trace_id: str
    changed_at: datetime
    message_id: str | None = None


class SystemEventHistoryResponse(BaseModel):
    event_id: str
    session_id: str
    trace_id: str
    message_id: str | None = None
    event_type: str
    schema_version: str
    source_service: str
    payload: dict[str, Any] = Field(default_factory=dict)
    emitted_at: datetime


class SessionExportResponse(BaseModel):
    session_id: str
    trace_id: str
    status: str
    stage: str
    input_modes: list[str]
    avatar_id: str | None = None
    started_at: datetime
    updated_at: datetime
    exported_at: datetime
    messages: list[MessageHistoryResponse] = Field(default_factory=list)
    stage_history: list[SessionStageHistoryResponse] = Field(default_factory=list)
    events: list[SystemEventHistoryResponse] = Field(default_factory=list)


class DialogueReplyRequest(BaseModel):
    session_id: str
    trace_id: str
    user_message_id: str
    content_text: str
    current_stage: Literal["engage", "assess", "intervene", "reassess", "handoff"]
    metadata: dict[str, Any] = Field(default_factory=dict)


class DialogueReplyResponse(BaseModel):
    session_id: str
    trace_id: str
    message_id: str
    reply: str
    emotion: str
    risk_level: Literal["low", "medium", "high"]
    stage: Literal["engage", "assess", "intervene", "reassess", "handoff"]
    next_action: str
    knowledge_refs: list[str] = Field(default_factory=list)
    avatar_style: str | None = None
    safety_flags: list[str] = Field(default_factory=list)


class ASRServiceTranscriptionResponse(BaseModel):
    request_id: str
    record_id: str | None = None
    provider: str
    model: str
    transcript_text: str
    transcript_language: str | None = None
    duration_ms: int | None = Field(default=None, ge=0)
    confidence_mean: float | None = None
    confidence_available: bool = False
    transcript_segments: list[dict[str, Any]] = Field(default_factory=list)
    audio: dict[str, Any] = Field(default_factory=dict)
    generated_at: datetime


class SessionRepository(Protocol):
    def create_session(self, payload: SessionCreateRequest) -> dict[str, Any]:
        ...

    def get_session_summary(self, session_id: str) -> dict[str, Any] | None:
        ...

    def get_session_state(self, session_id: str) -> dict[str, Any] | None:
        ...

    def get_session_export(self, session_id: str) -> dict[str, Any] | None:
        ...

    def create_user_text_message(
        self,
        session_id: str,
        payload: TextMessageSubmitRequest,
    ) -> dict[str, Any]:
        ...

    def create_user_audio_message(
        self,
        session_id: str,
        *,
        content_text: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ...

    def create_assistant_dialogue_message(
        self,
        session_id: str,
        payload: DialogueReplyResponse,
    ) -> dict[str, Any]:
        ...

    def create_audio_chunk_index(
        self,
        session_id: str,
        *,
        content: bytes,
        chunk_seq: int,
        chunk_started_at_ms: int | None,
        duration_ms: int | None,
        is_final: bool,
        mime_type: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ...

    def create_audio_final_asset(
        self,
        session_id: str,
        *,
        content: bytes,
        duration_ms: int | None,
        mime_type: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ...

    def record_system_event(self, envelope: dict[str, Any]) -> None:
        ...


class ConnectionRegistry:
    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}
        self._pending_events: dict[str, list[dict[str, Any]]] = {}

    async def add(self, session_id: str, websocket: WebSocket) -> None:
        connections = self._connections.setdefault(session_id, [])
        if websocket not in connections:
            connections.append(websocket)

    async def remove(self, session_id: str, websocket: WebSocket) -> None:
        connections = self._connections.get(session_id)
        if not connections:
            return
        self._connections[session_id] = [item for item in connections if item is not websocket]
        if not self._connections[session_id]:
            del self._connections[session_id]

    async def enqueue_event(self, session_id: str, envelope: dict[str, Any]) -> None:
        connections = list(self._connections.get(session_id, []))
        if connections:
            stale: list[WebSocket] = []
            delivered = False
            for websocket in connections:
                try:
                    await websocket.send_json(envelope)
                    delivered = True
                except Exception:
                    stale.append(websocket)
            for websocket in stale:
                await self.remove(session_id, websocket)
            if delivered and not stale:
                return

        queue = self._pending_events.setdefault(session_id, [])
        queue.append(envelope)

    async def flush(self, session_id: str, websocket: WebSocket) -> None:
        queue = self._pending_events.get(session_id, [])
        if not queue:
            return

        while queue:
            envelope = queue.pop(0)
            await websocket.send_json(envelope)

        if session_id in self._pending_events and not self._pending_events[session_id]:
            del self._pending_events[session_id]


class PostgresSessionRepository:
    def __init__(self, settings: GatewaySettings):
        self.database_url = settings.database_url
        self.default_avatar_id = settings.default_avatar_id
        self.media_storage_root = settings.media_storage_root

    def _resolve_audio_chunk_path(
        self,
        session_id: str,
        media_id: str,
        chunk_seq: int,
        mime_type: str,
    ) -> tuple[Path, str]:
        configured_root = Path(self.media_storage_root)
        if configured_root.is_absolute():
            storage_root = configured_root
            storage_prefix = configured_root
        else:
            storage_root = ROOT / configured_root
            storage_prefix = ROOT

        extension = MIME_EXTENSION_MAP.get(mime_type, ".bin")
        absolute_path = storage_root / "audio_chunks" / session_id / f"{chunk_seq:06d}_{media_id}{extension}"
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            storage_path = str(absolute_path.relative_to(storage_prefix))
        except ValueError:
            storage_path = str(absolute_path)
        return absolute_path, storage_path

    def _resolve_audio_final_path(
        self,
        session_id: str,
        media_id: str,
        mime_type: str,
    ) -> tuple[Path, str]:
        configured_root = Path(self.media_storage_root)
        if configured_root.is_absolute():
            storage_root = configured_root
            storage_prefix = configured_root
        else:
            storage_root = ROOT / configured_root
            storage_prefix = ROOT

        extension = MIME_EXTENSION_MAP.get(mime_type, ".bin")
        absolute_path = storage_root / "audio_final" / session_id / f"{media_id}{extension}"
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            storage_path = str(absolute_path.relative_to(storage_prefix))
        except ValueError:
            storage_path = str(absolute_path)
        return absolute_path, storage_path

    def _create_user_message(
        self,
        session_id: str,
        *,
        content_text: str,
        source_kind: Literal["text", "audio"],
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        message_id = f"msg_{uuid4().hex[:24]}"

        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT session_id, trace_id, status, stage
                    FROM sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                session_row = cur.fetchone()
                if session_row is None:
                    raise KeyError(session_id)

                row_metadata = dict(metadata or {})
                cur.execute(
                    """
                    INSERT INTO messages (
                        message_id,
                        session_id,
                        trace_id,
                        role,
                        status,
                        source_kind,
                        content_text,
                        metadata,
                        submitted_at,
                        created_at,
                        updated_at
                    ) VALUES (
                        %(message_id)s,
                        %(session_id)s,
                        %(trace_id)s,
                        'user',
                        'accepted',
                        %(source_kind)s,
                        %(content_text)s,
                        %(metadata)s,
                        %(submitted_at)s,
                        %(created_at)s,
                        %(updated_at)s
                    )
                    RETURNING
                        message_id,
                        session_id,
                        trace_id,
                        role,
                        status,
                        source_kind,
                        content_text,
                        submitted_at
                    """,
                    {
                        "message_id": message_id,
                        "session_id": session_id,
                        "trace_id": session_row["trace_id"],
                        "source_kind": source_kind,
                        "content_text": content_text,
                        "metadata": Jsonb(row_metadata),
                        "submitted_at": now,
                        "created_at": now,
                        "updated_at": now,
                    },
                )
                message_row = cur.fetchone()

                cur.execute(
                    """
                    UPDATE sessions
                    SET status = 'active', updated_at = %(updated_at)s
                    WHERE session_id = %(session_id)s
                    RETURNING session_id, trace_id, status, stage, updated_at
                    """,
                    {
                        "session_id": session_id,
                        "updated_at": now,
                    },
                )
                updated_session = cur.fetchone()

        if message_row is None or updated_session is None:
            raise RuntimeError("user message insert returned no row")

        accepted_message = dict(message_row)
        client_seq = row_metadata.get("client_seq")
        if isinstance(client_seq, int):
            accepted_message["client_seq"] = client_seq
        return {
            "session": dict(updated_session),
            "message": accepted_message,
        }

    def create_session(self, payload: SessionCreateRequest) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        session_id = f"sess_{uuid4().hex[:24]}"
        trace_id = f"trace_{uuid4().hex[:24]}"
        avatar_id = payload.avatar_id or self.default_avatar_id

        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO sessions (
                        session_id,
                        trace_id,
                        status,
                        stage,
                        input_modes,
                        avatar_id,
                        record_id,
                        dataset,
                        canonical_role,
                        segment_id,
                        metadata,
                        started_at,
                        updated_at
                    ) VALUES (
                        %(session_id)s,
                        %(trace_id)s,
                        'created',
                        'engage',
                        %(input_modes)s,
                        %(avatar_id)s,
                        %(record_id)s,
                        %(dataset)s,
                        %(canonical_role)s,
                        %(segment_id)s,
                        %(metadata)s,
                        %(started_at)s,
                        %(updated_at)s
                    )
                    RETURNING
                        session_id,
                        trace_id,
                        status,
                        stage,
                        input_modes,
                        avatar_id,
                        started_at,
                        updated_at
                    """,
                    {
                        "session_id": session_id,
                        "trace_id": trace_id,
                        "input_modes": Jsonb(payload.input_modes),
                        "avatar_id": avatar_id,
                        "record_id": payload.record_id,
                        "dataset": payload.dataset,
                        "canonical_role": payload.canonical_role,
                        "segment_id": payload.segment_id,
                        "metadata": Jsonb(payload.metadata),
                        "started_at": now,
                        "updated_at": now,
                    },
                )
                row = cur.fetchone()

                if row is not None:
                    cur.execute(
                        """
                        INSERT INTO system_events (
                            event_id,
                            session_id,
                            trace_id,
                            message_id,
                            event_type,
                            schema_version,
                            source_service,
                            payload,
                            emitted_at
                        ) VALUES (
                            %(event_id)s,
                            %(session_id)s,
                            %(trace_id)s,
                            %(message_id)s,
                            %(event_type)s,
                            %(schema_version)s,
                            %(source_service)s,
                            %(payload)s,
                            %(emitted_at)s
                        )
                        """,
                        {
                            "event_id": f"evt_{uuid4().hex[:24]}",
                            "session_id": session_id,
                            "trace_id": trace_id,
                            "message_id": None,
                            "event_type": "session.created",
                            "schema_version": SCHEMA_VERSION,
                            "source_service": "api_gateway",
                            "payload": Jsonb(
                                {
                                    "status": "created",
                                    "stage": "engage",
                                    "input_modes": payload.input_modes,
                                    "avatar_id": avatar_id,
                                }
                            ),
                            "emitted_at": now,
                        },
                    )

        if row is None:
            raise RuntimeError("session insert returned no row")
        return row

    def get_session_summary(self, session_id: str) -> dict[str, Any] | None:
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT session_id, trace_id, status, stage, updated_at
                    FROM sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                row = cur.fetchone()
        return row

    def get_session_state(self, session_id: str) -> dict[str, Any] | None:
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        session_id,
                        trace_id,
                        status,
                        stage,
                        input_modes,
                        avatar_id,
                        started_at,
                        updated_at
                    FROM sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                session_row = cur.fetchone()
                if session_row is None:
                    return None

                cur.execute(
                    """
                    SELECT
                        message_id,
                        session_id,
                        trace_id,
                        role,
                        status,
                        source_kind,
                        content_text,
                        submitted_at,
                        metadata
                    FROM messages
                    WHERE session_id = %s
                    ORDER BY submitted_at ASC, created_at ASC, message_id ASC
                    """,
                    (session_id,),
                )
                message_rows = cur.fetchall()

        return {
            "session": dict(session_row),
            "messages": [dict(row) for row in message_rows],
        }

    def get_session_export(self, session_id: str) -> dict[str, Any] | None:
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        session_id,
                        trace_id,
                        status,
                        stage,
                        input_modes,
                        avatar_id,
                        started_at,
                        updated_at
                    FROM sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                session_row = cur.fetchone()
                if session_row is None:
                    return None

                cur.execute(
                    """
                    SELECT
                        message_id,
                        session_id,
                        trace_id,
                        role,
                        status,
                        source_kind,
                        content_text,
                        submitted_at,
                        metadata
                    FROM messages
                    WHERE session_id = %s
                    ORDER BY submitted_at ASC, created_at ASC, message_id ASC
                    """,
                    (session_id,),
                )
                message_rows = cur.fetchall()

                cur.execute(
                    """
                    SELECT
                        event_id,
                        session_id,
                        trace_id,
                        message_id,
                        event_type,
                        schema_version,
                        source_service,
                        payload,
                        emitted_at
                    FROM system_events
                    WHERE session_id = %s
                    ORDER BY emitted_at ASC, created_at ASC, event_id ASC
                    """,
                    (session_id,),
                )
                event_rows = cur.fetchall()

        messages = [dict(row) for row in message_rows]
        events = [dict(row) for row in event_rows]
        return {
            "session_id": session_row["session_id"],
            "trace_id": session_row["trace_id"],
            "status": session_row["status"],
            "stage": session_row["stage"],
            "input_modes": session_row["input_modes"],
            "avatar_id": session_row["avatar_id"],
            "started_at": session_row["started_at"],
            "updated_at": session_row["updated_at"],
            "exported_at": datetime.now(timezone.utc),
            "messages": messages,
            "stage_history": build_stage_history(
                session_trace_id=session_row["trace_id"],
                started_at=session_row["started_at"],
                messages=messages,
            ),
            "events": events,
        }

    def create_user_text_message(
        self,
        session_id: str,
        payload: TextMessageSubmitRequest,
    ) -> dict[str, Any]:
        metadata = dict(payload.metadata)
        if payload.client_seq is not None:
            metadata["client_seq"] = payload.client_seq
        return self._create_user_message(
            session_id,
            content_text=payload.content_text,
            source_kind="text",
            metadata=metadata,
        )

    def create_user_audio_message(
        self,
        session_id: str,
        *,
        content_text: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self._create_user_message(
            session_id,
            content_text=content_text,
            source_kind="audio",
            metadata=metadata,
        )

    def create_assistant_dialogue_message(
        self,
        session_id: str,
        payload: DialogueReplyResponse,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)

        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT session_id, trace_id
                    FROM sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                session_row = cur.fetchone()
                if session_row is None:
                    raise KeyError(session_id)

                cur.execute(
                    """
                    INSERT INTO messages (
                        message_id,
                        session_id,
                        trace_id,
                        role,
                        status,
                        source_kind,
                        content_text,
                        metadata,
                        submitted_at,
                        created_at,
                        updated_at
                    ) VALUES (
                        %(message_id)s,
                        %(session_id)s,
                        %(trace_id)s,
                        'assistant',
                        'completed',
                        'text',
                        %(content_text)s,
                        %(metadata)s,
                        %(submitted_at)s,
                        %(created_at)s,
                        %(updated_at)s
                    )
                    RETURNING
                        message_id,
                        session_id,
                        trace_id,
                        role,
                        status,
                        source_kind,
                        content_text,
                        submitted_at
                    """,
                    {
                        "message_id": payload.message_id,
                        "session_id": session_id,
                        "trace_id": payload.trace_id,
                        "content_text": payload.reply,
                        "metadata": Jsonb(
                            {
                                "emotion": payload.emotion,
                                "risk_level": payload.risk_level,
                                "stage": payload.stage,
                                "next_action": payload.next_action,
                                "knowledge_refs": payload.knowledge_refs,
                                "avatar_style": payload.avatar_style,
                                "safety_flags": payload.safety_flags,
                            }
                        ),
                        "submitted_at": now,
                        "created_at": now,
                        "updated_at": now,
                    },
                )
                message_row = cur.fetchone()

                cur.execute(
                    """
                    UPDATE sessions
                    SET status = 'active', stage = %(stage)s, updated_at = %(updated_at)s
                    WHERE session_id = %(session_id)s
                    RETURNING session_id, trace_id, status, stage, updated_at
                    """,
                    {
                        "session_id": session_id,
                        "stage": payload.stage,
                        "updated_at": now,
                    },
                )
                updated_session = cur.fetchone()

        if message_row is None or updated_session is None:
            raise RuntimeError("assistant message insert returned no row")

        return {
            "session": dict(updated_session),
            "message": dict(message_row),
        }

    def create_audio_chunk_index(
        self,
        session_id: str,
        *,
        content: bytes,
        chunk_seq: int,
        chunk_started_at_ms: int | None,
        duration_ms: int | None,
        is_final: bool,
        mime_type: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        media_id = f"media_{uuid4().hex[:24]}"

        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT session_id, trace_id
                    FROM sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                session_row = cur.fetchone()
                if session_row is None:
                    raise KeyError(session_id)

                absolute_path, storage_path = self._resolve_audio_chunk_path(
                    session_id=session_id,
                    media_id=media_id,
                    chunk_seq=chunk_seq,
                    mime_type=mime_type,
                )
                absolute_path.write_bytes(content)

                row_metadata = dict(metadata or {})
                row_metadata.update(
                    {
                        "chunk_seq": chunk_seq,
                        "chunk_started_at_ms": chunk_started_at_ms,
                        "is_final": is_final,
                    }
                )

                cur.execute(
                    """
                    INSERT INTO media_indexes (
                        media_id,
                        session_id,
                        trace_id,
                        message_id,
                        media_kind,
                        storage_backend,
                        storage_path,
                        mime_type,
                        duration_ms,
                        byte_size,
                        metadata,
                        created_at
                    ) VALUES (
                        %(media_id)s,
                        %(session_id)s,
                        %(trace_id)s,
                        %(message_id)s,
                        'audio_chunk',
                        'local',
                        %(storage_path)s,
                        %(mime_type)s,
                        %(duration_ms)s,
                        %(byte_size)s,
                        %(metadata)s,
                        %(created_at)s
                    )
                    RETURNING
                        media_id,
                        session_id,
                        trace_id,
                        media_kind,
                        storage_backend,
                        storage_path,
                        mime_type,
                        duration_ms,
                        byte_size,
                        created_at
                    """,
                    {
                        "media_id": media_id,
                        "session_id": session_id,
                        "trace_id": session_row["trace_id"],
                        "message_id": None,
                        "storage_path": storage_path,
                        "mime_type": mime_type,
                        "duration_ms": duration_ms,
                        "byte_size": len(content),
                        "metadata": Jsonb(row_metadata),
                        "created_at": now,
                    },
                )
                row = cur.fetchone()

        if row is None:
            raise RuntimeError("audio chunk insert returned no row")

        return {
            **dict(row),
            "chunk_seq": chunk_seq,
            "chunk_started_at_ms": chunk_started_at_ms,
            "is_final": is_final,
        }

    def create_audio_final_asset(
        self,
        session_id: str,
        *,
        content: bytes,
        duration_ms: int | None,
        mime_type: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        media_id = f"media_{uuid4().hex[:24]}"

        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT session_id, trace_id
                    FROM sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                session_row = cur.fetchone()
                if session_row is None:
                    raise KeyError(session_id)

                absolute_path, storage_path = self._resolve_audio_final_path(
                    session_id=session_id,
                    media_id=media_id,
                    mime_type=mime_type,
                )
                absolute_path.write_bytes(content)

                cur.execute(
                    """
                    INSERT INTO media_indexes (
                        media_id,
                        session_id,
                        trace_id,
                        message_id,
                        media_kind,
                        storage_backend,
                        storage_path,
                        mime_type,
                        duration_ms,
                        byte_size,
                        metadata,
                        created_at
                    ) VALUES (
                        %(media_id)s,
                        %(session_id)s,
                        %(trace_id)s,
                        %(message_id)s,
                        'audio_final',
                        'local',
                        %(storage_path)s,
                        %(mime_type)s,
                        %(duration_ms)s,
                        %(byte_size)s,
                        %(metadata)s,
                        %(created_at)s
                    )
                    RETURNING
                        media_id,
                        session_id,
                        trace_id,
                        media_kind,
                        storage_backend,
                        storage_path,
                        mime_type,
                        duration_ms,
                        byte_size,
                        created_at
                    """,
                    {
                        "media_id": media_id,
                        "session_id": session_id,
                        "trace_id": session_row["trace_id"],
                        "message_id": None,
                        "storage_path": storage_path,
                        "mime_type": mime_type,
                        "duration_ms": duration_ms,
                        "byte_size": len(content),
                        "metadata": Jsonb(metadata or {}),
                        "created_at": now,
                    },
                )
                row = cur.fetchone()

        if row is None:
            raise RuntimeError("audio final insert returned no row")
        return dict(row)

    def record_system_event(self, envelope: dict[str, Any]) -> None:
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO system_events (
                        event_id,
                        session_id,
                        trace_id,
                        message_id,
                        event_type,
                        schema_version,
                        source_service,
                        payload,
                        emitted_at
                    ) VALUES (
                        %(event_id)s,
                        %(session_id)s,
                        %(trace_id)s,
                        %(message_id)s,
                        %(event_type)s,
                        %(schema_version)s,
                        %(source_service)s,
                        %(payload)s,
                        %(emitted_at)s
                    )
                    ON CONFLICT (event_id) DO NOTHING
                    """,
                    {
                        "event_id": envelope["event_id"],
                        "session_id": envelope["session_id"],
                        "trace_id": envelope["trace_id"],
                        "message_id": envelope.get("message_id"),
                        "event_type": envelope["event_type"],
                        "schema_version": envelope["schema_version"],
                        "source_service": envelope["source_service"],
                        "payload": Jsonb(envelope.get("payload") or {}),
                        "emitted_at": envelope["emitted_at"],
                    },
                )


def error_payload(
    *,
    error_code: str,
    message: str,
    trace_id: str | None = None,
    session_id: str | None = None,
    retryable: bool = False,
) -> dict[str, Any]:
    return {
        "error_code": error_code,
        "message": message,
        "trace_id": trace_id or f"trace_error_{uuid4().hex[:24]}",
        "session_id": session_id,
        "retryable": retryable,
        "details": {},
    }


def build_event_envelope(
    *,
    session: dict[str, Any],
    event_type: str,
    payload: dict[str, Any],
    message_id: str | None = None,
    source_service: str = "api_gateway",
) -> dict[str, Any]:
    return {
        "event_id": f"evt_{uuid4().hex[:24]}",
        "event_type": event_type,
        "schema_version": SCHEMA_VERSION,
        "source_service": source_service,
        "session_id": session["session_id"],
        "trace_id": session["trace_id"],
        "message_id": message_id,
        "emitted_at": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }


def build_stage_history(
    *,
    session_trace_id: str,
    started_at: datetime,
    messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    history: list[dict[str, Any]] = [
        {
            "stage": "engage",
            "trace_id": session_trace_id,
            "changed_at": started_at,
            "message_id": None,
        }
    ]
    current_stage = "engage"

    for message in messages:
        if message.get("role") != "assistant":
            continue
        metadata = message.get("metadata")
        if not isinstance(metadata, dict):
            continue
        next_stage = metadata.get("stage")
        if next_stage not in {"engage", "assess", "intervene", "reassess", "handoff"}:
            continue
        if next_stage == current_stage:
            continue
        history.append(
            {
                "stage": next_stage,
                "trace_id": session_trace_id,
                "changed_at": message.get("submitted_at") or started_at,
                "message_id": message.get("message_id"),
            }
        )
        current_stage = next_stage

    return history


def create_session_record(
    repository: SessionRepository,
    payload: SessionCreateRequest,
) -> dict[str, Any] | JSONResponse:
    try:
        return repository.create_session(payload)
    except psycopg.Error:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_payload(
                error_code="session_create_failed",
                message="Failed to create session",
            ),
        )


def create_text_message_record(
    repository: SessionRepository,
    session_id: str,
    payload: TextMessageSubmitRequest,
) -> dict[str, Any] | JSONResponse:
    try:
        return repository.create_user_text_message(session_id, payload)
    except KeyError:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_payload(
                error_code="session_not_found",
                message="Session not found",
                session_id=session_id,
            ),
        )
    except psycopg.Error:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_payload(
                error_code="text_message_submit_failed",
                message="Failed to submit text message",
                session_id=session_id,
            ),
        )


def create_audio_chunk_record(
    repository: SessionRepository,
    session_id: str,
    *,
    content: bytes,
    chunk_seq: int,
    chunk_started_at_ms: int | None,
    duration_ms: int | None,
    is_final: bool,
    mime_type: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | JSONResponse:
    if not content:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=error_payload(
                error_code="audio_chunk_empty",
                message="Audio chunk body must not be empty",
                session_id=session_id,
            ),
        )

    try:
        return repository.create_audio_chunk_index(
            session_id,
            content=content,
            chunk_seq=chunk_seq,
            chunk_started_at_ms=chunk_started_at_ms,
            duration_ms=duration_ms,
            is_final=is_final,
            mime_type=mime_type,
            metadata=metadata,
        )
    except KeyError:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_payload(
                error_code="session_not_found",
                message="Session not found",
                session_id=session_id,
            ),
        )
    except (OSError, psycopg.Error):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_payload(
                error_code="audio_chunk_store_failed",
                message="Failed to store audio chunk",
                session_id=session_id,
            ),
        )


def create_audio_finalize_asset_record(
    repository: SessionRepository,
    session_id: str,
    *,
    content: bytes,
    duration_ms: int | None,
    mime_type: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | JSONResponse:
    if not content:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=error_payload(
                error_code="audio_final_empty",
                message="Audio finalize body must not be empty",
                session_id=session_id,
            ),
        )

    try:
        return repository.create_audio_final_asset(
            session_id,
            content=content,
            duration_ms=duration_ms,
            mime_type=mime_type,
            metadata=metadata,
        )
    except KeyError:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_payload(
                error_code="session_not_found",
                message="Session not found",
                session_id=session_id,
            ),
        )
    except (OSError, psycopg.Error):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_payload(
                error_code="audio_final_store_failed",
                message="Failed to store final audio",
                session_id=session_id,
            ),
        )


def create_session_state_record(
    repository: SessionRepository,
    session_id: str,
) -> dict[str, Any] | JSONResponse:
    result = repository.get_session_state(session_id)
    if result is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_payload(
                error_code="session_not_found",
                message="Session not found",
                session_id=session_id,
            ),
        )
    return result


def create_session_export_record(
    repository: SessionRepository,
    session_id: str,
) -> dict[str, Any] | JSONResponse:
    result = repository.get_session_export(session_id)
    if result is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_payload(
                error_code="session_not_found",
                message=f"session not found: {session_id}",
                session_id=session_id,
                retryable=False,
            ),
        )
    return result


def request_dialogue_reply(
    settings: GatewaySettings,
    session: dict[str, Any],
    message: dict[str, Any],
) -> DialogueReplyResponse:
    request_payload = DialogueReplyRequest(
        session_id=session["session_id"],
        trace_id=session["trace_id"],
        user_message_id=message["message_id"],
        content_text=message["content_text"],
        current_stage=session["stage"],
        metadata={"source_service": "api_gateway"},
    )
    body = json.dumps(request_payload.model_dump()).encode("utf-8")
    request = urllib_request.Request(
        url=f"{settings.orchestrator_base_url.rstrip('/')}/internal/dialogue/respond",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=settings.orchestrator_timeout_seconds) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"orchestrator http {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"orchestrator unavailable: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("orchestrator returned invalid json") from exc

    try:
        return DialogueReplyResponse.model_validate(raw_payload)
    except ValidationError as exc:
        raise RuntimeError(f"invalid dialogue reply: {exc}") from exc


def request_asr_transcription(
    settings: GatewaySettings,
    *,
    body: bytes,
    mime_type: str,
) -> ASRServiceTranscriptionResponse:
    extension = MIME_EXTENSION_MAP.get(mime_type, ".bin")
    request = urllib_request.Request(
        url=(
            f"{settings.asr_service_base_url.rstrip('/')}/api/asr/transcribe?"
            f"{urllib_parse.urlencode({'filename': f'recording{extension}'})}"
        ),
        data=body,
        headers={"Content-Type": mime_type},
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=settings.asr_timeout_seconds) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"asr service http {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"asr service unavailable: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("asr service returned invalid json") from exc

    try:
        return ASRServiceTranscriptionResponse.model_validate(raw_payload)
    except ValidationError as exc:
        raise RuntimeError(f"invalid asr transcription: {exc}") from exc


def create_audio_message_record(
    repository: SessionRepository,
    settings: GatewaySettings,
    session_id: str,
    *,
    content: bytes,
    duration_ms: int | None,
    mime_type: str,
) -> dict[str, Any] | JSONResponse:
    audio_asset = create_audio_finalize_asset_record(
        repository,
        session_id,
        content=content,
        duration_ms=duration_ms,
        mime_type=mime_type,
        metadata={"source": "web-shell"},
    )
    if isinstance(audio_asset, JSONResponse):
        return audio_asset

    try:
        transcription = request_asr_transcription(
            settings,
            body=content,
            mime_type=mime_type,
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=error_payload(
                error_code="audio_transcription_failed",
                message=str(exc),
                session_id=session_id,
                retryable=True,
            ),
        )

    transcript_text = transcription.transcript_text.strip()
    if not transcript_text:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=error_payload(
                error_code="audio_transcription_empty",
                message="ASR service returned an empty transcript",
                session_id=session_id,
                retryable=True,
            ),
        )

    try:
        result = repository.create_user_audio_message(
            session_id,
            content_text=transcript_text,
            metadata={
                "source": "audio_finalize",
                "audio_media_id": audio_asset["media_id"],
                "audio_mime_type": mime_type,
                "audio_duration_ms": duration_ms,
                "asr_provider": transcription.provider,
                "asr_model": transcription.model,
                "transcript_language": transcription.transcript_language,
                "confidence_mean": transcription.confidence_mean,
                "confidence_available": transcription.confidence_available,
            },
        )
    except KeyError:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_payload(
                error_code="session_not_found",
                message="Session not found",
                session_id=session_id,
            ),
        )
    except psycopg.Error:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_payload(
                error_code="audio_message_submit_failed",
                message="Failed to create audio transcript message",
                session_id=session_id,
            ),
        )

    result["audio"] = audio_asset
    result["transcription"] = transcription.model_dump(mode="json")
    return result


def create_audio_preview_record(
    repository: SessionRepository,
    settings: GatewaySettings,
    session_id: str,
    *,
    content: bytes,
    duration_ms: int | None,
    mime_type: str,
    preview_seq: int,
    recording_id: str,
) -> dict[str, Any] | JSONResponse:
    if not content:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=error_payload(
                error_code="audio_preview_empty",
                message="Audio preview body must not be empty",
                session_id=session_id,
            ),
        )

    session = repository.get_session_summary(session_id)
    if session is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_payload(
                error_code="session_not_found",
                message="Session not found",
                session_id=session_id,
            ),
        )

    try:
        transcription = request_asr_transcription(
            settings,
            body=content,
            mime_type=mime_type,
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=error_payload(
                error_code="audio_preview_failed",
                message=str(exc),
                session_id=session_id,
                retryable=True,
            ),
        )

    transcript_text = transcription.transcript_text.strip()
    if not transcript_text:
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content=TranscriptPartialAcceptedResponse(
                session_id=session["session_id"],
                trace_id=session["trace_id"],
                transcript_kind="partial",
                preview_seq=preview_seq,
                recording_id=recording_id,
                text="",
                language=transcription.transcript_language,
                confidence=transcription.confidence_mean,
                confidence_available=transcription.confidence_available,
                duration_ms=duration_ms if duration_ms is not None else transcription.duration_ms,
                asr_engine=transcription.model,
                generated_at=transcription.generated_at,
            ).model_dump(mode="json"),
        )

    return {
        "session": session,
        "transcript": TranscriptPartialAcceptedResponse(
            session_id=session["session_id"],
            trace_id=session["trace_id"],
            transcript_kind="partial",
            preview_seq=preview_seq,
            recording_id=recording_id,
            text=transcript_text,
            language=transcription.transcript_language,
            confidence=transcription.confidence_mean,
            confidence_available=transcription.confidence_available,
            duration_ms=duration_ms if duration_ms is not None else transcription.duration_ms,
            asr_engine=transcription.model,
            generated_at=transcription.generated_at,
        ).model_dump(mode="json"),
    }


async def dispatch_message_pipeline(
    request: Request,
    session_id: str,
    result: dict[str, Any],
) -> None:
    repository = request.app.state.session_repository
    settings: GatewaySettings = request.app.state.settings

    accepted_event = build_event_envelope(
        session=result["session"],
        event_type="message.accepted",
        payload=result["message"],
        message_id=result["message"]["message_id"],
    )
    accepted_event = jsonable_encoder(accepted_event)
    repository.record_system_event(accepted_event)
    await request.app.state.connection_registry.enqueue_event(session_id, accepted_event)

    try:
        dialogue_reply = request_dialogue_reply(settings, result["session"], result["message"])
        assistant_result = repository.create_assistant_dialogue_message(session_id, dialogue_reply)
        dialogue_event = build_event_envelope(
            session=assistant_result["session"],
            event_type="dialogue.reply",
            payload={
                **dialogue_reply.model_dump(mode="json"),
                "submitted_at": assistant_result["message"]["submitted_at"],
            },
            message_id=dialogue_reply.message_id,
            source_service="orchestrator",
        )
        dialogue_event = jsonable_encoder(dialogue_event)
        repository.record_system_event(dialogue_event)
        await request.app.state.connection_registry.enqueue_event(session_id, dialogue_event)
    except (KeyError, psycopg.Error, RuntimeError) as exc:
        error_event = build_event_envelope(
            session=result["session"],
            event_type="session.error",
            payload=error_payload(
                error_code="dialogue_reply_failed",
                message=str(exc),
                trace_id=result["session"]["trace_id"],
                session_id=session_id,
                retryable=True,
            ),
            source_service="api_gateway",
        )
        error_event = jsonable_encoder(error_event)
        repository.record_system_event(error_event)
        await request.app.state.connection_registry.enqueue_event(session_id, error_event)


def create_app(repository: SessionRepository | None = None) -> FastAPI:
    bootstrap_runtime_env()
    settings = GatewaySettings.from_env()

    app = FastAPI(title="virtual-huamn-api-gateway", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.settings = settings
    app.state.session_repository = repository or PostgresSessionRepository(settings)
    app.state.connection_registry = ConnectionRegistry()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post(
        "/api/session/create",
        response_model=SessionCreatedResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_session(payload: SessionCreateRequest, request: Request) -> Any:
        return create_session_record(request.app.state.session_repository, payload)

    @app.get(
        "/api/session/{session_id}/state",
        response_model=SessionStateResponse,
    )
    def get_session_state(session_id: str, request: Request) -> Any:
        return create_session_state_record(request.app.state.session_repository, session_id)

    @app.get(
        "/api/session/{session_id}/export",
        response_model=SessionExportResponse,
    )
    def get_session_export(session_id: str, request: Request) -> Any:
        return create_session_export_record(request.app.state.session_repository, session_id)

    @app.post(
        "/api/session/{session_id}/text",
        response_model=TextMessageAcceptedResponse,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def submit_text(
        session_id: str,
        payload: TextMessageSubmitRequest,
        request: Request,
    ) -> Any:
        repository = request.app.state.session_repository
        settings: GatewaySettings = request.app.state.settings
        result = create_text_message_record(repository, session_id, payload)
        if isinstance(result, JSONResponse):
            return result
        await dispatch_message_pipeline(request, session_id, result)
        return result["message"]

    @app.post(
        "/api/session/{session_id}/audio/chunk",
        response_model=AudioChunkAcceptedResponse,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def upload_audio_chunk(
        session_id: str,
        request: Request,
        chunk_seq: int,
        chunk_started_at_ms: int | None = None,
        duration_ms: int | None = None,
        is_final: bool = False,
    ) -> Any:
        repository = request.app.state.session_repository
        body = await request.body()
        result = create_audio_chunk_record(
            repository,
            session_id,
            content=body,
            chunk_seq=chunk_seq,
            chunk_started_at_ms=chunk_started_at_ms,
            duration_ms=duration_ms,
            is_final=is_final,
            mime_type=request.headers.get("content-type", "application/octet-stream"),
            metadata={"source": "web-shell"},
        )
        return result

    @app.post(
        "/api/session/{session_id}/audio/preview",
        response_model=TranscriptPartialAcceptedResponse,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def preview_audio(
        session_id: str,
        request: Request,
        preview_seq: int,
        recording_id: str,
        duration_ms: int | None = None,
    ) -> Any:
        repository = request.app.state.session_repository
        settings: GatewaySettings = request.app.state.settings
        body = await request.body()
        mime_type = request.headers.get("content-type", "application/octet-stream")
        result = create_audio_preview_record(
            repository,
            settings,
            session_id,
            content=body,
            duration_ms=duration_ms,
            mime_type=mime_type,
            preview_seq=preview_seq,
            recording_id=recording_id,
        )
        if isinstance(result, JSONResponse):
            return result

        partial_event = build_event_envelope(
            session=result["session"],
            event_type="transcript.partial",
            payload=result["transcript"],
            source_service="asr_service",
        )
        partial_event = jsonable_encoder(partial_event)
        await request.app.state.connection_registry.enqueue_event(session_id, partial_event)
        return result["transcript"]

    @app.post(
        "/api/session/{session_id}/audio/finalize",
        response_model=AudioFinalAcceptedResponse,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def finalize_audio(
        session_id: str,
        request: Request,
        duration_ms: int | None = None,
    ) -> Any:
        repository = request.app.state.session_repository
        settings: GatewaySettings = request.app.state.settings
        body = await request.body()
        mime_type = request.headers.get("content-type", "application/octet-stream")
        result = create_audio_message_record(
            repository,
            settings,
            session_id,
            content=body,
            duration_ms=duration_ms,
            mime_type=mime_type,
        )
        if isinstance(result, JSONResponse):
            return result

        await dispatch_message_pipeline(request, session_id, result)
        return {
            **result["message"],
            "media_id": result["audio"]["media_id"],
            "mime_type": mime_type,
            "duration_ms": duration_ms,
        }

    @app.websocket("/ws/session/{session_id}")
    async def session_realtime(websocket: WebSocket, session_id: str) -> None:
        repository = websocket.app.state.session_repository
        session = repository.get_session_summary(session_id)
        if session is None:
            await websocket.close(code=4404, reason="session_not_found")
            return

        registry: ConnectionRegistry = websocket.app.state.connection_registry
        await websocket.accept()
        await registry.add(session_id, websocket)
        await websocket.send_json(
            build_event_envelope(
                session=session,
                event_type="session.connection.ready",
                payload={
                    "connection_status": "connected",
                    "heartbeat_interval_ms": HEARTBEAT_INTERVAL_MS,
                    "reconnectable": True,
                },
            )
        )

        try:
            while True:
                client_message = await websocket.receive_json()
                if client_message.get("type") != "ping":
                    await websocket.send_json(
                        build_event_envelope(
                            session=session,
                            event_type="session.error",
                            payload={
                                "error_code": "unsupported_realtime_message",
                                "message": "Only heartbeat ping is supported in this step",
                            },
                        )
                    )
                    continue

                await registry.flush(session_id, websocket)
                await websocket.send_json(
                    build_event_envelope(
                        session=session,
                        event_type="session.heartbeat",
                        payload={
                            "connection_status": "alive",
                            "client_time": client_message.get("sent_at"),
                            "server_time": datetime.now(timezone.utc).isoformat(),
                            "heartbeat_interval_ms": HEARTBEAT_INTERVAL_MS,
                        },
                    )
                )
        except WebSocketDisconnect:
            return
        finally:
            await registry.remove(session_id, websocket)

    return app


app = create_app()
