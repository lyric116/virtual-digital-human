from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator


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
class DialogueServiceSettings:
    dialogue_service_host: str
    dialogue_service_port: int
    llm_provider: str
    llm_base_url: str
    llm_api_key: str
    llm_model: str
    llm_timeout_seconds: float
    llm_context_window: int
    dialogue_force_failure_mode: str

    @classmethod
    def from_env(cls) -> "DialogueServiceSettings":
        return cls(
            dialogue_service_host=os.getenv("DIALOGUE_SERVICE_HOST", "0.0.0.0"),
            dialogue_service_port=int(os.getenv("DIALOGUE_SERVICE_PORT", "8030")),
            llm_provider=os.getenv("LLM_PROVIDER", "openai_compatible"),
            llm_base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
            llm_api_key=os.getenv("LLM_API_KEY", ""),
            llm_model=os.getenv("LLM_MODEL", "set-your-llm-model"),
            llm_timeout_seconds=float(os.getenv("LLM_TIMEOUT_SECONDS", "60")),
            llm_context_window=int(os.getenv("LLM_CONTEXT_WINDOW", "8192")),
            dialogue_force_failure_mode=os.getenv("DIALOGUE_FORCE_FAILURE_MODE", "").strip(),
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


class KnowledgeCardContext(BaseModel):
    source_id: str
    title: str
    category: str
    summary: str
    recommended_phrases: list[str] = Field(default_factory=list)
    followup_questions: list[str] = Field(default_factory=list)
    contraindications: list[str] = Field(default_factory=list)
    score: float | None = None


class RetrievalContext(BaseModel):
    source_ids: list[str] = Field(default_factory=list)
    filters_applied: list[str] = Field(default_factory=list)
    candidate_count: int | None = Field(default=None, ge=0)


class LLMDialogueFields(BaseModel):
    reply: str
    emotion: str
    risk_level: Literal["low", "medium", "high"]
    stage: Literal["engage", "assess", "intervene", "reassess", "handoff"]
    next_action: str
    knowledge_refs: list[str] = Field(default_factory=list)
    avatar_style: str | None = None
    safety_flags: list[str] = Field(default_factory=list)

    @field_validator("knowledge_refs", "safety_flags", mode="before")
    @classmethod
    def normalize_string_lists(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            stripped = value.strip()
            return [stripped] if stripped else []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        raise TypeError("expected string or list of strings")

    @field_validator("avatar_style", mode="before")
    @classmethod
    def normalize_avatar_style(cls, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None


class LLMSummaryFields(BaseModel):
    summary_text: str

    @field_validator("summary_text")
    @classmethod
    def normalize_summary_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("summary_text must not be empty")
        return normalized


FALLBACK_NEXT_ACTION = {
    "engage": "ask_followup",
    "assess": "ask_followup",
    "intervene": "intervene",
    "reassess": "reassess",
    "handoff": "handoff",
}


def extract_affect_conflict(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(metadata, dict):
        return None

    snapshot = metadata.get("affect_snapshot")
    if not isinstance(snapshot, dict):
        return None

    fusion_result = snapshot.get("fusion_result")
    if not isinstance(fusion_result, dict):
        return None
    if fusion_result.get("conflict") is not True:
        return None

    source_context = snapshot.get("source_context")
    if not isinstance(source_context, dict):
        source_context = {}
    text_result = snapshot.get("text_result")
    if not isinstance(text_result, dict):
        text_result = {}

    return {
        "emotion_state": str(fusion_result.get("emotion_state") or "needs_clarification"),
        "risk_level": str(fusion_result.get("risk_level") or "medium"),
        "conflict_reason": str(fusion_result.get("conflict_reason") or "").strip() or None,
        "record_id": str(source_context.get("record_id") or "").strip() or None,
        "text_label": str(text_result.get("label") or "").strip() or None,
    }


def build_llm_client(settings: DialogueServiceSettings):
    from openai import OpenAI

    return OpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        timeout=settings.llm_timeout_seconds,
    )


def ensure_llm_configured(settings: DialogueServiceSettings) -> None:
    if not settings.llm_api_key:
        raise RuntimeError("LLM_API_KEY is not configured")
    if not settings.llm_base_url:
        raise RuntimeError("LLM_BASE_URL is not configured")
    if not settings.llm_model or settings.llm_model == "set-your-llm-model":
        raise RuntimeError("LLM_MODEL is not configured")


def build_dialogue_system_prompt() -> str:
    return (
        "You are the structured dialogue core for a mental-support virtual human. "
        "Return one JSON object only with keys: reply, emotion, risk_level, stage, "
        "next_action, knowledge_refs, avatar_style, safety_flags. "
        "Rules: reply in Simplified Chinese, empathetic, concrete, 1-3 sentences, "
        "no markdown, no diagnosis, no extra keys. risk_level must be low, medium, "
        "or high. stage must be engage, assess, intervene, reassess, or handoff. "
        "If the user expresses self-harm or suicide intent, set risk_level=high, "
        "stage=handoff, next_action=handoff, and add a safety flag. "
        "If current_stage=assess, prefer intervene. If current_stage=intervene, "
        "prefer reassess. If current_stage=engage and the user mentions sleep, "
        "anxiety, stress, or pressure, prefer assess. Use short knowledge_refs "
        "only when clearly relevant. If metadata.knowledge_cards is present, keep "
        "knowledge_refs inside the provided source_id set and ground the reply in "
        "those cards instead of inventing unrelated advice. If metadata.short_term_memory contains recent "
        "turns, use it to preserve continuity and answer factual recall questions "
        "about the last few turns directly. avatar_style should be warm_support, "
        "calm_guarded, or rational_guide."
    )


def build_summary_system_prompt() -> str:
    return (
        "You are the structured dialogue summarizer for a mental-support virtual human. "
        "Return one JSON object only with key: summary_text. "
        "Write summary_text in Simplified Chinese, 1-2 short sentences, concise, "
        "grounded in the provided previous_summary and recent_messages only. "
        "Capture current concerns, key user facts, latest intervention direction, and "
        "current_stage. Do not diagnose, do not invent facts, and do not use markdown."
    )


def extract_knowledge_cards(metadata: dict[str, Any] | None) -> list[KnowledgeCardContext]:
    if not isinstance(metadata, dict):
        return []

    raw_cards = metadata.get("knowledge_cards")
    if not isinstance(raw_cards, list):
        return []

    cards: list[KnowledgeCardContext] = []
    for item in raw_cards:
        if not isinstance(item, dict):
            continue
        try:
            cards.append(KnowledgeCardContext.model_validate(item))
        except ValidationError:
            continue
    return cards


def extract_retrieval_context(metadata: dict[str, Any] | None) -> RetrievalContext:
    if not isinstance(metadata, dict):
        return RetrievalContext()

    cards = extract_knowledge_cards(metadata)
    raw_filters = metadata.get("knowledge_filters_applied")
    if isinstance(raw_filters, list):
        filters_applied = [str(item).strip() for item in raw_filters if str(item).strip()]
    else:
        filters_applied = []

    raw_candidate_count = metadata.get("knowledge_candidate_count")
    candidate_count = raw_candidate_count if isinstance(raw_candidate_count, int) else None

    return RetrievalContext(
        source_ids=[card.source_id for card in cards],
        filters_applied=filters_applied,
        candidate_count=candidate_count,
    )


def build_dialogue_user_prompt(payload: DialogueReplyRequest) -> str:
    metadata = dict(payload.metadata or {})
    cards = extract_knowledge_cards(metadata)
    metadata.pop("knowledge_cards", None)
    return json.dumps(
        {
            "current_stage": payload.current_stage,
            "user_text": payload.content_text,
            "metadata": metadata,
            "knowledge_cards": [
                {
                    "source_id": card.source_id,
                    "title": card.title,
                    "category": card.category,
                    "summary": card.summary,
                    "recommended_phrases": card.recommended_phrases,
                    "followup_questions": card.followup_questions,
                    "contraindications": card.contraindications,
                }
                for card in cards
            ],
        },
        ensure_ascii=False,
    )


def build_summary_user_prompt(payload: DialogueSummaryRequest) -> str:
    return json.dumps(
        {
            "current_stage": payload.current_stage,
            "user_turn_count": payload.user_turn_count,
            "previous_summary": payload.previous_summary,
            "recent_messages": payload.recent_messages,
        },
        ensure_ascii=False,
    )


def extract_text_content(message_content: Any) -> str:
    if isinstance(message_content, str):
        return message_content
    if isinstance(message_content, list):
        parts: list[str] = []
        for item in message_content:
            if isinstance(item, dict) and item.get("type") == "text":
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
            elif hasattr(item, "text") and isinstance(item.text, str):
                parts.append(item.text)
        return "\n".join(part for part in parts if part).strip()
    return str(message_content or "")


def extract_json_object(raw_text: str) -> dict[str, Any]:
    stripped = raw_text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            stripped = "\n".join(lines[1:-1]).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise RuntimeError("llm response did not contain a json object")
        candidate = stripped[start : end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            raise RuntimeError("llm response did not contain valid json") from exc


def generate_dialogue_fields(
    settings: DialogueServiceSettings,
    payload: DialogueReplyRequest,
) -> LLMDialogueFields:
    if settings.dialogue_force_failure_mode == "timeout":
        raise TimeoutError("forced timeout for verifier")
    if settings.dialogue_force_failure_mode == "empty":
        raise RuntimeError("llm returned empty content")
    if settings.dialogue_force_failure_mode == "invalid_json":
        raise RuntimeError("llm response did not contain valid json")
    if settings.dialogue_force_failure_mode == "invalid_fields":
        raise RuntimeError("llm returned invalid dialogue fields: forced invalid fields")

    ensure_llm_configured(settings)
    client = build_llm_client(settings)
    completion = client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": build_dialogue_system_prompt()},
            {"role": "user", "content": build_dialogue_user_prompt(payload)},
        ],
        temperature=0,
        max_tokens=300,
        response_format={"type": "json_object"},
    )
    choices = getattr(completion, "choices", None) or []
    if not choices:
        raise RuntimeError("llm returned no choices")
    content = extract_text_content(choices[0].message.content)
    if not content:
        raise RuntimeError("llm returned empty content")
    parsed = extract_json_object(content)
    try:
        return LLMDialogueFields.model_validate(parsed)
    except ValidationError as exc:
        raise RuntimeError(f"llm returned invalid dialogue fields: {exc}") from exc


def generate_dialogue_summary_fields(
    settings: DialogueServiceSettings,
    payload: DialogueSummaryRequest,
) -> LLMSummaryFields:
    ensure_llm_configured(settings)
    client = build_llm_client(settings)
    completion = client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": build_summary_system_prompt()},
            {"role": "user", "content": build_summary_user_prompt(payload)},
        ],
        temperature=0,
        max_tokens=180,
        response_format={"type": "json_object"},
    )
    choices = getattr(completion, "choices", None) or []
    if not choices:
        raise RuntimeError("llm returned no choices")
    content = extract_text_content(choices[0].message.content)
    if not content:
        raise RuntimeError("llm returned empty content")
    parsed = extract_json_object(content)
    try:
        return LLMSummaryFields.model_validate(parsed)
    except ValidationError as exc:
        raise RuntimeError(f"llm returned invalid summary fields: {exc}") from exc


