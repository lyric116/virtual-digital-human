from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"
ORCHESTRATOR_README = ROOT / "apps" / "orchestrator" / "README.md"


def load_orchestrator_module():
    spec = importlib.util.spec_from_file_location("orchestrator_main_test", ORCHESTRATOR_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load orchestrator module")
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
        previous_summary="用户提到睡眠和实习压力。",
        recent_messages=[
            {"role": "user", "content_text": "上课时有点分心。"},
            {"role": "assistant", "content_text": "先做一次呼吸练习。"},
        ],
    )


def test_orchestrator_parses_valid_dialogue_service_response(monkeypatch):
    module = load_orchestrator_module()
    payload = build_request(module, content_text="我这两天睡不好，晚上脑子停不下来。")

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return (
                b'{"session_id":"sess_fake_001","trace_id":"trace_fake_001","message_id":"msg_assistant_001",'
                b'"reply":"\xe8\xb0\xa2\xe8\xb0\xa2\xe4\xbd\xa0\xe6\x84\xbf\xe6\x84\x8f\xe8\xaf\xb4\xe5\x87\xba\xe6\x9d\xa5\xe3\x80\x82",'
                b'"emotion":"neutral","risk_level":"low","stage":"engage","next_action":"ask_followup",'
                b'"knowledge_refs":[],"avatar_style":"warm_support","safety_flags":[]}'
            )

    class FakeOpener:
        def open(self, request, timeout):
            return FakeResponse()

    monkeypatch.setattr(module.urllib_request, "build_opener", lambda *args: FakeOpener())
    response = module.request_dialogue_reply(module.OrchestratorSettings.from_env(), payload)

    assert response.session_id == "sess_fake_001"
    assert response.trace_id == "trace_fake_001"
    assert response.stage == "engage"
    assert response.risk_level == "low"
    assert response.next_action == "ask_followup"
    assert "谢谢你愿意说出来" in response.reply


def test_orchestrator_rejects_invalid_dialogue_service_stage(monkeypatch):
    module = load_orchestrator_module()

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return (
                b'{"session_id":"sess_fake_001","trace_id":"trace_fake_001","message_id":"msg_assistant_001",'
                b'"reply":"invalid stage","emotion":"neutral","risk_level":"low","stage":"invalid_stage",'
                b'"next_action":"ask_followup"}'
            )

    class FakeOpener:
        def open(self, request, timeout):
            return FakeResponse()

    monkeypatch.setattr(module.urllib_request, "build_opener", lambda *args: FakeOpener())

    try:
        module.request_dialogue_reply(
            module.OrchestratorSettings.from_env(),
            build_request(module, content_text="普通文本"),
        )
    except RuntimeError as exc:
        assert "invalid dialogue reply" in str(exc)
        return

    raise AssertionError("expected orchestrator to reject invalid dialogue reply payload")


def test_orchestrator_parses_valid_dialogue_summary(monkeypatch):
    module = load_orchestrator_module()

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return (
                b'{"session_id":"sess_fake_001","trace_id":"trace_fake_001",'
                b'"summary_text":"\xe7\x94\xa8\xe6\x88\xb7\xe6\x8c\x81\xe7\xbb\xad\xe6\x8f\x90\xe5\x88\xb0\xe7\x9d\xa1\xe7\x9c\xa0\xe5\x92\x8c\xe5\x88\x86\xe5\xbf\x83\xef\xbc\x8c\xe5\xbd\x93\xe5\x89\x8d\xe5\xb7\xb2\xe8\xbf\x9b\xe5\x85\xa5 intervene \xe9\x98\xb6\xe6\xae\xb5\xe3\x80\x82",'
                b'"current_stage":"intervene","user_turn_count":3,'
                b'"generated_at":"2026-03-09T09:30:00Z"}'
            )

    class FakeOpener:
        def open(self, request, timeout):
            return FakeResponse()

    monkeypatch.setattr(module.urllib_request, "build_opener", lambda *args: FakeOpener())
    response = module.request_dialogue_summary(
        module.OrchestratorSettings.from_env(),
        build_summary_request(module),
    )

    assert response.user_turn_count == 3
    assert response.current_stage == "intervene"
    assert "睡眠" in response.summary_text


