from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

from pydantic import ValidationError


ROOT = Path(__file__).resolve().parents[1]
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"
DIALOGUE_README = ROOT / "services" / "dialogue-service" / "README.md"


def load_dialogue_module():
    spec = importlib.util.spec_from_file_location("dialogue_service_main_test", DIALOGUE_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load dialogue service module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def build_request(module, *, content_text: str, current_stage: str = "engage"):
    return module.DialogueReplyRequest(
        session_id="sess_fake_001",
        trace_id="trace_fake_001",
        user_message_id="msg_user_001",
        content_text=content_text,
        current_stage=current_stage,
        metadata={"source": "test"},
    )


def test_dialogue_service_returns_assess_reply_for_sleep_pressure_text():
    module = load_dialogue_module()
    response = module.build_mock_dialogue_reply(
        build_request(module, content_text="我这两天睡不好，晚上脑子停不下来。"),
    )

    assert response.stage == "assess"
    assert response.risk_level == "medium"
    assert response.next_action == "ask_followup"
    assert "晚上更明显" in response.reply


def test_dialogue_service_returns_handoff_reply_for_high_risk_text():
    module = load_dialogue_module()
    response = module.build_mock_dialogue_reply(
        build_request(module, content_text="我觉得活着没意义，甚至想伤害自己。"),
    )

    assert response.stage == "handoff"
    assert response.risk_level == "high"
    assert "high_risk_expression" in response.safety_flags


def test_dialogue_validation_contract_rejects_invalid_stage():
    module = load_dialogue_module()

    try:
        module.DialogueReplyResponse(
            session_id="sess_fake_001",
            trace_id="trace_fake_001",
            message_id="msg_assistant_001",
            reply="invalid stage",
            emotion="neutral",
            risk_level="low",
            stage="invalid_stage",
            next_action="ask_followup",
        )
    except ValidationError:
        assert True
        return

    raise AssertionError("expected DialogueReplyResponse validation to fail for invalid stage")


def test_dialogue_service_app_and_readme_document_validation_endpoint():
    module = load_dialogue_module()
    app = module.create_app()
    paths = {route.path for route in app.routes}
    content = DIALOGUE_README.read_text(encoding="utf-8")

    assert "/health" in paths
    assert "/internal/dialogue/respond" in paths
    assert "/internal/dialogue/validate" in paths
    assert "POST /internal/dialogue/validate" in content
