from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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
DEFAULT_SESSION_EXPORT_DIR = "data/exports"
DEFAULT_PENDING_EVENT_TTL_SECONDS = 90
DEFAULT_MAX_PENDING_EVENTS_PER_SESSION = 64
MIME_EXTENSION_MAP = {
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/octet-stream": ".bin",
}


def normalize_mime_type(value: str | None) -> str:
    if not value:
        return "application/octet-stream"
    normalized = value.split(";", 1)[0].strip().lower()
    return normalized or "application/octet-stream"


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()

        if "=" in line:
            key, value = line.split("=", 1)
        elif ":" in line:
            key, value = line.split(":", 1)
        else:
            continue

        values[key.strip()] = value.strip().strip("'").strip('"')
    return values


def bootstrap_runtime_env() -> None:
    merged = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env")}
    for key, value in merged.items():
        current = os.environ.get(key)
        if current is None or not current.strip():
            os.environ[key] = value


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
    affect_service_base_url: str
    asr_service_base_url: str
    asr_timeout_seconds: float
    gateway_public_base_url: str = "http://127.0.0.1:8000"
    gateway_ws_path: str = "/ws"
    tts_service_base_url: str = "http://127.0.0.1:8040"
    media_storage_root: str = DEFAULT_MEDIA_STORAGE_ROOT
    session_export_dir: str = DEFAULT_SESSION_EXPORT_DIR

    def public_ws_url(self) -> str:
        parsed = urllib_parse.urlparse(self.gateway_public_base_url.rstrip("/"))
        scheme = "wss" if parsed.scheme == "https" else "ws"
        path = self.gateway_ws_path if self.gateway_ws_path.startswith("/") else f"/{self.gateway_ws_path}"
        return urllib_parse.urlunparse((scheme, parsed.netloc, path, "", "", ""))

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
            gateway_public_base_url=os.getenv("GATEWAY_PUBLIC_BASE_URL", "http://127.0.0.1:8000"),
            gateway_ws_path=os.getenv("GATEWAY_WS_PATH", "/ws"),
            cors_origins=parse_csv_env(
                os.getenv("GATEWAY_CORS_ORIGINS"),
                ["http://127.0.0.1:4173", "http://localhost:4173"],
            ),
            orchestrator_base_url=os.getenv("ORCHESTRATOR_BASE_URL")
            or f"http://127.0.0.1:{os.getenv('ORCHESTRATOR_PORT', '8010')}",
            orchestrator_timeout_seconds=float(
                os.getenv("ORCHESTRATOR_REQUEST_TIMEOUT_SECONDS", "60")
            ),
            affect_service_base_url=(
                os.getenv("AFFECT_SERVICE_BASE_URL")
                or f"http://"
                f"{'127.0.0.1' if os.getenv('AFFECT_SERVICE_HOST', '127.0.0.1') in {'0.0.0.0', '::'} else os.getenv('AFFECT_SERVICE_HOST', '127.0.0.1')}"
                f":{os.getenv('AFFECT_SERVICE_PORT', '8060')}"
            ),
            tts_service_base_url=(
                os.getenv("TTS_SERVICE_BASE_URL")
                or f"http://"
                f"{'127.0.0.1' if os.getenv('TTS_SERVICE_HOST', '127.0.0.1') in {'0.0.0.0', '::'} else os.getenv('TTS_SERVICE_HOST', '127.0.0.1')}"
                f":{os.getenv('TTS_SERVICE_PORT', '8040')}"
            ),
            asr_service_base_url=(
                f"http://"
                f"{'127.0.0.1' if os.getenv('ASR_SERVICE_HOST', '127.0.0.1') in {'0.0.0.0', '::'} else os.getenv('ASR_SERVICE_HOST', '127.0.0.1')}"
                f":{os.getenv('ASR_SERVICE_PORT', '8020')}"
            ),
            asr_timeout_seconds=float(os.getenv("ASR_TIMEOUT_SECONDS", "60")),
            media_storage_root=os.getenv("MEDIA_STORAGE_ROOT", DEFAULT_MEDIA_STORAGE_ROOT),
            session_export_dir=os.getenv("SESSION_EXPORT_DIR", DEFAULT_SESSION_EXPORT_DIR),
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
    metadata: dict[str, Any] = Field(default_factory=dict)
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


class VideoFrameAcceptedResponse(BaseModel):
    media_id: str
    session_id: str
    trace_id: str
    media_kind: Literal["video_frame"]
    storage_backend: Literal["local", "minio"]
    storage_path: str
    mime_type: str
    byte_size: int = Field(ge=0)
    frame_seq: int = Field(ge=1)
    captured_at_ms: int | None = Field(default=None, ge=0)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
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
    metadata: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime
    updated_at: datetime
    exported_at: datetime
    messages: list[MessageHistoryResponse] = Field(default_factory=list)
    stage_history: list[SessionStageHistoryResponse] = Field(default_factory=list)
    events: list[SystemEventHistoryResponse] = Field(default_factory=list)


class RuntimeConfigResponse(BaseModel):
    api_base_url: str
    ws_url: str
    affect_base_url: str
    tts_base_url: str
    default_avatar_id: str
    session_export_dir: str


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
    retrieval_context: dict[str, Any] = Field(default_factory=dict)
    avatar_style: str | None = None
    safety_flags: list[str] = Field(default_factory=list)


class DialogueSummaryRequest(BaseModel):
    session_id: str
    trace_id: str
    current_stage: Literal["engage", "assess", "intervene", "reassess", "handoff"]
    user_turn_count: int = Field(ge=1)
    previous_summary: str | None = None
    recent_messages: list[dict[str, Any]] = Field(default_factory=list)


class DialogueSummaryResponse(BaseModel):
    session_id: str
    trace_id: str
    summary_text: str
    current_stage: Literal["engage", "assess", "intervene", "reassess", "handoff"]
    user_turn_count: int = Field(ge=1)
    generated_at: datetime


class AffectSourceContext(BaseModel):
    origin: str
    dataset: str
    record_id: str
    note: str | None = None


class AffectLaneResult(BaseModel):
    status: Literal["ready", "pending", "offline"]
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)
    detail: str


class AffectFusionResult(BaseModel):
    emotion_state: str
    risk_level: Literal["low", "medium", "high"]
    confidence: float = Field(ge=0.0, le=1.0)
    conflict: bool
    conflict_reason: str | None = None
    detail: str


class AffectAnalyzeRequest(BaseModel):
    session_id: str
    trace_id: str | None = None
    current_stage: Literal["idle", "engage", "assess", "intervene", "reassess", "handoff"] = "idle"
    text_input: str | None = None
    last_source_kind: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    capture_state: dict[str, Any] = Field(default_factory=dict)
    source_context: AffectSourceContext | None = None


class AffectAnalyzeResponse(BaseModel):
    session_id: str
    trace_id: str | None = None
    current_stage: str
    generated_at: datetime
    source_context: AffectSourceContext
    text_result: AffectLaneResult
    audio_result: AffectLaneResult
    video_result: AffectLaneResult
    fusion_result: AffectFusionResult


SEQUENTIAL_DIALOGUE_STAGES = ["engage", "assess", "intervene", "reassess"]
DEFAULT_STAGE_NEXT_ACTION = {
    "engage": "ask_followup",
    "assess": "ask_followup",
    "intervene": "intervene",
    "reassess": "reassess",
    "handoff": "handoff",
}
SUMMARY_TRIGGER_TURN_INTERVAL = 3
SUMMARY_CONTEXT_LIMIT = 8
HIGH_RISK_RULE_PATTERNS: dict[str, tuple[str, ...]] = {
    "suicide_intent": (
        "自杀",
        "轻生",
        "想死",
        "不想活",
        "不想活了",
        "活着没意义",
        "结束生命",
        "结束自己",
        "去死",
        "死了算了",
        "kill myself",
        "end my life",
        "suicide",
        "don't want to live",
    ),
    "self_harm_intent": (
        "伤害自己",
        "伤害我自己",
        "割腕",
        "跳楼",
        "吞药",
        "上吊",
        "自残",
        "hurt myself",
        "self harm",
        "self-harm",
    ),
}
HIGH_RISK_RULE_KNOWLEDGE_REFS = ["handoff_emergency_support"]
HIGH_RISK_RULE_SAFETY_FLAGS = ["high_risk_rule_precheck", "needs_immediate_handoff"]
CLIENT_RUNTIME_EVENT_TYPES = {
    "tts.synthesized",
    "tts.playback.started",
    "tts.playback.ended",
    "avatar.command",
}


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