def build_dialogue_reply(
    payload: DialogueReplyRequest,
    llm_fields: LLMDialogueFields,
) -> DialogueReplyResponse:
    retrieval_context = extract_retrieval_context(payload.metadata)
    return DialogueReplyResponse(
        session_id=payload.session_id,
        trace_id=payload.trace_id,
        message_id=f"msg_assistant_{uuid4().hex[:16]}",
        reply=llm_fields.reply,
        emotion=llm_fields.emotion,
        risk_level=llm_fields.risk_level,
        stage=llm_fields.stage,
        next_action=llm_fields.next_action,
        knowledge_refs=llm_fields.knowledge_refs,
        retrieval_context=retrieval_context.model_dump(mode="json"),
        avatar_style=llm_fields.avatar_style,
        safety_flags=llm_fields.safety_flags,
    )


def choose_grounding_snippet(
    card: KnowledgeCardContext,
    *,
    stage: str,
    next_action: str,
) -> str | None:
    if next_action == "ask_followup" or stage in {"engage", "assess", "reassess"}:
        for question in card.followup_questions:
            text = question.strip()
            if text:
                return text
    for phrase in card.recommended_phrases:
        text = phrase.strip()
        if text:
            return text
    return None


def append_grounding_text(reply: str, snippet: str) -> str:
    base = reply.strip()
    if not base:
        return snippet
    if snippet in base:
        return base
    if base[-1] not in "。！？!?":
        base = f"{base}。"
    return f"{base}{snippet}"


