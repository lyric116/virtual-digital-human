from __future__ import annotations

from dataclasses import dataclass
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
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def bootstrap_runtime_env() -> None:
    merged = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env")}
    for key, value in merged.items():
        os.environ.setdefault(key, value)


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
        "only when clearly relevant. If metadata.short_term_memory contains recent "
        "turns, use it to preserve continuity and answer factual recall questions "
        "about the last few turns directly. avatar_style should be warm_support, "
        "calm_guarded, or rational_guide."
    )


def build_dialogue_user_prompt(payload: DialogueReplyRequest) -> str:
    return json.dumps(
        {
            "current_stage": payload.current_stage,
            "user_text": payload.content_text,
            "metadata": payload.metadata,
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


def build_dialogue_reply(
    payload: DialogueReplyRequest,
    llm_fields: LLMDialogueFields,
) -> DialogueReplyResponse:
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
        avatar_style=llm_fields.avatar_style,
        safety_flags=llm_fields.safety_flags,
    )


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
            llm_fields = generate_dialogue_fields(settings, payload)
            return build_dialogue_reply(payload, llm_fields)
        except RuntimeError as exc:
            if "not configured" in str(exc):
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @app.post("/internal/dialogue/validate", response_model=DialogueReplyResponse)
    def validate(payload: DialogueReplyResponse) -> DialogueReplyResponse:
        return payload

    return app


app = create_app()
