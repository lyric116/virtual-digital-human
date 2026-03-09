from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
import os
from pathlib import Path
from typing import Any, Literal
from urllib import error as urllib_error
from urllib import request as urllib_request

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, ValidationError


ROOT = Path(__file__).resolve().parents[2]


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
        os.environ.setdefault(key, value)


@dataclass
class OrchestratorSettings:
    orchestrator_host: str
    orchestrator_port: int
    dialogue_service_base_url: str
    dialogue_service_timeout_seconds: float

    @classmethod
    def from_env(cls) -> "OrchestratorSettings":
        return cls(
            orchestrator_host=os.getenv("ORCHESTRATOR_HOST", "0.0.0.0"),
            orchestrator_port=int(os.getenv("ORCHESTRATOR_PORT", "8010")),
            dialogue_service_base_url=os.getenv("DIALOGUE_SERVICE_BASE_URL", "http://127.0.0.1:8030"),
            dialogue_service_timeout_seconds=float(
                os.getenv("ORCHESTRATOR_REQUEST_TIMEOUT_SECONDS", "60")
            ),
        )


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


def request_dialogue_reply(
    settings: OrchestratorSettings,
    payload: DialogueReplyRequest,
) -> DialogueReplyResponse:
    request = urllib_request.Request(
        url=f"{settings.dialogue_service_base_url.rstrip('/')}/internal/dialogue/respond",
        data=json.dumps(payload.model_dump()).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib_request.build_opener(urllib_request.ProxyHandler({}))

    try:
        with opener.open(request, timeout=settings.dialogue_service_timeout_seconds) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"dialogue-service http {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"dialogue-service unavailable: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("dialogue-service returned invalid json") from exc

    try:
        return DialogueReplyResponse.model_validate(raw_payload)
    except ValidationError as exc:
        raise RuntimeError(f"invalid dialogue reply: {exc}") from exc


def request_dialogue_summary(
    settings: OrchestratorSettings,
    payload: DialogueSummaryRequest,
) -> DialogueSummaryResponse:
    request = urllib_request.Request(
        url=f"{settings.dialogue_service_base_url.rstrip('/')}/internal/dialogue/summarize",
        data=json.dumps(payload.model_dump(mode="json")).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib_request.build_opener(urllib_request.ProxyHandler({}))

    try:
        with opener.open(request, timeout=settings.dialogue_service_timeout_seconds) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"dialogue-service http {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"dialogue-service unavailable: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("dialogue-service returned invalid json") from exc

    try:
        return DialogueSummaryResponse.model_validate(raw_payload)
    except ValidationError as exc:
        raise RuntimeError(f"invalid dialogue summary: {exc}") from exc


def create_app() -> FastAPI:
    bootstrap_runtime_env()
    settings = OrchestratorSettings.from_env()

    app = FastAPI(title="virtual-huamn-orchestrator", version="0.1.0")
    app.state.settings = settings

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/internal/dialogue/respond", response_model=DialogueReplyResponse)
    def respond(payload: DialogueReplyRequest) -> DialogueReplyResponse:
        try:
            return request_dialogue_reply(settings, payload)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @app.post("/internal/dialogue/summarize", response_model=DialogueSummaryResponse)
    def summarize(payload: DialogueSummaryRequest) -> DialogueSummaryResponse:
        try:
            return request_dialogue_summary(settings, payload)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return app


app = create_app()
