from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import FastAPI
from pydantic import BaseModel, Field


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
class OrchestratorSettings:
    orchestrator_host: str
    orchestrator_port: int

    @classmethod
    def from_env(cls) -> "OrchestratorSettings":
        return cls(
            orchestrator_host=os.getenv("ORCHESTRATOR_HOST", "0.0.0.0"),
            orchestrator_port=int(os.getenv("ORCHESTRATOR_PORT", "8010")),
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


def build_mock_dialogue_reply(payload: DialogueReplyRequest) -> DialogueReplyResponse:
    text = payload.content_text.strip()
    lowered = text.lower()
    message_id = f"msg_assistant_{uuid4().hex[:16]}"

    if any(token in text for token in ["不想活", "伤害自己", "活着没意义"]) or "suicide" in lowered:
        return DialogueReplyResponse(
            session_id=payload.session_id,
            trace_id=payload.trace_id,
            message_id=message_id,
            reply="听起来你现在很难受。如果你已经有伤害自己的想法，请立刻联系身边可信任的人，并尽快寻求线下专业帮助。",
            emotion="distressed",
            risk_level="high",
            stage="handoff",
            next_action="handoff",
            knowledge_refs=["handoff_emergency_support"],
            avatar_style="calm_guarded",
            safety_flags=["high_risk_expression"],
        )

    if payload.current_stage == "intervene":
        return DialogueReplyResponse(
            session_id=payload.session_id,
            trace_id=payload.trace_id,
            message_id=message_id,
            reply="刚才这些方法里，哪一种对你最有帮助？如果只看现在这一刻，紧绷感有没有比刚才轻一点？",
            emotion="calmer",
            risk_level="low",
            stage="reassess",
            next_action="reassess",
            knowledge_refs=["reassess_checkin_basic"],
            avatar_style="warm_support",
            safety_flags=[],
        )

    if payload.current_stage == "assess":
        return DialogueReplyResponse(
            session_id=payload.session_id,
            trace_id=payload.trace_id,
            message_id=message_id,
            reply="我们先不急着一下子解决全部问题。你现在可以先试一次慢呼吸：吸气四拍，停两拍，呼气六拍，做两轮看看身体有没有一点放松。",
            emotion="anxious",
            risk_level="medium",
            stage="intervene",
            next_action="breathing",
            knowledge_refs=["breathing_426"],
            avatar_style="warm_support",
            safety_flags=[],
        )

    if any(token in text for token in ["睡不好", "睡不着", "晚上", "停不下来", "焦虑"]) or "sleep" in lowered:
        return DialogueReplyResponse(
            session_id=payload.session_id,
            trace_id=payload.trace_id,
            message_id=message_id,
            reply="谢谢你愿意说出来。最近这种睡不稳和停不下来的感觉，是这几天一直这样，还是晚上更明显？",
            emotion="anxious",
            risk_level="medium",
            stage="assess",
            next_action="ask_followup",
            knowledge_refs=["sleep_hygiene_basic"],
            avatar_style="warm_support",
            safety_flags=[],
        )

    return DialogueReplyResponse(
        session_id=payload.session_id,
        trace_id=payload.trace_id,
        message_id=message_id,
        reply="谢谢你愿意继续说。你现在最希望我先帮你理清哪一部分，是情绪、压力来源，还是最近的作息状态？",
        emotion="neutral",
        risk_level="low",
        stage="engage" if payload.current_stage == "engage" else "assess",
        next_action="ask_followup",
        knowledge_refs=[],
        avatar_style="warm_support",
        safety_flags=[],
    )


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
        return build_mock_dialogue_reply(payload)

    return app


app = create_app()