def test_orchestrator_uses_configured_dialogue_service_timeout(monkeypatch):
    module = load_orchestrator_module()
    captured: dict[str, float] = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return (
                b'{"session_id":"sess_fake_001","trace_id":"trace_fake_001","message_id":"msg_assistant_001",'
                b'"reply":"ok","emotion":"neutral","risk_level":"low","stage":"engage",'
                b'"next_action":"ask_followup","knowledge_refs":[],"avatar_style":"warm_support",'
                b'"safety_flags":[]}'
            )

    class FakeOpener:
        def open(self, request, timeout):
            captured["timeout"] = timeout
            return FakeResponse()

    monkeypatch.setattr(module.urllib_request, "build_opener", lambda *args: FakeOpener())
    settings = module.OrchestratorSettings(
        orchestrator_host="127.0.0.1",
        orchestrator_port=8010,
        rag_service_base_url="http://127.0.0.1:8070",
        dialogue_service_base_url="http://127.0.0.1:8030",
        dialogue_service_timeout_seconds=45.0,
    )

    module.request_dialogue_reply(
        settings,
        build_request(module, content_text="普通文本"),
    )

    assert captured["timeout"] == 45.0


def test_orchestrator_injects_rag_cards_into_dialogue_request(monkeypatch):
    module = load_orchestrator_module()
    captured: dict[str, object] = {}

    class FakeResponse:
        def __init__(self, body: bytes):
            self.body = body

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return self.body

    class FakeOpener:
        def open(self, request, timeout):
            raw_body = request.data.decode("utf-8")
            captured[request.full_url] = raw_body
            if request.full_url.endswith("/internal/rag/retrieve"):
                return FakeResponse(
                    b'{"session_id":"sess_fake_001","trace_id":"trace_fake_001","query_text":"'
                    b'\\u665a\\u4e0a\\u7761\\u4e0d\\u7740","current_stage":"intervene",'
                    b'"risk_level":"medium","emotion":"anxious","top_k":3,'
                    b'"generated_at":"2026-03-10T12:00:00Z","index_card_count":11,'
                    b'"candidate_count":2,"filters_applied":["stage:intervene","risk_level:medium"],'
                    b'"results":[{"source_id":"sleep_worry_container","id":"sleep_worry_container",'
                    b'"title":"\\u7761\\u524d\\u62c5\\u5fe7\\u6682\\u5b58","category":"sleep_support",'
                    b'"summary":"summary","score":0.81,"stage":["intervene"],"risk_level":["medium"],'
                    b'"emotion":["anxious"],"recommended_phrases":["\\u6211\\u4eec\\u5148\\u628a\\u95ee\\u9898'
                    b'\\u6682\\u5b58\\u5230\\u660e\\u5929\\u4e00\\u4e2a\\u56fa\\u5b9a\\u65f6\\u95f4\\u3002"],'
                    b'"followup_questions":["\\u4f60\\u613f\\u610f\\u628a\\u660e\\u5929\\u5904\\u7406'
                    b'\\u8fd9\\u4e9b\\u4e8b\\u7684\\u65f6\\u95f4\\u5b9a\\u5728\\u4ec0\\u4e48\\u65f6\\u5019\\uff1f"],'
                    b'"contraindications":["x"],"source":"internal_curated_v1"}]}'
                )
            return FakeResponse(
                b'{"session_id":"sess_fake_001","trace_id":"trace_fake_001","message_id":"msg_assistant_001",'
                b'"reply":"\\u8c22\\u8c22\\u4f60\\u613f\\u610f\\u8bf4\\u51fa\\u6765\\u3002","emotion":"anxious",'
                b'"risk_level":"medium","stage":"intervene","next_action":"ask_followup",'
                b'"knowledge_refs":["sleep_worry_container"],"avatar_style":"warm_support","safety_flags":[]}'
            )

    monkeypatch.setattr(module.urllib_request, "build_opener", lambda *args: FakeOpener())
    payload = module.DialogueReplyRequest(
        session_id="sess_fake_001",
        trace_id="trace_fake_001",
        user_message_id="msg_user_001",
        content_text="晚上睡不着，脑子一直转。",
        current_stage="intervene",
        metadata={"source": "test", "rag_risk_level_hint": "medium", "rag_emotion_hint": "anxious"},
    )
    settings = module.OrchestratorSettings(
        orchestrator_host="127.0.0.1",
        orchestrator_port=8010,
        rag_service_base_url="http://127.0.0.1:8070",
        dialogue_service_base_url="http://127.0.0.1:8030",
        dialogue_service_timeout_seconds=30.0,
    )

    response = module.request_dialogue_reply(settings, payload)

    assert response.knowledge_refs == ["sleep_worry_container"]
    dialogue_body = captured["http://127.0.0.1:8030/internal/dialogue/respond"]
    assert "knowledge_cards" in dialogue_body
    assert "sleep_worry_container" in dialogue_body
    assert "knowledge_filters_applied" in dialogue_body


