from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace

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


def build_summary_request(module):
    return module.DialogueSummaryRequest(
        session_id="sess_fake_001",
        trace_id="trace_fake_001",
        current_stage="intervene",
        user_turn_count=3,
        previous_summary="用户最近反复提到睡眠受影响。",
        recent_messages=[
            {"role": "user", "content_text": "我白天上课也有点分心。"},
            {"role": "assistant", "content_text": "我们先做一个缓和练习。"},
        ],
    )


def make_fake_client(response_content: str):
    class FakeCompletions:
        def __init__(self):
            self.calls = []

        def create(self, **kwargs):
            self.calls.append(kwargs)
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content=response_content,
                        )
                    )
                ]
            )

    completions = FakeCompletions()
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return client, completions


def build_settings(module):
    return module.DialogueServiceSettings(
        dialogue_service_host="127.0.0.1",
        dialogue_service_port=8030,
        llm_provider="openai_compatible",
        llm_base_url="https://llm.example/v1",
        llm_api_key="test-key",
        llm_model="test-model",
        llm_timeout_seconds=12.0,
        llm_context_window=8192,
    )


def test_dialogue_service_generates_structured_reply_from_llm_client(monkeypatch):
    module = load_dialogue_module()
    fake_client, fake_completions = make_fake_client(
        '{"reply":"谢谢你愿意说出来。最近这种感觉是晚上更明显吗？","emotion":"anxious",'
        '"risk_level":"medium","stage":"assess","next_action":"ask_followup",'
        '"knowledge_refs":["sleep_hygiene_basic"],"avatar_style":"warm_support",'
        '"safety_flags":[]}'
    )
    monkeypatch.setattr(module, "build_llm_client", lambda settings: fake_client)

    response = module.generate_dialogue_fields(
        build_settings(module),
        build_request(module, content_text="我这两天睡不好，晚上脑子停不下来。"),
    )

    assert response.stage == "assess"
    assert response.risk_level == "medium"
    assert response.next_action == "ask_followup"
    assert "晚上更明显" in response.reply
    assert fake_completions.calls[0]["model"] == "test-model"
    assert fake_completions.calls[0]["response_format"] == {"type": "json_object"}


def test_dialogue_service_extracts_json_from_fenced_response(monkeypatch):
    module = load_dialogue_module()
    fake_client, _ = make_fake_client(
        "```json\n"
        '{"reply":"你现在的状态很危险，请立刻联系身边可信任的人，并尽快寻求线下帮助。",'
        '"emotion":"distressed","risk_level":"high","stage":"handoff",'
        '"next_action":"handoff","knowledge_refs":["handoff_emergency_support"],'
        '"avatar_style":"calm_guarded","safety_flags":["high_risk_expression"]}'
        "\n```"
    )
    monkeypatch.setattr(module, "build_llm_client", lambda settings: fake_client)

    response = module.generate_dialogue_fields(
        build_settings(module),
        build_request(module, content_text="我觉得活着没意义，甚至想伤害自己。"),
    )

    assert response.stage == "handoff"
    assert response.risk_level == "high"
    assert "high_risk_expression" in response.safety_flags


def test_dialogue_service_generates_structured_summary(monkeypatch):
    module = load_dialogue_module()
    fake_client, fake_completions = make_fake_client(
        '{"summary_text":"用户持续提到睡眠受影响和上课分心，当前已进入 intervene 并开始缓和建议。"}'
    )
    monkeypatch.setattr(module, "build_llm_client", lambda settings: fake_client)

    response = module.generate_dialogue_summary_fields(
        build_settings(module),
        build_summary_request(module),
    )

    assert "睡眠受影响" in response.summary_text
    assert fake_completions.calls[0]["response_format"] == {"type": "json_object"}


def test_dialogue_service_rejects_invalid_llm_stage(monkeypatch):
    module = load_dialogue_module()
    fake_client, _ = make_fake_client(
        '{"reply":"invalid stage","emotion":"neutral","risk_level":"low",'
        '"stage":"invalid_stage","next_action":"ask_followup"}'
    )
    monkeypatch.setattr(module, "build_llm_client", lambda settings: fake_client)

    try:
        module.generate_dialogue_fields(
            build_settings(module),
            build_request(module, content_text="普通文本"),
        )
    except RuntimeError as exc:
        assert "invalid dialogue fields" in str(exc)
        return

    raise AssertionError("expected dialogue service to reject invalid llm stage")


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
    assert "/internal/dialogue/summarize" in paths
    assert "POST /internal/dialogue/validate" in content
    assert "POST /internal/dialogue/summarize" in content