class ASRServicePreviewResponse(BaseModel):
    request_id: str
    session_id: str
    recording_id: str
    preview_seq: int = Field(ge=1)
    provider: str
    model: str
    transcript_text: str
    transcript_language: str | None = None
    duration_ms: int | None = Field(default=None, ge=0)
    confidence_mean: float | None = None
    confidence_available: bool = False
    audio: dict[str, Any] = Field(default_factory=dict)
    generated_at: datetime
    stream_created: bool = False
    stream_updated_at: datetime


class ASRServiceStreamReleaseResponse(BaseModel):
    request_id: str
    session_id: str
    recording_id: str
    released: bool
    reason: str
    released_at: datetime


class ASRStreamPreviewRequestError(RuntimeError):
    def __init__(
        self,
        *,
        status_code: int,
        error_code: str,
        message: str,
        retryable: bool = False,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.retryable = retryable
        self.details = details or {}


class ClientRuntimeEventRequest(BaseModel):
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    message_id: str | None = None

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, value: str) -> str:
        normalized = value.strip()
        if normalized not in CLIENT_RUNTIME_EVENT_TYPES:
            raise ValueError("unsupported client runtime event type")
        return normalized


class ClientRuntimeEventAcceptedResponse(BaseModel):
    event_id: str
    session_id: str
    trace_id: str
    message_id: str | None = None
    event_type: str
    source_service: str
    emitted_at: datetime


class SessionRepository(Protocol):
    def create_session(self, payload: SessionCreateRequest) -> dict[str, Any]:
        ...

    def get_session_summary(self, session_id: str) -> dict[str, Any] | None:
        ...

    def get_session_state(self, session_id: str) -> dict[str, Any] | None:
        ...

    def get_session_export(self, session_id: str) -> dict[str, Any] | None:
        ...

    def get_recent_dialogue_context(
        self,
        session_id: str,
        *,
        limit: int = 6,
        exclude_message_id: str | None = None,
    ) -> list[dict[str, Any]]:
        ...

    def count_user_turns(self, session_id: str) -> int:
        ...

    def update_dialogue_summary(
        self,
        session_id: str,
        summary_payload: dict[str, Any],
    ) -> dict[str, Any]:
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

    def create_video_frame_index(
        self,
        session_id: str,
        *,
        content: bytes,
        frame_seq: int,
        captured_at_ms: int | None,
        width: int | None,
        height: int | None,
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

    def delete_media_asset(self, media_id: str) -> None:
        ...

    def record_system_event(self, envelope: dict[str, Any]) -> None:
        ...


@dataclass
class PendingRealtimeEvent:
    envelope: dict[str, Any]
    enqueued_at: datetime


class ConnectionRegistry:
    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}
        self._pending_events: dict[str, list[PendingRealtimeEvent]] = {}

    def _prune_pending_events(self, session_id: str, *, now: datetime | None = None) -> None:
        queue = self._pending_events.get(session_id)
        if not queue:
            return
        reference_time = now or datetime.now(timezone.utc)
        ttl_cutoff = reference_time - timedelta(seconds=DEFAULT_PENDING_EVENT_TTL_SECONDS)
        queue[:] = [item for item in queue if item.enqueued_at >= ttl_cutoff]
        if len(queue) > DEFAULT_MAX_PENDING_EVENTS_PER_SESSION:
            queue[:] = queue[-DEFAULT_MAX_PENDING_EVENTS_PER_SESSION :]
        if not queue:
            del self._pending_events[session_id]

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
            if delivered:
                return

        queue = self._pending_events.setdefault(session_id, [])
        queue.append(PendingRealtimeEvent(envelope=envelope, enqueued_at=datetime.now(timezone.utc)))
        self._prune_pending_events(session_id)

    async def flush(self, session_id: str, websocket: WebSocket) -> None:
        self._prune_pending_events(session_id)
        queue = self._pending_events.get(session_id, [])
        if not queue:
            return

        while queue:
            pending_event = queue[0]
            await websocket.send_json(pending_event.envelope)
            queue.pop(0)

        if session_id in self._pending_events and not self._pending_events[session_id]:
            del self._pending_events[session_id]


def resolve_session_stage_transition(
    *,
    current_stage: str,
    proposed_stage: str,
    risk_level: str,
) -> tuple[str, str]:
    if current_stage == "handoff":
        return "handoff", "handoff_locked"

    if proposed_stage == "handoff" or risk_level == "high":
        return "handoff", "handoff_requested"

    if current_stage == proposed_stage:
        return current_stage, "stay_current_stage"

    if current_stage == "reassess" and proposed_stage == "intervene":
        return "intervene", "reassess_loopback"

    if current_stage not in SEQUENTIAL_DIALOGUE_STAGES:
        return "engage", "unknown_current_stage_reset"

    if proposed_stage not in SEQUENTIAL_DIALOGUE_STAGES:
        return current_stage, "invalid_proposed_stage"

    current_index = SEQUENTIAL_DIALOGUE_STAGES.index(current_stage)
    proposed_index = SEQUENTIAL_DIALOGUE_STAGES.index(proposed_stage)

    if proposed_index < current_index:
        return current_stage, "prevent_backward_jump"

    if proposed_index == current_index + 1:
        return proposed_stage, "accept_next_stage"

    if proposed_index > current_index + 1:
        return SEQUENTIAL_DIALOGUE_STAGES[current_index + 1], "prevent_forward_skip"

    return current_stage, "preserve_current_stage"


def resolve_next_action_for_stage(
    *,
    proposed_stage: str,
    resolved_stage: str,
    proposed_next_action: str,
) -> tuple[str, str]:
    if resolved_stage == proposed_stage:
        return proposed_next_action, "preserve_model_action"
    return DEFAULT_STAGE_NEXT_ACTION.get(resolved_stage, "ask_followup"), "sync_to_resolved_stage"


def extract_dialogue_summary(session: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(session, dict):
        return None
    metadata = session.get("metadata")
    if not isinstance(metadata, dict):
        return None
    summary = metadata.get("dialogue_summary")
    if not isinstance(summary, dict):
        return None
    if not str(summary.get("summary_text", "")).strip():
        return None
    return summary


def detect_high_risk_rule_match(content_text: str) -> dict[str, Any] | None:
    normalized = content_text.strip().lower()
    if not normalized:
        return None

    compact = "".join(normalized.split())
    matched_labels: list[str] = []
    matched_phrases: list[str] = []
    for label, patterns in HIGH_RISK_RULE_PATTERNS.items():
        for phrase in patterns:
            candidate = phrase.strip().lower()
            if not candidate:
                continue
            if candidate in normalized or candidate.replace(" ", "") in compact:
                matched_labels.append(label)
                matched_phrases.append(phrase)
                break

    if not matched_labels:
        return None

    return {
        "risk_level": "high",
        "matched_labels": matched_labels,
        "matched_phrases": matched_phrases,
    }


def build_high_risk_rule_reply(
    session: dict[str, Any],
    message: dict[str, Any],
    *,
    rule_match: dict[str, Any],
) -> DialogueReplyResponse:
    rule_hit_flags = [f"rule_hit:{label}" for label in rule_match.get("matched_labels", [])]
    return DialogueReplyResponse(
        session_id=session["session_id"],
        trace_id=session["trace_id"],
        message_id=f"msg_assistant_{uuid4().hex[:24]}",
        reply=(
            "你刚才提到可能伤害自己或不想继续活下去，这属于需要立刻认真对待的高风险情况。"
            "请现在马上联系身边可信任的人陪着你，并尽快联系辅导员、校医院、家人或当地急救/心理危机热线；"
            "如果已经有立即行动的打算，请直接拨打急救电话。"
        ),
        emotion="distressed",
        risk_level="high",
        stage="handoff",
        next_action="handoff",
        knowledge_refs=HIGH_RISK_RULE_KNOWLEDGE_REFS,
        avatar_style="calm_guarded",
        safety_flags=[*HIGH_RISK_RULE_SAFETY_FLAGS, *rule_hit_flags],
    )


def should_refresh_dialogue_summary(
    *,
    user_turn_count: int,
    existing_summary: dict[str, Any] | None,
) -> bool:
    if user_turn_count < SUMMARY_TRIGGER_TURN_INTERVAL:
        return False
    if user_turn_count % SUMMARY_TRIGGER_TURN_INTERVAL != 0:
        return False
    if not existing_summary:
        return True
    return existing_summary.get("user_turn_count") != user_turn_count


def truncate_summary_fragment(value: str, *, limit: int = 28) -> str:
    normalized = " ".join(str(value).split()).strip()
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit].rstrip()}..."