def test_orchestrator_attaches_rag_failure_metadata_when_retrieval_fails(monkeypatch):
    module = load_orchestrator_module()
    payload = build_request(module, content_text="普通文本")

    def boom_rag(settings, request_payload):
        raise RuntimeError("rag-service unavailable: timed out")

    monkeypatch.setattr(module, "request_rag_cards", boom_rag)

    enriched = module.attach_rag_context(module.OrchestratorSettings.from_env(), payload)

    assert enriched.metadata["knowledge_retrieval_attempted"] is True
    assert enriched.metadata["knowledge_retrieval_status"] == "failed"
    assert enriched.metadata["knowledge_retrieval_error_message"] == "rag-service unavailable: timed out"
    assert "knowledge_cards" not in enriched.metadata


def test_orchestrator_routes_translate_downstream_runtime_errors(monkeypatch):
    module = load_orchestrator_module()
    app = module.create_app()
    respond_route = next(route for route in app.routes if route.path == "/internal/dialogue/respond")
    summarize_route = next(route for route in app.routes if route.path == "/internal/dialogue/summarize")

    def boom_reply(settings, payload):
        raise RuntimeError("dialogue-service unavailable: timed out")

    def boom_summary(settings, payload):
        raise RuntimeError("dialogue-service http 502: bad gateway")

    monkeypatch.setattr(module, "request_dialogue_reply", boom_reply)
    monkeypatch.setattr(module, "request_dialogue_summary", boom_summary)

    try:
        respond_route.endpoint(build_request(module, content_text="普通文本"))
    except module.HTTPException as exc:
        assert exc.status_code == 502
        assert "dialogue-service unavailable" in exc.detail
    else:
        raise AssertionError("expected respond route to translate runtime error")

    try:
        summarize_route.endpoint(build_summary_request(module))
    except module.HTTPException as exc:
        assert exc.status_code == 502
        assert "dialogue-service http 502" in exc.detail
    else:
        raise AssertionError("expected summarize route to translate runtime error")


def test_orchestrator_app_and_readme_document_mock_reply_endpoint():
    module = load_orchestrator_module()
    app = module.create_app()
    paths = {route.path for route in app.routes}

    assert "/health" in paths
    assert "/internal/dialogue/respond" in paths
    assert "/internal/dialogue/summarize" in paths

    content = ORCHESTRATOR_README.read_text(encoding="utf-8")
    assert "POST /internal/dialogue/respond" in content
    assert "POST /internal/dialogue/summarize" in content
    assert "services/dialogue-service" in content