def apply_rag_grounding(
    payload: DialogueReplyRequest,
    llm_fields: LLMDialogueFields,
) -> LLMDialogueFields:
    cards = extract_knowledge_cards(payload.metadata)
    if not cards:
        return llm_fields

    allowed_ids = {card.source_id for card in cards}
    normalized_refs = [ref for ref in llm_fields.knowledge_refs if ref in allowed_ids]
    primary_card = cards[0]
    if normalized_refs:
        primary_card = next((card for card in cards if card.source_id == normalized_refs[0]), cards[0])
    else:
        normalized_refs = [primary_card.source_id]

    reply = llm_fields.reply
    snippet = choose_grounding_snippet(
        primary_card,
        stage=llm_fields.stage,
        next_action=llm_fields.next_action,
    )
    if snippet:
        reply = append_grounding_text(reply, snippet)

    safety_flags = list(llm_fields.safety_flags)
    if "rag_grounded_response" not in safety_flags:
        safety_flags.append("rag_grounded_response")
    if llm_fields.knowledge_refs != normalized_refs:
        safety_flags.append("rag_refs_injected")

    return llm_fields.model_copy(
        update={
            "reply": reply,
            "knowledge_refs": normalized_refs,
            "safety_flags": safety_flags,
        }
    )


def build_dialogue_summary(
    payload: DialogueSummaryRequest,
    llm_fields: LLMSummaryFields,
) -> DialogueSummaryResponse:
    return DialogueSummaryResponse(
        session_id=payload.session_id,
        trace_id=payload.trace_id,
        summary_text=llm_fields.summary_text,
        current_stage=payload.current_stage,
        user_turn_count=payload.user_turn_count,
        generated_at=datetime.now(timezone.utc),
    )


