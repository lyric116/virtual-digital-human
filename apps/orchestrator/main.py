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
        current = os.environ.get(key)
        if current is None or not current.strip():
            os.environ[key] = value


@dataclass
class OrchestratorSettings:
    orchestrator_host: str
    orchestrator_port: int
    rag_service_base_url: str
    dialogue_service_base_url: str
    dialogue_service_timeout_seconds: float

    @classmethod
    def from_env(cls) -> "OrchestratorSettings":
        return cls(
            orchestrator_host=os.getenv("ORCHESTRATOR_HOST", "0.0.0.0"),
            orchestrator_port=int(os.getenv("ORCHESTRATOR_PORT", "8010")),
            rag_service_base_url=os.getenv("RAG_SERVICE_BASE_URL", "http://127.0.0.1:8070"),
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
    retrieval_context: dict[str, Any] = Field(default_factory=dict)
    avatar_style: str | None = None
    safety_flags: list[str] = Field(default_factory=list)


class RetrievedKnowledgeCard(BaseModel):
    source_id: str
    id: str
    title: str
    category: str
    summary: str
    score: float
    stage: list[str] = Field(default_factory=list)
    risk_level: list[str] = Field(default_factory=list)
    emotion: list[str] = Field(default_factory=list)
    recommended_phrases: list[str] = Field(default_factory=list)
    followup_questions: list[str] = Field(default_factory=list)
    contraindications: list[str] = Field(default_factory=list)
    source: str


class RAGRetrieveRequest(BaseModel):
    session_id: str
    trace_id: str
    query_text: str
    current_stage: Literal["engage", "assess", "intervene", "reassess", "handoff"]
    risk_level: Literal["low", "medium", "high"] | None = None
    emotion: str | None = None
    top_k: int = Field(default=3, ge=1, le=5)


class RAGRetrieveResponse(BaseModel):
    session_id: str
    trace_id: str | None = None
    query_text: str
    current_stage: str | None = None
    risk_level: str | None = None
    emotion: str | None = None
    top_k: int
    generated_at: datetime
    index_card_count: int
    candidate_count: int
    filters_applied: list[str] = Field(default_factory=list)
    results: list[RetrievedKnowledgeCard] = Field(default_factory=list)


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
    enriched_payload = attach_rag_context(settings, payload)
    request = urllib_request.Request(
        url=f"{settings.dialogue_service_base_url.rstrip('/')}/internal/dialogue/respond",
        data=json.dumps(enriched_payload.model_dump()).encode("utf-8"),
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


def extract_rag_risk_level(payload: DialogueReplyRequest) -> str | None:
    metadata = payload.metadata if isinstance(payload.metadata, dict) else {}
    explicit = str(metadata.get("rag_risk_level_hint") or "").strip()
    if explicit in {"low", "medium", "high"}:
        return explicit

    affect_snapshot = metadata.get("affect_snapshot")
    if isinstance(affect_snapshot, dict):
        fusion_result = affect_snapshot.get("fusion_result")
        if isinstance(fusion_result, dict):
            risk_level = str(fusion_result.get("risk_level") or "").strip()
            if risk_level in {"low", "medium", "high"}:
                return risk_level
    return None


def extract_rag_emotion(payload: DialogueReplyRequest) -> str | None:
    metadata = payload.metadata if isinstance(payload.metadata, dict) else {}
    explicit = str(metadata.get("rag_emotion_hint") or "").strip()
    if explicit:
        return explicit

    affect_snapshot = metadata.get("affect_snapshot")
    if isinstance(affect_snapshot, dict):
        text_result = affect_snapshot.get("text_result")
        if isinstance(text_result, dict):
            label = str(text_result.get("label") or "").strip()
            if label:
                return label
        fusion_result = affect_snapshot.get("fusion_result")
        if isinstance(fusion_result, dict):
            emotion_state = str(fusion_result.get("emotion_state") or "").strip()
            if emotion_state:
                return emotion_state
    return None


def request_rag_cards(
    settings: OrchestratorSettings,
    payload: DialogueReplyRequest,
) -> RAGRetrieveResponse:
    rag_request = RAGRetrieveRequest(
        session_id=payload.session_id,
        trace_id=payload.trace_id,
        query_text=payload.content_text,
        current_stage=payload.current_stage,
        risk_level=extract_rag_risk_level(payload),
        emotion=extract_rag_emotion(payload),
    )
    request = urllib_request.Request(
        url=f"{settings.rag_service_base_url.rstrip('/')}/internal/rag/retrieve",
        data=json.dumps(rag_request.model_dump(mode='json')).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib_request.build_opener(urllib_request.ProxyHandler({}))

    try:
        with opener.open(request, timeout=settings.dialogue_service_timeout_seconds) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"rag-service http {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"rag-service unavailable: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("rag-service returned invalid json") from exc

    try:
        return RAGRetrieveResponse.model_validate(raw_payload)
    except ValidationError as exc:
        raise RuntimeError(f"invalid rag response: {exc}") from exc


def attach_rag_context(
    settings: OrchestratorSettings,
    payload: DialogueReplyRequest,
) -> DialogueReplyRequest:
    metadata = dict(payload.metadata or {})
    metadata["knowledge_retrieval_attempted"] = True
    try:
        rag_response = request_rag_cards(settings, payload)
    except RuntimeError as exc:
        metadata["knowledge_retrieval_status"] = "failed"
        metadata["knowledge_retrieval_error_message"] = str(exc)
        return payload.model_copy(update={"metadata": metadata})

    metadata["knowledge_cards"] = [card.model_dump(mode="json") for card in rag_response.results]
    metadata["knowledge_filters_applied"] = rag_response.filters_applied
    metadata["knowledge_candidate_count"] = rag_response.candidate_count
    metadata["knowledge_retrieval_status"] = "succeeded" if rag_response.results else "empty"
    metadata.pop("knowledge_retrieval_error_message", None)

    return payload.model_copy(update={"metadata": metadata})


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