def classify_summary_fallback_reason(exc: Exception) -> str:
    message = str(exc).strip().lower()
    if "not configured" in message:
        return "not_configured"
    if isinstance(exc, TimeoutError) or "timed out" in message or "timeout" in message:
        return "timeout"
    if "invalid" in message or "json" in message:
        return "invalid_output"
    return "upstream_error"


def build_dialogue_summary_fallback(
    session: dict[str, Any],
    *,
    user_turn_count: int,
    previous_summary: str | None,
    recent_messages: list[dict[str, Any]],
) -> DialogueSummaryResponse:
    recent_user_fragments: list[str] = []
    seen_fragments: set[str] = set()
    for message in recent_messages:
        if message.get("role") != "user":
            continue
        fragment = truncate_summary_fragment(str(message.get("content_text", "")).strip(), limit=20)
        if not fragment or fragment in seen_fragments:
            continue
        seen_fragments.add(fragment)
        recent_user_fragments.append(fragment)

    recent_user_fragments = recent_user_fragments[-2:]
    parts: list[str] = []
    if previous_summary:
        parts.append(truncate_summary_fragment(previous_summary, limit=32))

    if len(recent_user_fragments) >= 2:
        parts.append(
            f"用户近期提到{recent_user_fragments[0]}，并继续围绕{recent_user_fragments[1]}"
        )
    elif len(recent_user_fragments) == 1:
        parts.append(f"用户近期提到{recent_user_fragments[0]}")
    else:
        parts.append("用户近期仍在描述当前困扰")

    summary_text = "；".join(dict.fromkeys(part for part in parts if part)).strip()
    summary_text = f"{summary_text}，当前进入 {session['stage']} 阶段。"

    return DialogueSummaryResponse(
        session_id=session["session_id"],
        trace_id=session["trace_id"],
        summary_text=summary_text,
        current_stage=session["stage"],
        user_turn_count=user_turn_count,
        generated_at=datetime.now(timezone.utc),
    )


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
        resolved_mime_type = normalize_mime_type(mime_type)
        configured_root = Path(self.media_storage_root)
        if configured_root.is_absolute():
            storage_root = configured_root
            storage_prefix = configured_root
        else:
            storage_root = ROOT / configured_root
            storage_prefix = ROOT

        extension = MIME_EXTENSION_MAP.get(resolved_mime_type, ".bin")
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
        resolved_mime_type = normalize_mime_type(mime_type)
        configured_root = Path(self.media_storage_root)
        if configured_root.is_absolute():
            storage_root = configured_root
            storage_prefix = configured_root
        else:
            storage_root = ROOT / configured_root
            storage_prefix = ROOT

        extension = MIME_EXTENSION_MAP.get(resolved_mime_type, ".bin")
        absolute_path = storage_root / "audio_final" / session_id / f"{media_id}{extension}"
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            storage_path = str(absolute_path.relative_to(storage_prefix))
        except ValueError:
            storage_path = str(absolute_path)
        return absolute_path, storage_path

    def _resolve_video_frame_path(
        self,
        session_id: str,
        media_id: str,
        frame_seq: int,
        mime_type: str,
    ) -> tuple[Path, str]:
        resolved_mime_type = normalize_mime_type(mime_type)
        configured_root = Path(self.media_storage_root)
        if configured_root.is_absolute():
            storage_root = configured_root
            storage_prefix = configured_root
        else:
            storage_root = ROOT / configured_root
            storage_prefix = ROOT

        extension = MIME_EXTENSION_MAP.get(resolved_mime_type, ".bin")
        absolute_path = storage_root / "video_frames" / session_id / f"{frame_seq:06d}_{media_id}{extension}"
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            storage_path = str(absolute_path.relative_to(storage_prefix))
        except ValueError:
            storage_path = str(absolute_path)
        return absolute_path, storage_path

    def _resolve_storage_path(self, storage_path: str) -> Path:
        candidate = Path(storage_path)
        if candidate.is_absolute():
            return candidate
        return ROOT / candidate

    @staticmethod
    def _delete_local_path(path: Path | None) -> None:
        if path is None:
            return
        try:
            if path.exists():
                path.unlink()
        except OSError:
            return

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
                    SELECT
                        session_id,
                        trace_id,
                        status,
                        stage,
                        record_id,
                        dataset,
                        canonical_role,
                        segment_id
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
                        submitted_at,
                        metadata
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
                    RETURNING
                        session_id,
                        trace_id,
                        status,
                        stage,
                        record_id,
                        dataset,
                        canonical_role,
                        segment_id,
                        updated_at
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
                        metadata,
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
                                    "record_id": payload.record_id,
                                    "dataset": payload.dataset,
                                    "canonical_role": payload.canonical_role,
                                    "segment_id": payload.segment_id,
                                }
                            ),
                            "emitted_at": now,
                        },
                    )

        if row is None:
            raise RuntimeError("session insert returned no row")
        return row

    def get_recent_dialogue_context(
        self,
        session_id: str,
        *,
        limit: int = 6,
        exclude_message_id: str | None = None,
    ) -> list[dict[str, Any]]:
        safe_limit = min(max(limit, 1), 10)
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                if exclude_message_id:
                    cur.execute(
                        """
                        SELECT
                            message_id,
                            role,
                            source_kind,
                            content_text,
                            metadata,
                            submitted_at
                        FROM messages
                        WHERE session_id = %s AND message_id <> %s
                        ORDER BY submitted_at DESC, created_at DESC
                        LIMIT %s
                        """,
                        (session_id, exclude_message_id, safe_limit),
                    )
                else:
                    cur.execute(
                        """
                        SELECT
                            message_id,
                            role,
                            source_kind,
                            content_text,
                            metadata,
                            submitted_at
                        FROM messages
                        WHERE session_id = %s
                        ORDER BY submitted_at DESC, created_at DESC
                        LIMIT %s
                        """,
                        (session_id, safe_limit),
                    )
                rows = cur.fetchall()

        history: list[dict[str, Any]] = []
        for row in reversed(rows):
            metadata = row.get("metadata") or {}
            history.append(
                {
                    "message_id": row["message_id"],
                    "role": row["role"],
                    "source_kind": row["source_kind"],
                    "content_text": row["content_text"],
                    "stage": metadata.get("stage"),
                    "submitted_at": row["submitted_at"],
                }
            )
        return history

    def get_session_summary(self, session_id: str) -> dict[str, Any] | None:
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        session_id,
                        trace_id,
                        status,
                        stage,
                        record_id,
                        dataset,
                        canonical_role,
                        segment_id,
                        metadata,
                        updated_at
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
                        metadata,
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
                        metadata,
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
            "metadata": session_row["metadata"] or {},
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

    def count_user_turns(self, session_id: str) -> int:
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(*) AS total
                    FROM messages
                    WHERE session_id = %s AND role = 'user'
                    """,
                    (session_id,),
                )
                row = cur.fetchone()
        return int(row["total"]) if row is not None else 0

    def update_dialogue_summary(
        self,
        session_id: str,
        summary_payload: dict[str, Any],
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT metadata
                    FROM sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                row = cur.fetchone()
                if row is None:
                    raise KeyError(session_id)

                session_metadata = dict(row["metadata"] or {})
                session_metadata["dialogue_summary"] = summary_payload

                cur.execute(
                    """
                    UPDATE sessions
                    SET metadata = %(metadata)s, updated_at = %(updated_at)s
                    WHERE session_id = %(session_id)s
                    RETURNING
                        session_id,
                        trace_id,
                        status,
                        stage,
                        record_id,
                        dataset,
                        canonical_role,
                        segment_id,
                        metadata,
                        updated_at
                    """,
                    {
                        "session_id": session_id,
                        "metadata": Jsonb(session_metadata),
                        "updated_at": now,
                    },
                )
                updated_row = cur.fetchone()

        if updated_row is None:
            raise RuntimeError("dialogue summary update returned no row")
        return dict(updated_row)

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
                    SELECT session_id, trace_id, stage
                    FROM sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                session_row = cur.fetchone()
                if session_row is None:
                    raise KeyError(session_id)

                resolved_stage, stage_machine_reason = resolve_session_stage_transition(
                    current_stage=session_row["stage"],
                    proposed_stage=payload.stage,
                    risk_level=payload.risk_level,
                )
                resolved_next_action, next_action_machine_reason = resolve_next_action_for_stage(
                    proposed_stage=payload.stage,
                    resolved_stage=resolved_stage,
                    proposed_next_action=payload.next_action,
                )
                assistant_metadata = {
                    "emotion": payload.emotion,
                    "risk_level": payload.risk_level,
                    "stage": resolved_stage,
                    "next_action": resolved_next_action,
                    "knowledge_refs": payload.knowledge_refs,
                    "retrieval_context": payload.retrieval_context,
                    "avatar_style": payload.avatar_style,
                    "safety_flags": payload.safety_flags,
                    "model_stage": payload.stage,
                    "model_next_action": payload.next_action,
                    "stage_before": session_row["stage"],
                    "stage_machine_reason": stage_machine_reason,
                    "next_action_machine_reason": next_action_machine_reason,
                }
                if "high_risk_rule_precheck" in payload.safety_flags:
                    assistant_metadata["risk_rule_precheck"] = True
                    assistant_metadata["risk_rule_flags"] = [
                        flag for flag in payload.safety_flags if flag.startswith("rule_hit:")
                    ]

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
                        submitted_at,
                        metadata
                    """,
                    {
                        "message_id": payload.message_id,
                        "session_id": session_id,
                        "trace_id": payload.trace_id,
                        "content_text": payload.reply,
                        "metadata": Jsonb(assistant_metadata),
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
                    RETURNING
                        session_id,
                        trace_id,
                        status,
                        stage,
                        record_id,
                        dataset,
                        canonical_role,
                        segment_id,
                        updated_at
                    """,
                    {
                        "session_id": session_id,
                        "stage": resolved_stage,
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
        resolved_mime_type = normalize_mime_type(mime_type)
        absolute_path: Path | None = None

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
                    mime_type=resolved_mime_type,
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

                try:
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
                            "mime_type": resolved_mime_type,
                            "duration_ms": duration_ms,
                            "byte_size": len(content),
                            "metadata": Jsonb(row_metadata),
                            "created_at": now,
                        },
                    )
                    row = cur.fetchone()
                except Exception:
                    self._delete_local_path(absolute_path)
                    raise

        if row is None:
            self._delete_local_path(absolute_path)
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
        resolved_mime_type = normalize_mime_type(mime_type)
        absolute_path: Path | None = None

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
                    mime_type=resolved_mime_type,
                )
                absolute_path.write_bytes(content)

                try:
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
                            "mime_type": resolved_mime_type,
                            "duration_ms": duration_ms,
                            "byte_size": len(content),
                            "metadata": Jsonb(metadata or {}),
                            "created_at": now,
                        },
                    )
                    row = cur.fetchone()
                except Exception:
                    self._delete_local_path(absolute_path)
                    raise

        if row is None:
            self._delete_local_path(absolute_path)
            raise RuntimeError("audio final insert returned no row")
        return dict(row)

    def create_video_frame_index(
        self,
        session_id: str,
        *,
        content: bytes,
        frame_seq: int,
        captured_at_ms: int | None,
        width: int | None,
        height: int | None,
        mime_type: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        media_id = f"media_{uuid4().hex[:24]}"
        resolved_mime_type = normalize_mime_type(mime_type)
        absolute_path: Path | None = None

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

                absolute_path, storage_path = self._resolve_video_frame_path(
                    session_id=session_id,
                    media_id=media_id,
                    frame_seq=frame_seq,
                    mime_type=resolved_mime_type,
                )
                absolute_path.write_bytes(content)

                row_metadata = dict(metadata or {})
                row_metadata.update(
                    {
                        "frame_seq": frame_seq,
                        "captured_at_ms": captured_at_ms,
                        "width": width,
                        "height": height,
                    }
                )

                try:
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
                            'video_frame',
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
                            byte_size,
                            created_at
                        """,
                        {
                            "media_id": media_id,
                            "session_id": session_id,
                            "trace_id": session_row["trace_id"],
                            "message_id": None,
                            "storage_path": storage_path,
                            "mime_type": resolved_mime_type,
                            "duration_ms": None,
                            "byte_size": len(content),
                            "metadata": Jsonb(row_metadata),
                            "created_at": now,
                        },
                    )
                    row = cur.fetchone()
                except Exception:
                    self._delete_local_path(absolute_path)
                    raise

        if row is None:
            self._delete_local_path(absolute_path)
            raise RuntimeError("video frame insert returned no row")

        return {
            **dict(row),
            "frame_seq": frame_seq,
            "captured_at_ms": captured_at_ms,
            "width": width,
            "height": height,
        }

    def delete_media_asset(self, media_id: str) -> None:
        storage_path: str | None = None
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT storage_path
                    FROM media_indexes
                    WHERE media_id = %s
                    """,
                    (media_id,),
                )
                row = cur.fetchone()
                if row is None:
                    return
                storage_path = row["storage_path"]
                cur.execute(
                    """
                    DELETE FROM media_indexes
                    WHERE media_id = %s
                    """,
                    (media_id,),
                )

        if not storage_path:
            return
        try:
            absolute_path = self._resolve_storage_path(storage_path)
            self._delete_local_path(absolute_path)
        except OSError:
            return

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
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "error_code": error_code,
        "message": message,
        "trace_id": trace_id or f"trace_error_{uuid4().hex[:24]}",
        "session_id": session_id,
        "retryable": retryable,
        "details": details or {},
    }


def bad_request_response(
    *,
    error_code: str,
    message: str,
    session_id: str | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=error_payload(
            error_code=error_code,
            message=message,
            session_id=session_id,
        ),
    )


def build_event_envelope(
    *,
    session: dict[str, Any],
    event_type: str,
    payload: dict[str, Any],
    message_id: str | None = None,
    source_service: str = "api_gateway",
) -> dict[str, Any]:
    merged_payload = dict(payload)
    for key in ("record_id", "dataset", "canonical_role", "segment_id"):
        value = session.get(key)
        if value and key not in merged_payload:
            merged_payload[key] = value
    return {
        "event_id": f"evt_{uuid4().hex[:24]}",
        "event_type": event_type,
        "schema_version": SCHEMA_VERSION,
        "source_service": source_service,
        "session_id": session["session_id"],
        "trace_id": session["trace_id"],
        "message_id": message_id,
        "emitted_at": datetime.now(timezone.utc).isoformat(),
        "payload": merged_payload,
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
    normalized_mime_type = normalize_mime_type(mime_type)
    if not content:
        return bad_request_response(
            error_code="audio_chunk_empty",
            message="Audio chunk body must not be empty",
            session_id=session_id,
        )
    if chunk_seq < 1:
        return bad_request_response(
            error_code="audio_chunk_invalid_seq",
            message="chunk_seq must be greater than or equal to 1",
            session_id=session_id,
        )
    if chunk_started_at_ms is not None and chunk_started_at_ms < 0:
        return bad_request_response(
            error_code="audio_chunk_invalid_started_at",
            message="chunk_started_at_ms must be greater than or equal to 0",
            session_id=session_id,
        )
    if duration_ms is not None and duration_ms < 0:
        return bad_request_response(
            error_code="audio_chunk_invalid_duration",
            message="duration_ms must be greater than or equal to 0",
            session_id=session_id,
        )

    try:
        return repository.create_audio_chunk_index(
            session_id,
            content=content,
            chunk_seq=chunk_seq,
            chunk_started_at_ms=chunk_started_at_ms,
            duration_ms=duration_ms,
            is_final=is_final,
            mime_type=normalized_mime_type,
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


def create_video_frame_record(
    repository: SessionRepository,
    session_id: str,
    *,
    content: bytes,
    frame_seq: int,
    captured_at_ms: int | None,
    width: int | None,
    height: int | None,
    mime_type: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | JSONResponse:
    normalized_mime_type = normalize_mime_type(mime_type)
    if not content:
        return bad_request_response(
            error_code="video_frame_empty",
            message="Video frame body must not be empty",
            session_id=session_id,
        )
    if frame_seq < 1:
        return bad_request_response(
            error_code="video_frame_invalid_seq",
            message="frame_seq must be greater than or equal to 1",
            session_id=session_id,
        )
    if captured_at_ms is not None and captured_at_ms < 0:
        return bad_request_response(
            error_code="video_frame_invalid_captured_at",
            message="captured_at_ms must be greater than or equal to 0",
            session_id=session_id,
        )
    if width is not None and width < 1:
        return bad_request_response(
            error_code="video_frame_invalid_width",
            message="width must be greater than or equal to 1",
            session_id=session_id,
        )
    if height is not None and height < 1:
        return bad_request_response(
            error_code="video_frame_invalid_height",
            message="height must be greater than or equal to 1",
            session_id=session_id,
        )

    try:
        result = repository.create_video_frame_index(
            session_id,
            content=content,
            frame_seq=frame_seq,
            captured_at_ms=captured_at_ms,
            width=width,
            height=height,
            mime_type=normalized_mime_type,
            metadata=metadata,
        )
        result["latest_video_frame_path"] = result["storage_path"]
        return result
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
                error_code="video_frame_store_failed",
                message="Failed to store video frame",
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
    normalized_mime_type = normalize_mime_type(mime_type)
    if not content:
        return bad_request_response(
            error_code="audio_final_empty",
            message="Audio finalize body must not be empty",
            session_id=session_id,
        )
    if duration_ms is not None and duration_ms < 0:
        return bad_request_response(
            error_code="audio_final_invalid_duration",
            message="duration_ms must be greater than or equal to 0",
            session_id=session_id,
        )

    try:
        return repository.create_audio_final_asset(
            session_id,
            content=content,
            duration_ms=duration_ms,
            mime_type=normalized_mime_type,
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


def resolve_local_output_path(root_path: str, filename: str) -> Path:
    configured_root = Path(root_path)
    output_root = configured_root if configured_root.is_absolute() else ROOT / configured_root
    output_root.mkdir(parents=True, exist_ok=True)
    return output_root / filename


def persist_session_export_snapshot(settings: GatewaySettings, payload: dict[str, Any]) -> Path:
    export_path = resolve_local_output_path(
        settings.session_export_dir,
        f"{payload['session_id']}.json",
    )
    export_path.write_text(
        json.dumps(jsonable_encoder(payload), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return export_path


def build_runtime_config_record(settings: GatewaySettings) -> RuntimeConfigResponse:
    return RuntimeConfigResponse(
        api_base_url=settings.gateway_public_base_url.rstrip("/"),
        ws_url=settings.public_ws_url(),
        affect_base_url=settings.affect_service_base_url.rstrip("/"),
        tts_base_url=settings.tts_service_base_url.rstrip("/"),
        default_avatar_id=settings.default_avatar_id,
        session_export_dir=settings.session_export_dir,
    )


def create_client_runtime_event_record(
    repository: SessionRepository,
    session_id: str,
    payload: ClientRuntimeEventRequest,
) -> ClientRuntimeEventAcceptedResponse | JSONResponse:
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

    envelope = jsonable_encoder(
        build_event_envelope(
            session=session,
            event_type=payload.event_type,
            payload=payload.payload,
            message_id=payload.message_id,
            source_service="web_client",
        )
    )
    repository.record_system_event(envelope)
    return ClientRuntimeEventAcceptedResponse.model_validate(envelope)


def open_internal_request(request: urllib_request.Request, *, timeout: float):
    opener = urllib_request.build_opener(urllib_request.ProxyHandler({}))
    return opener.open(request, timeout=timeout)


def bind_affect_media_metadata(message: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    bound_metadata = dict(metadata)
    message_metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}

    audio_storage_path = str(message_metadata.get("audio_storage_path") or "").strip()
    if audio_storage_path and not bound_metadata.get("audio_path"):
        bound_metadata["audio_path"] = audio_storage_path
    if audio_storage_path and not bound_metadata.get("audio_path_16k_mono"):
        bound_metadata["audio_path_16k_mono"] = audio_storage_path

    video_storage_path = str(message_metadata.get("latest_video_frame_path") or "").strip()
    if video_storage_path and not bound_metadata.get("video_frame_path"):
        bound_metadata["video_frame_path"] = video_storage_path
    if video_storage_path and not bound_metadata.get("image_path"):
        bound_metadata["image_path"] = video_storage_path

    return bound_metadata


def normalize_dialogue_reply_identity(
    payload: DialogueReplyResponse,
    *,
    session_id: str,
    trace_id: str,
) -> DialogueReplyResponse:
    return payload.model_copy(update={"session_id": session_id, "trace_id": trace_id})


def resolve_finalized_audio_duration_ms(
    requested_duration_ms: int | None,
    transcription: ASRServiceTranscriptionResponse,
) -> int | None:
    return requested_duration_ms if requested_duration_ms is not None else transcription.duration_ms


def request_dialogue_reply(
    settings: GatewaySettings,
    session: dict[str, Any],
    message: dict[str, Any],
    *,
    short_term_memory: list[dict[str, Any]] | None = None,
    dialogue_summary: dict[str, Any] | None = None,
    affect_snapshot: AffectAnalyzeResponse | None = None,
) -> DialogueReplyResponse:
    metadata = {
        "source_service": "api_gateway",
        "short_term_memory": short_term_memory or [],
        "dialogue_summary": dialogue_summary,
    }
    if affect_snapshot is not None:
        metadata["affect_snapshot"] = affect_snapshot.model_dump(mode="json")

    request_payload = DialogueReplyRequest(
        session_id=session["session_id"],
        trace_id=session["trace_id"],
        user_message_id=message["message_id"],
        content_text=message["content_text"],
        current_stage=session["stage"],
        metadata=metadata,
    )
    body = json.dumps(request_payload.model_dump(mode="json")).encode("utf-8")
    request = urllib_request.Request(
        url=f"{settings.orchestrator_base_url.rstrip('/')}/internal/dialogue/respond",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with open_internal_request(request, timeout=settings.orchestrator_timeout_seconds) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"orchestrator http {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"orchestrator unavailable: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("orchestrator returned invalid json") from exc

    try:
        payload = DialogueReplyResponse.model_validate(raw_payload)
    except ValidationError as exc:
        raise RuntimeError(f"invalid dialogue reply: {exc}") from exc
    return normalize_dialogue_reply_identity(
        payload,
        session_id=session["session_id"],
        trace_id=session["trace_id"],
    )


def request_affect_snapshot(
    settings: GatewaySettings,
    session: dict[str, Any],
    message: dict[str, Any],
) -> AffectAnalyzeResponse:
    session_metadata = session.get("metadata") if isinstance(session.get("metadata"), dict) else {}
    message_metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
    capture_state = (
        message_metadata.get("capture_state")
        if isinstance(message_metadata.get("capture_state"), dict)
        else {}
    )
    merged_metadata = dict(session_metadata or {})
    merged_metadata.update(message_metadata or {})
    merged_metadata = bind_affect_media_metadata(message, merged_metadata)
    merged_metadata.setdefault("source", message_metadata.get("source") or "api_gateway")

    request_payload = AffectAnalyzeRequest(
        session_id=session["session_id"],
        trace_id=session.get("trace_id"),
        current_stage=session.get("stage", "engage"),
        text_input=message.get("content_text"),
        last_source_kind=message.get("source_kind"),
        metadata=merged_metadata,
        capture_state=capture_state,
    )
    request = urllib_request.Request(
        url=f"{settings.affect_service_base_url.rstrip('/')}/internal/affect/analyze",
        data=json.dumps(request_payload.model_dump(mode="json")).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with open_internal_request(request, timeout=10) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"affect-service http {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"affect-service unavailable: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("affect-service returned invalid json") from exc

    try:
        return AffectAnalyzeResponse.model_validate(raw_payload)
    except ValidationError as exc:
        raise RuntimeError(f"invalid affect snapshot: {exc}") from exc


def request_dialogue_summary(
    settings: GatewaySettings,
    session: dict[str, Any],
    *,
    user_turn_count: int,
    previous_summary: str | None,
    recent_messages: list[dict[str, Any]],
) -> DialogueSummaryResponse:
    request_payload = DialogueSummaryRequest(
        session_id=session["session_id"],
        trace_id=session["trace_id"],
        current_stage=session["stage"],
        user_turn_count=user_turn_count,
        previous_summary=previous_summary,
        recent_messages=recent_messages,
    )
    body = json.dumps(request_payload.model_dump(mode="json")).encode("utf-8")
    request = urllib_request.Request(
        url=f"{settings.orchestrator_base_url.rstrip('/')}/internal/dialogue/summarize",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with open_internal_request(request, timeout=settings.orchestrator_timeout_seconds) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"orchestrator http {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"orchestrator unavailable: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("orchestrator returned invalid json") from exc

    try:
        return DialogueSummaryResponse.model_validate(raw_payload)
    except ValidationError as exc:
        raise RuntimeError(f"invalid dialogue summary: {exc}") from exc


def request_asr_transcription(
    settings: GatewaySettings,
    *,
    body: bytes,
    mime_type: str,
) -> ASRServiceTranscriptionResponse:
    normalized_mime_type = normalize_mime_type(mime_type)
    extension = MIME_EXTENSION_MAP.get(normalized_mime_type, ".bin")
    request = urllib_request.Request(
        url=(
            f"{settings.asr_service_base_url.rstrip('/')}/api/asr/transcribe?"
            f"{urllib_parse.urlencode({'filename': f'recording{extension}'})}"
        ),
        data=body,
        headers={"Content-Type": normalized_mime_type},
        method="POST",
    )

    try:
        with open_internal_request(request, timeout=settings.asr_timeout_seconds) as response:
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


def request_asr_stream_preview(
    settings: GatewaySettings,
    *,
    body: bytes,
    mime_type: str,
    session_id: str,
    recording_id: str,
    preview_seq: int,
) -> ASRServicePreviewResponse:
    normalized_mime_type = normalize_mime_type(mime_type)
    extension = MIME_EXTENSION_MAP.get(normalized_mime_type, ".bin")
    query = urllib_parse.urlencode(
        {
            "session_id": session_id,
            "recording_id": recording_id,
            "preview_seq": preview_seq,
            "filename": f"recording{extension}",
        }
    )
    request = urllib_request.Request(
        url=f"{settings.asr_service_base_url.rstrip('/')}/api/asr/stream/preview?{query}",
        data=body,
        headers={"Content-Type": normalized_mime_type},
        method="POST",
    )

    try:
        with open_internal_request(request, timeout=settings.asr_timeout_seconds) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        try:
            error_body = json.loads(detail) if detail else {}
        except json.JSONDecodeError:
            error_body = {}
        raise ASRStreamPreviewRequestError(
            status_code=exc.code,
            error_code=str(error_body.get("error_code") or "audio_preview_failed"),
            message=str(error_body.get("message") or f"asr stream preview http {exc.code}"),
            retryable=bool(error_body.get("retryable")) or exc.code >= 500,
            details=error_body.get("details") if isinstance(error_body.get("details"), dict) else None,
        ) from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"asr stream preview unavailable: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("asr stream preview returned invalid json") from exc

    try:
        return ASRServicePreviewResponse.model_validate(raw_payload)
    except ValidationError as exc:
        raise RuntimeError(f"invalid asr stream preview: {exc}") from exc


def release_asr_stream(
    settings: GatewaySettings,
    *,
    session_id: str,
    recording_id: str,
) -> ASRServiceStreamReleaseResponse:
    query = urllib_parse.urlencode({"session_id": session_id, "recording_id": recording_id})
    request = urllib_request.Request(
        url=f"{settings.asr_service_base_url.rstrip('/')}/api/asr/stream/release?{query}",
        data=b"",
        headers={"Content-Type": "application/octet-stream"},
        method="POST",
    )

    try:
        with open_internal_request(request, timeout=settings.asr_timeout_seconds) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"asr stream release http {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"asr stream release unavailable: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("asr stream release returned invalid json") from exc

    try:
        return ASRServiceStreamReleaseResponse.model_validate(raw_payload)
    except ValidationError as exc:
        raise RuntimeError(f"invalid asr stream release: {exc}") from exc


def create_audio_message_record(
    repository: SessionRepository,
    settings: GatewaySettings,
    session_id: str,
    *,
    content: bytes,
    duration_ms: int | None,
    mime_type: str,
    recording_id: str | None = None,
) -> dict[str, Any] | JSONResponse:
    normalized_mime_type = normalize_mime_type(mime_type)
    audio_asset = create_audio_finalize_asset_record(
        repository,
        session_id,
        content=content,
        duration_ms=duration_ms,
        mime_type=normalized_mime_type,
        metadata={"source": "web-shell"},
    )
    if isinstance(audio_asset, JSONResponse):
        return audio_asset

    try:
        transcription = request_asr_transcription(
            settings,
            body=content,
            mime_type=normalized_mime_type,
        )
    except RuntimeError as exc:
        cleanup_media_asset(repository, audio_asset["media_id"])
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
        cleanup_media_asset(repository, audio_asset["media_id"])
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=error_payload(
                error_code="audio_transcription_empty",
                message="ASR service returned an empty transcript",
                session_id=session_id,
                retryable=True,
            ),
        )

    if recording_id:
        try:
            release_asr_stream(settings, session_id=session_id, recording_id=recording_id)
        except RuntimeError:
            pass

    resolved_duration_ms = resolve_finalized_audio_duration_ms(duration_ms, transcription)

    audio_message_metadata = {
        "source": "audio_finalize",
        "audio_media_id": audio_asset["media_id"],
        "audio_mime_type": normalized_mime_type,
        "audio_duration_ms": resolved_duration_ms,
        "audio_storage_path": audio_asset["storage_path"],
        "asr_provider": transcription.provider,
        "asr_model": transcription.model,
        "transcript_language": transcription.transcript_language,
        "confidence_mean": transcription.confidence_mean,
        "confidence_available": transcription.confidence_available,
        "recording_id": recording_id,
    }

    try:
        result = repository.create_user_audio_message(
            session_id,
            content_text=transcript_text,
            metadata=audio_message_metadata,
        )
    except KeyError:
        cleanup_media_asset(repository, audio_asset["media_id"])
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_payload(
                error_code="session_not_found",
                message="Session not found",
                session_id=session_id,
            ),
        )
    except psycopg.Error:
        cleanup_media_asset(repository, audio_asset["media_id"])
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
    result["message"] = {
        **result["message"],
        "metadata": audio_message_metadata,
    }
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
    normalized_mime_type = normalize_mime_type(mime_type)
    if not content:
        return bad_request_response(
            error_code="audio_preview_empty",
            message="Audio preview body must not be empty",
            session_id=session_id,
        )
    if preview_seq < 1:
        return bad_request_response(
            error_code="audio_preview_invalid_seq",
            message="preview_seq must be greater than or equal to 1",
            session_id=session_id,
        )
    if duration_ms is not None and duration_ms < 0:
        return bad_request_response(
            error_code="audio_preview_invalid_duration",
            message="duration_ms must be greater than or equal to 0",
            session_id=session_id,
        )
    if not recording_id.strip():
        return bad_request_response(
            error_code="audio_preview_invalid_recording_id",
            message="recording_id must not be empty",
            session_id=session_id,
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
        transcription = request_asr_stream_preview(
            settings,
            body=content,
            mime_type=normalized_mime_type,
            session_id=session_id,
            recording_id=recording_id,
            preview_seq=preview_seq,
        )
    except ASRStreamPreviewRequestError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(
                error_code=exc.error_code,
                message=exc.message,
                session_id=session_id,
                retryable=exc.retryable,
                details=exc.details,
            ),
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


def maybe_refresh_dialogue_summary(
    repository: SessionRepository,
    settings: GatewaySettings,
    session_id: str,
    assistant_result: dict[str, Any],
) -> dict[str, Any] | None:
    user_turn_count = repository.count_user_turns(session_id)
    existing_summary = extract_dialogue_summary(repository.get_session_summary(session_id))
    if not should_refresh_dialogue_summary(
        user_turn_count=user_turn_count,
        existing_summary=existing_summary,
    ):
        return None

    previous_summary = (
        str(existing_summary.get("summary_text")).strip()
        if isinstance(existing_summary, dict) and existing_summary.get("summary_text")
        else None
    )
    recent_messages = repository.get_recent_dialogue_context(
        session_id,
        limit=SUMMARY_CONTEXT_LIMIT,
    )
    summary_source = "llm"
    summary_fallback_reason: str | None = None
    try:
        summary_response = request_dialogue_summary(
            settings,
            assistant_result["session"],
            user_turn_count=user_turn_count,
            previous_summary=previous_summary,
            recent_messages=recent_messages,
        )
    except RuntimeError as exc:
        summary_response = build_dialogue_summary_fallback(
            assistant_result["session"],
            user_turn_count=user_turn_count,
            previous_summary=previous_summary,
            recent_messages=recent_messages,
        )
        summary_source = "fallback"
        summary_fallback_reason = classify_summary_fallback_reason(exc)

    summary_payload = {
        **summary_response.model_dump(mode="json"),
        "summary_version": 1,
        "generated_from_message_id": assistant_result["message"]["message_id"],
        "summary_source": summary_source,
    }
    if summary_fallback_reason:
        summary_payload["summary_fallback_reason"] = summary_fallback_reason
    updated_session = repository.update_dialogue_summary(session_id, summary_payload)
    return {
        "session": updated_session,
        "summary": summary_payload,
    }


def cleanup_media_asset(repository: SessionRepository, media_id: str) -> None:
    try:
        repository.delete_media_asset(media_id)
    except Exception:
        return


def build_message_accepted_event(result: dict[str, Any]) -> dict[str, Any]:
    return jsonable_encoder(
        build_event_envelope(
            session=result["session"],
            event_type="message.accepted",
            payload=result["message"],
            message_id=result["message"]["message_id"],
        )
    )


def build_transcript_final_event(result: dict[str, Any]) -> dict[str, Any]:
    transcription = dict(result.get("transcription") or {})
    message_metadata = result["message"].get("metadata") if isinstance(result["message"].get("metadata"), dict) else {}
    payload = {
        "transcript_kind": "final",
        "text": result["message"]["content_text"],
        "language": transcription.get("transcript_language"),
        "confidence": transcription.get("confidence_mean"),
        "confidence_available": transcription.get("confidence_available", False),
        "duration_ms": message_metadata.get("audio_duration_ms"),
        "asr_engine": transcription.get("model"),
        "provider": transcription.get("provider"),
        "media_id": result["audio"]["media_id"],
        "mime_type": result["audio"]["mime_type"],
        "generated_at": transcription.get("generated_at"),
        "source_kind": result["message"].get("source_kind"),
        "message_id": result["message"].get("message_id"),
        "recording_id": message_metadata.get("recording_id"),
    }
    return jsonable_encoder(
        build_event_envelope(
            session=result["session"],
            event_type="transcript.final",
            payload=payload,
            message_id=result["message"]["message_id"],
            source_service="asr_service",
        )
    )


def build_knowledge_retrieved_event(
    result: dict[str, Any],
    dialogue_reply: DialogueReplyResponse,
) -> dict[str, Any] | None:
    retrieval_context = dialogue_reply.retrieval_context or {}
    source_ids = retrieval_context.get("source_ids")
    normalized_source_ids = (
        [str(item) for item in source_ids if str(item).strip()]
        if isinstance(source_ids, list)
        else []
    )
    retrieval_attempted = retrieval_context.get("retrieval_attempted") is True
    retrieval_status = str(retrieval_context.get("retrieval_status") or "").strip() or None
    error_message = str(retrieval_context.get("error_message") or "").strip() or None
    if not normalized_source_ids and not retrieval_attempted and retrieval_status is None:
        return None

    payload = {
        "source_ids": normalized_source_ids,
        "grounded_refs": list(dialogue_reply.knowledge_refs),
        "filters_applied": list(retrieval_context.get("filters_applied") or []),
        "candidate_count": retrieval_context.get("candidate_count"),
        "risk_level": dialogue_reply.risk_level,
        "stage": dialogue_reply.stage,
        "retrieval_attempted": retrieval_attempted,
        "retrieval_status": retrieval_status or ("succeeded" if normalized_source_ids else "not_requested"),
    }
    if error_message:
        payload["error_message"] = error_message
    return jsonable_encoder(
        build_event_envelope(
            session=result["session"],
            event_type="knowledge.retrieved",
            payload=payload,
            message_id=result["message"]["message_id"],
            source_service="orchestrator",
        )
    )


def build_message_followup_events(
    repository: SessionRepository,
    settings: GatewaySettings,
    session_id: str,
    result: dict[str, Any],
) -> list[dict[str, Any]]:
    persisted_session = repository.get_session_summary(session_id) or result["session"]
    request_session = {
        **result["session"],
        "trace_id": persisted_session.get("trace_id", result["session"]["trace_id"]),
        "status": persisted_session.get("status", result["session"]["status"]),
        "stage": persisted_session.get("stage", result["session"]["stage"]),
        "updated_at": persisted_session.get("updated_at", result["session"]["updated_at"]),
        "metadata": persisted_session.get("metadata", {}),
    }
    events: list[dict[str, Any]] = []

    rule_match = detect_high_risk_rule_match(result["message"].get("content_text", ""))
    affect_snapshot: AffectAnalyzeResponse | None = None

    try:
        reply_source_service = "orchestrator"
        if rule_match is not None:
            dialogue_reply = build_high_risk_rule_reply(
                request_session,
                result["message"],
                rule_match=rule_match,
            )
            reply_source_service = "api_gateway"
        else:
            try:
                affect_snapshot = request_affect_snapshot(
                    settings,
                    request_session,
                    result["message"],
                )
                repository.record_system_event(
                    jsonable_encoder(
                        build_event_envelope(
                            session=result["session"],
                            event_type="affect.snapshot",
                            payload=affect_snapshot.model_dump(mode="json"),
                            message_id=result["message"]["message_id"],
                            source_service="affect_service",
                        )
                    )
                )
            except RuntimeError as exc:
                affect_snapshot = None
                affect_error_event = jsonable_encoder(
                    build_event_envelope(
                        session=result["session"],
                        event_type="session.error",
                        payload=error_payload(
                            error_code="affect_snapshot_failed",
                            message=str(exc),
                            trace_id=result["session"]["trace_id"],
                            session_id=session_id,
                            retryable=True,
                            details={
                                "operation": "request_affect_snapshot",
                                "message_id": result["message"]["message_id"],
                            },
                        ),
                        message_id=result["message"]["message_id"],
                        source_service="api_gateway",
                    )
                )
                repository.record_system_event(affect_error_event)
                events.append(affect_error_event)
            dialogue_reply = request_dialogue_reply(
                settings,
                request_session,
                result["message"],
                short_term_memory=repository.get_recent_dialogue_context(
                    session_id,
                    limit=6,
                    exclude_message_id=result["message"]["message_id"],
                ),
                dialogue_summary=extract_dialogue_summary(request_session),
                affect_snapshot=affect_snapshot,
            )
        retrieval_event = build_knowledge_retrieved_event(result, dialogue_reply)
        if retrieval_event is not None:
            repository.record_system_event(retrieval_event)
            events.append(retrieval_event)
        assistant_result = repository.create_assistant_dialogue_message(session_id, dialogue_reply)
        assistant_metadata = assistant_result["message"].get("metadata", {})
        affect_payload: dict[str, Any] = {}
        if affect_snapshot is not None:
            affect_payload = {
                "affect_conflict": affect_snapshot.fusion_result.conflict,
                "affect_conflict_reason": affect_snapshot.fusion_result.conflict_reason,
                "affect_emotion_state": affect_snapshot.fusion_result.emotion_state,
                "affect_risk_level": affect_snapshot.fusion_result.risk_level,
                "affect_record_id": affect_snapshot.source_context.record_id,
            }
        dialogue_event = jsonable_encoder(
            build_event_envelope(
                session=assistant_result["session"],
                event_type="dialogue.reply",
                payload={
                    **dialogue_reply.model_dump(mode="json"),
                    **affect_payload,
                    "session_id": assistant_result["session"]["session_id"],
                    "trace_id": assistant_result["session"]["trace_id"],
                    "stage": assistant_result["session"]["stage"],
                    "next_action": assistant_metadata.get("next_action", dialogue_reply.next_action),
                    "submitted_at": assistant_result["message"]["submitted_at"],
                    "stage_before": assistant_metadata.get("stage_before"),
                    "stage_requested": assistant_metadata.get("model_stage"),
                    "stage_machine_reason": assistant_metadata.get("stage_machine_reason"),
                    "next_action_requested": assistant_metadata.get("model_next_action"),
                    "next_action_machine_reason": assistant_metadata.get(
                        "next_action_machine_reason"
                    ),
                    "retrieval_context": assistant_metadata.get("retrieval_context", {}),
                    "rule_precheck_triggered": assistant_metadata.get("risk_rule_precheck", False),
                    "rule_match_flags": assistant_metadata.get("risk_rule_flags", []),
                },
                message_id=dialogue_reply.message_id,
                source_service=reply_source_service,
            )
        )
        repository.record_system_event(dialogue_event)
        events.append(dialogue_event)

        try:
            summary_result = maybe_refresh_dialogue_summary(
                repository,
                settings,
                session_id,
                assistant_result,
            )
            if summary_result is not None:
                summary_event = jsonable_encoder(
                    build_event_envelope(
                        session=summary_result["session"],
                        event_type="dialogue.summary.updated",
                        payload=summary_result["summary"],
                        message_id=summary_result["summary"]["generated_from_message_id"],
                        source_service="orchestrator",
                    )
                )
                repository.record_system_event(summary_event)
                events.append(summary_event)
        except (KeyError, psycopg.Error, RuntimeError) as exc:
            summary_error_event = jsonable_encoder(
                build_event_envelope(
                    session=assistant_result["session"],
                    event_type="session.error",
                    payload=error_payload(
                        error_code="dialogue_summary_refresh_failed",
                        message=str(exc),
                        trace_id=assistant_result["session"]["trace_id"],
                        session_id=session_id,
                        retryable=True,
                        details={
                            "operation": "dialogue_summary_refresh",
                            "generated_from_message_id": assistant_result["message"]["message_id"],
                        },
                    ),
                    message_id=assistant_result["message"]["message_id"],
                    source_service="api_gateway",
                )
            )
            repository.record_system_event(summary_error_event)
            events.append(summary_error_event)
    except (KeyError, psycopg.Error, RuntimeError) as exc:
        error_event = jsonable_encoder(
            build_event_envelope(
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
        )
        repository.record_system_event(error_event)
        events.append(error_event)

    return events


async def dispatch_message_pipeline(
    request_or_app: Request | FastAPI | Any,
    session_id: str,
    result: dict[str, Any],
) -> None:
    app = request_or_app.app if hasattr(request_or_app, "app") else request_or_app
    repository = app.state.session_repository
    settings: GatewaySettings = app.state.settings

    accepted_event = build_message_accepted_event(result)
    try:
        await asyncio.to_thread(repository.record_system_event, accepted_event)
        await app.state.connection_registry.enqueue_event(session_id, accepted_event)
        events = await asyncio.to_thread(
            build_message_followup_events,
            repository,
            settings,
            session_id,
            result,
        )
    except Exception as exc:
        events = [
            jsonable_encoder(
                build_event_envelope(
                    session=result["session"],
                    event_type="session.error",
                    payload=error_payload(
                        error_code="dialogue_pipeline_failed",
                        message=str(exc),
                        trace_id=result["session"]["trace_id"],
                        session_id=session_id,
                        retryable=True,
                    ),
                    source_service="api_gateway",
                )
            )
        ]
        await asyncio.to_thread(repository.record_system_event, events[0])

    for envelope in events:
        await app.state.connection_registry.enqueue_event(session_id, envelope)


def schedule_background_task(app: FastAPI, coro: Any, *, task_name: str) -> asyncio.Task[Any]:
    background_tasks: set[asyncio.Task[Any]] = getattr(app.state, "background_tasks", set())
    task_ref: dict[str, asyncio.Task[Any]] = {}

    async def managed_coro() -> Any:
        try:
            return await coro
        finally:
            task = task_ref.get("task")
            if task is not None:
                background_tasks.discard(task)
                app.state.background_tasks = background_tasks

    task = asyncio.create_task(managed_coro(), name=task_name)
    task_ref["task"] = task
    background_tasks.add(task)
    app.state.background_tasks = background_tasks

    def finalize(completed_task: asyncio.Task[Any]) -> None:
        try:
            completed_task.result()
        except asyncio.CancelledError:
            return
        except Exception:
            return

    task.add_done_callback(finalize)
    return task


async def shutdown_background_tasks(app: FastAPI | Any) -> None:
    background_tasks: set[asyncio.Task[Any]] = getattr(app.state, "background_tasks", set())
    if not background_tasks:
        return
    tasks = list(background_tasks)
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    background_tasks.clear()
    app.state.background_tasks = background_tasks


def create_app(repository: SessionRepository | None = None) -> FastAPI:
    bootstrap_runtime_env()
    settings = GatewaySettings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await shutdown_background_tasks(app)

    app = FastAPI(title="virtual-huamn-api-gateway", version="0.1.0", lifespan=lifespan)
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
    app.state.background_tasks = set()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/runtime/config", response_model=RuntimeConfigResponse)
    def get_runtime_config(request: Request) -> RuntimeConfigResponse:
        return build_runtime_config_record(request.app.state.settings)

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
        result = create_session_export_record(
            request.app.state.session_repository,
            session_id,
        )
        if isinstance(result, JSONResponse):
            return result
        try:
            persist_session_export_snapshot(request.app.state.settings, result)
        except OSError as exc:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=error_payload(
                    error_code="session_export_snapshot_failed",
                    message=str(exc),
                    trace_id=result.get("trace_id"),
                    session_id=session_id,
                    retryable=True,
                    details={
                        "operation": "persist_session_export_snapshot",
                        "session_export_dir": request.app.state.settings.session_export_dir,
                        "exception_type": type(exc).__name__,
                    },
                ),
            )
        return result

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
        result = await asyncio.to_thread(create_text_message_record, repository, session_id, payload)
        if isinstance(result, JSONResponse):
            return result
        schedule_background_task(
            request.app,
            dispatch_message_pipeline(request.app, session_id, result),
            task_name=f"dispatch_message_pipeline:{session_id}:text",
        )
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
        result = await asyncio.to_thread(
            create_audio_chunk_record,
            repository,
            session_id,
            content=body,
            chunk_seq=chunk_seq,
            chunk_started_at_ms=chunk_started_at_ms,
            duration_ms=duration_ms,
            is_final=is_final,
            mime_type=normalize_mime_type(
                request.headers.get("content-type", "application/octet-stream")
            ),
            metadata={"source": "web-shell"},
        )
        return result

    @app.post(
        "/api/session/{session_id}/video/frame",
        response_model=VideoFrameAcceptedResponse,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def upload_video_frame(
        session_id: str,
        request: Request,
        frame_seq: int,
        captured_at_ms: int | None = None,
        width: int | None = None,
        height: int | None = None,
    ) -> Any:
        repository = request.app.state.session_repository
        body = await request.body()
        result = await asyncio.to_thread(
            create_video_frame_record,
            repository,
            session_id,
            content=body,
            frame_seq=frame_seq,
            captured_at_ms=captured_at_ms,
            width=width,
            height=height,
            mime_type=normalize_mime_type(
                request.headers.get("content-type", "application/octet-stream")
            ),
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
        mime_type = normalize_mime_type(request.headers.get("content-type", "application/octet-stream"))
        result = await asyncio.to_thread(
            create_audio_preview_record,
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
        await asyncio.to_thread(request.app.state.session_repository.record_system_event, partial_event)
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
        recording_id: str | None = None,
    ) -> Any:
        repository = request.app.state.session_repository
        settings: GatewaySettings = request.app.state.settings
        body = await request.body()
        mime_type = normalize_mime_type(request.headers.get("content-type", "application/octet-stream"))
        result = await asyncio.to_thread(
            create_audio_message_record,
            repository,
            settings,
            session_id,
            content=body,
            duration_ms=duration_ms,
            mime_type=mime_type,
            recording_id=recording_id,
        )
        if isinstance(result, JSONResponse):
            return result

        transcript_event = build_transcript_final_event(result)
        await asyncio.to_thread(request.app.state.session_repository.record_system_event, transcript_event)
        await request.app.state.connection_registry.enqueue_event(session_id, transcript_event)
        schedule_background_task(
            request.app,
            dispatch_message_pipeline(request.app, session_id, result),
            task_name=f"dispatch_message_pipeline:{session_id}:audio",
        )
        return {
            **result["message"],
            "media_id": result["audio"]["media_id"],
            "mime_type": result["audio"]["mime_type"],
            "duration_ms": result["message"].get("metadata", {}).get("audio_duration_ms"),
        }

    @app.post(
        "/api/session/{session_id}/runtime-event",
        response_model=ClientRuntimeEventAcceptedResponse,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def record_runtime_event(
        session_id: str,
        payload: ClientRuntimeEventRequest,
        request: Request,
    ) -> Any:
        repository = request.app.state.session_repository
        result = await asyncio.to_thread(
            create_client_runtime_event_record,
            repository,
            session_id,
            payload,
        )
        return result

    @app.websocket("/ws/session/{session_id}")
    async def session_realtime(websocket: WebSocket, session_id: str) -> None:
        repository = websocket.app.state.session_repository
        await websocket.accept()
        session = repository.get_session_summary(session_id)
        if session is None:
            await websocket.close(code=4404, reason="session_not_found")
            return

        registry: ConnectionRegistry = websocket.app.state.connection_registry
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