def classify_dialogue_fallback_reason(exc: Exception) -> str:
    message = str(exc).strip().lower()
    if "not configured" in message:
        return "not_configured"
    if isinstance(exc, TimeoutError) or "timed out" in message or "timeout" in message:
        return "timeout"
    if "empty content" in message:
        return "empty_output"
    if "invalid dialogue fields" in message or "valid json" in message or "json object" in message:
        return "invalid_output"
    return "upstream_error"


def build_dialogue_fallback_reply(
    payload: DialogueReplyRequest,
    exc: Exception,
) -> DialogueReplyResponse:
    reason = classify_dialogue_fallback_reason(exc)
    fallback_stage = "assess" if payload.current_stage == "engage" else payload.current_stage
    if fallback_stage == "handoff":
        reply = (
            "我先用安全回退模式继续陪你。"
            "如果你现在有伤害自己或他人的打算，请立刻联系身边可信任的人，并尽快联系辅导员、家人、校医院或当地急救资源。"
        )
        risk_level = "high"
        emotion = "guarded"
        avatar_style = "calm_guarded"
    elif fallback_stage == "intervene":
        reply = (
            "我先用基础回退模式继续陪你，不让这次对话中断。"
            "先把呼吸放慢一点，再告诉我此刻身体或情绪最明显的不适是什么。"
        )
        risk_level = "medium"
        emotion = "supportive"
        avatar_style = "warm_support"
    elif fallback_stage == "reassess":
        reply = (
            "我先用基础回退模式继续接住你。"
            "和刚才相比，现在有没有哪一点稍微缓下来，或者最难受的部分还停留在哪里？"
        )
        risk_level = "medium"
        emotion = "supportive"
        avatar_style = "warm_support"
    else:
        reply = (
            "我先用基础回退模式继续陪你，不让这次对话中断。"
            "如果你现在有伤害自己或他人的打算，请立刻联系身边可信任的人并尽快寻求线下帮助；除此之外，先告诉我此刻最困扰你的那一件事。"
        )
        risk_level = "medium"
        emotion = "supportive"
        avatar_style = "warm_support"

    retrieval_context = extract_retrieval_context(payload.metadata)
    return DialogueReplyResponse(
        session_id=payload.session_id,
        trace_id=payload.trace_id,
        message_id=f"msg_assistant_{uuid4().hex[:16]}",
        reply=reply,
        emotion=emotion,
        risk_level=risk_level,
        stage=fallback_stage,
        next_action=FALLBACK_NEXT_ACTION.get(fallback_stage, "ask_followup"),
        knowledge_refs=[],
        retrieval_context=retrieval_context.model_dump(mode="json"),
        avatar_style=avatar_style,
        safety_flags=["dialogue_fallback_response", f"dialogue_fallback_reason:{reason}"],
    )


