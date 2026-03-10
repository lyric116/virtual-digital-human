#!/usr/bin/env python3
"""Verify step-45 RAG grounding across orchestrator and dialogue layers."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"
RAG_MAIN = ROOT / "services" / "rag-service" / "main.py"
CARDS_PATH = ROOT / "data" / "kb" / "knowledge_cards.jsonl"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> None:
    orchestrator = load_module("verify_orchestrator_rag", ORCHESTRATOR_MAIN)
    dialogue = load_module("verify_dialogue_rag", DIALOGUE_MAIN)
    rag = load_module("verify_rag_service", RAG_MAIN)

    rag_index = rag.build_knowledge_index(CARDS_PATH)
    rag_settings = rag.RAGServiceSettings(
        rag_service_host="127.0.0.1",
        rag_service_port=8070,
        rag_service_base_url="http://127.0.0.1:8070",
        rag_cards_path=CARDS_PATH,
        rag_default_top_k=3,
        rag_max_top_k=5,
    )

    def fake_request_rag_cards(settings, payload):
        request = rag.RAGRetrieveRequest(
            session_id=payload.session_id,
            trace_id=payload.trace_id,
            query_text=payload.content_text,
            current_stage=payload.current_stage,
            risk_level=orchestrator.extract_rag_risk_level(payload),
            emotion=orchestrator.extract_rag_emotion(payload),
        )
        response = rag.retrieve_knowledge_cards(rag_index, request, rag_settings)
        return orchestrator.RAGRetrieveResponse.model_validate(response)

    orchestrator.request_rag_cards = fake_request_rag_cards

    def build_payload(risk_level: str):
        return orchestrator.DialogueReplyRequest(
            session_id="sess_verify_rag_dialogue",
            trace_id=f"trace_verify_rag_{risk_level}",
            user_message_id=f"msg_user_{risk_level}",
            content_text="晚上睡前脑子一直转，我想先做个最小改动，把事情先放一下。",
            current_stage="intervene",
            metadata={
                "source": "verify_dialogue_rag_grounding",
                "rag_risk_level_hint": risk_level,
                "rag_emotion_hint": "anxious",
            },
        )

    generic_fields = dialogue.LLMDialogueFields(
        reply="谢谢你愿意说出来，我们先一步一步来。",
        emotion="anxious",
        risk_level="medium",
        stage="intervene",
        next_action="ask_followup",
        knowledge_refs=[],
        avatar_style="warm_support",
        safety_flags=[],
    )

    low_payload = orchestrator.attach_rag_context(
        orchestrator.OrchestratorSettings.from_env(),
        build_payload("low"),
    )
    medium_payload = orchestrator.attach_rag_context(
        orchestrator.OrchestratorSettings.from_env(),
        build_payload("medium"),
    )
    low_grounded = dialogue.apply_rag_grounding(
        dialogue.DialogueReplyRequest.model_validate(low_payload.model_dump(mode="json")),
        generic_fields,
    )
    medium_grounded = dialogue.apply_rag_grounding(
        dialogue.DialogueReplyRequest.model_validate(medium_payload.model_dump(mode="json")),
        generic_fields,
    )

    if not low_grounded.knowledge_refs or not medium_grounded.knowledge_refs:
        raise RuntimeError("knowledge refs were not injected")
    if low_grounded.knowledge_refs == medium_grounded.knowledge_refs:
        raise RuntimeError("risk-specific retrieval did not change knowledge refs")
    if "sleep_hygiene_basic" not in low_grounded.knowledge_refs:
        raise RuntimeError(f"unexpected low-risk refs: {low_grounded.knowledge_refs}")
    if "sleep_worry_container" not in medium_grounded.knowledge_refs:
        raise RuntimeError(f"unexpected medium-risk refs: {medium_grounded.knowledge_refs}")
    if "最容易先减少的刺激" not in low_grounded.reply:
        raise RuntimeError("low-risk grounded reply did not use sleep hygiene follow-up")
    if "把担忧写下来以后" not in medium_grounded.reply:
        raise RuntimeError("medium-risk grounded reply did not use worry-container follow-up")

    print(
        json.dumps(
            {
                "low_risk_refs": low_grounded.knowledge_refs,
                "medium_risk_refs": medium_grounded.knowledge_refs,
                "low_risk_reply": low_grounded.reply,
                "medium_risk_reply": medium_grounded.reply,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
