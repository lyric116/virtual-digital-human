from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, field_validator


ROOT = Path(__file__).resolve().parents[2]
ALLOWED_INPUT_MODES = {"text", "audio", "video"}


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


class SessionRepository(Protocol):
    def create_session(self, payload: SessionCreateRequest) -> dict[str, Any]:
        ...


class PostgresSessionRepository:
    def __init__(self, settings: GatewaySettings):
        self.database_url = settings.database_url
        self.default_avatar_id = settings.default_avatar_id

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

        if row is None:
            raise RuntimeError("session insert returned no row")
        return row


def error_payload(*, error_code: str, message: str, trace_id: str | None = None) -> dict[str, Any]:
    return {
        "error_code": error_code,
        "message": message,
        "trace_id": trace_id or f"trace_error_{uuid4().hex[:24]}",
        "session_id": None,
        "retryable": False,
        "details": {},
    }


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

    return app


app = create_app()