def build_affect_conflict_reply(
    payload: DialogueReplyRequest,
    conflict_info: dict[str, Any],
) -> DialogueReplyResponse:
    requested_risk = str(conflict_info.get("risk_level") or "medium")
    if requested_risk == "high":
        reply = (
            "我先不急着下结论。"
            "从当前多模态线索看还需要优先确认你的安全，如果你现在有伤害自己或他人的打算，请立刻联系身边可信任的人，并尽快寻求线下帮助。"
        )
        stage = "handoff"
        next_action = "handoff"
        risk_level = "high"
        emotion = "guarded"
        avatar_style = "calm_guarded"
    else:
        reply = (
            "我想先再确认一下你现在的真实状态。"
            "虽然你刚才的文字表达比较平静，但其他线索提示还需要澄清；你现在更接近疲惫、情绪低落，还是只是身体有点累？"
        )
        if payload.current_stage == "engage":
            stage = "assess"
        elif payload.current_stage == "handoff":
            stage = "handoff"
        else:
            stage = payload.current_stage
        next_action = "ask_followup" if stage != "handoff" else "handoff"
        risk_level = "medium"
        emotion = str(conflict_info.get("text_label") or "guarded")
        avatar_style = "calm_guarded"

    safety_flags = ["affect_conflict_clarification"]
    if conflict_info.get("conflict_reason"):
        safety_flags.append("affect_conflict_reason_present")

    retrieval_context = extract_retrieval_context(payload.metadata)
    return DialogueReplyResponse(
        session_id=payload.session_id,
        trace_id=payload.trace_id,
        message_id=f"msg_assistant_{uuid4().hex[:16]}",
        reply=reply,
        emotion=emotion,
        risk_level=risk_level,
        stage=stage,
        next_action=next_action,
        knowledge_refs=[],
        retrieval_context=retrieval_context.model_dump(mode="json"),
        avatar_style=avatar_style,
        safety_flags=safety_flags,
    )


def translate_llm_exception(exc: Exception) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc

    message = str(exc).strip() or type(exc).__name__
    if "not configured" in message:
        return HTTPException(status_code=503, detail=message)
    if isinstance(exc, RuntimeError):
        return HTTPException(status_code=502, detail=message)
    return HTTPException(status_code=502, detail=f"{type(exc).__name__}: {message}")


def create_app() -> FastAPI:
    bootstrap_runtime_env()
    settings = DialogueServiceSettings.from_env()

    app = FastAPI(title="virtual-huamn-dialogue-service", version="0.1.0")
    app.state.settings = settings

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/internal/dialogue/respond", response_model=DialogueReplyResponse)
    def respond(payload: DialogueReplyRequest) -> DialogueReplyResponse:
        try:
            affect_conflict = extract_affect_conflict(payload.metadata)
            if affect_conflict is not None:
                return build_affect_conflict_reply(payload, affect_conflict)
            llm_fields = generate_dialogue_fields(settings, payload)
            llm_fields = apply_rag_grounding(payload, llm_fields)
            return build_dialogue_reply(payload, llm_fields)
        except Exception as exc:
            if isinstance(exc, HTTPException):
                raise exc
            return build_dialogue_fallback_reply(payload, exc)

    @app.post("/internal/dialogue/validate", response_model=DialogueReplyResponse)
    def validate(payload: DialogueReplyResponse) -> DialogueReplyResponse:
        return payload

    @app.post("/internal/dialogue/summarize", response_model=DialogueSummaryResponse)
    def summarize(payload: DialogueSummaryRequest) -> DialogueSummaryResponse:
        try:
            llm_fields = generate_dialogue_summary_fields(settings, payload)
            return build_dialogue_summary(payload, llm_fields)
        except Exception as exc:
            raise translate_llm_exception(exc) from exc

    return app


app = create_app()
