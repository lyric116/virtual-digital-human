from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys

from pydantic import ValidationError


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"


def load_gateway_module():
    spec = importlib.util.spec_from_file_location("api_gateway_main_test", GATEWAY_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load api gateway module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeSessionRepository:
    def __init__(self) -> None:
        self.session_calls: list[dict] = []
        self.message_calls: list[dict] = []

    def create_session(self, payload):
        dumped = payload.model_dump()
        self.session_calls.append(dumped)
        return {
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
            "status": "created",
            "stage": "engage",
            "input_modes": dumped["input_modes"],
            "avatar_id": dumped.get("avatar_id") or "companion_female_01",
            "started_at": "2026-03-07T14:00:00Z",
            "updated_at": "2026-03-07T14:00:00Z",
        }

    def get_session_summary(self, session_id: str):
        return {
            "session_id": session_id,
            "trace_id": "trace_fake_001",
            "status": "active",
            "stage": "engage",
            "updated_at": "2026-03-07T14:01:00Z",
        }

    def get_session_state(self, session_id: str):
        return {
            "session": {
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "status": "active",
                "stage": "assess",
                "input_modes": ["text", "audio"],
                "avatar_id": "companion_female_01",
                "started_at": "2026-03-07T14:00:00Z",
                "updated_at": "2026-03-07T14:02:00Z",
            },
            "messages": [
                {
                    "message_id": "msg_user_001",
                    "session_id": session_id,
                    "trace_id": "trace_fake_001",
                    "role": "user",
                    "status": "accepted",
                    "source_kind": "text",
                    "content_text": "最近睡不好。",
                    "submitted_at": "2026-03-07T14:01:00Z",
                    "metadata": {"client_seq": 1},
                },
                {
                    "message_id": "msg_assistant_001",
                    "session_id": session_id,
                    "trace_id": "trace_fake_001",
                    "role": "assistant",
                    "status": "completed",
                    "source_kind": "text",
                    "content_text": "这种情况是晚上更明显吗？",
                    "submitted_at": "2026-03-07T14:01:03Z",
                    "metadata": {"stage": "assess", "risk_level": "medium"},
                },
            ],
        }

    def create_user_text_message(self, session_id: str, payload):
        dumped = payload.model_dump()
        self.message_calls.append({"session_id": session_id, **dumped})
        return {
            "session": {
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "status": "active",
                "stage": "engage",
                "updated_at": "2026-03-07T14:01:00Z",
            },
            "message": {
                "message_id": "msg_fake_001",
                "session_id": session_id,
                "trace_id": "trace_fake_001",
                "role": "user",
                "status": "accepted",
                "source_kind": "text",
                "content_text": dumped["content_text"],
                "submitted_at": "2026-03-07T14:01:00Z",
                "client_seq": dumped.get("client_seq"),
            },
        }


def test_create_session_endpoint_returns_contract_shape():
    module = load_gateway_module()
    repository = FakeSessionRepository()
    payload = module.SessionCreateRequest()
    body = module.create_session_record(repository, payload)

    assert isinstance(body, dict)
    assert body["session_id"] == "sess_fake_001"
    assert body["trace_id"] == "trace_fake_001"
    assert body["status"] == "created"
    assert body["stage"] == "engage"
    assert body["input_modes"] == ["text", "audio"]
    assert repository.session_calls[0]["input_modes"] == ["text", "audio"]


def test_create_session_rejects_invalid_input_modes():
    module = load_gateway_module()
    try:
        module.SessionCreateRequest(input_modes=[])
    except ValidationError:
        assert True
        return
    raise AssertionError("expected SessionCreateRequest validation to fail for empty input_modes")


def test_text_message_accept_returns_contract_shape():
    module = load_gateway_module()
    repository = FakeSessionRepository()
    payload = module.TextMessageSubmitRequest(content_text="今天压力有点大", client_seq=3)
    body = module.create_text_message_record(repository, "sess_fake_001", payload)

    assert isinstance(body, dict)
    assert body["message"]["message_id"] == "msg_fake_001"
    assert body["message"]["session_id"] == "sess_fake_001"
    assert body["message"]["trace_id"] == "trace_fake_001"
    assert body["message"]["status"] == "accepted"
    assert body["message"]["content_text"] == "今天压力有点大"
    assert repository.message_calls[0]["client_seq"] == 3


def test_text_message_rejects_blank_content():
    module = load_gateway_module()
    try:
        module.TextMessageSubmitRequest(content_text="   ")
    except ValidationError:
        assert True
        return
    raise AssertionError("expected TextMessageSubmitRequest validation to fail for blank content")


def test_gateway_app_and_readme_document_endpoints():
    module = load_gateway_module()
    app = module.create_app(repository=FakeSessionRepository())
    paths = {route.path for route in app.routes}

    assert "/health" in paths
    assert "/api/session/create" in paths
    assert "/api/session/{session_id}/state" in paths
    assert "/api/session/{session_id}/text" in paths
    assert "/ws/session/{session_id}" in paths

    content = GATEWAY_README.read_text(encoding="utf-8")
    assert "POST /api/session/create" in content
    assert "GET /api/session/{session_id}/state" in content
    assert "POST /api/session/{session_id}/text" in content
    assert "uvicorn" in content


def test_gateway_event_envelope_matches_shared_shape():
    module = load_gateway_module()
    envelope = module.build_event_envelope(
        session={
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
        },
        event_type="message.accepted",
        payload={"connection_status": "alive"},
        message_id="msg_fake_001",
    )

    assert envelope["event_type"] == "message.accepted"
    assert envelope["schema_version"] == "v1alpha1"
    assert envelope["source_service"] == "api_gateway"
    assert envelope["session_id"] == "sess_fake_001"
    assert envelope["trace_id"] == "trace_fake_001"
    assert envelope["message_id"] == "msg_fake_001"


def test_gateway_message_accepted_event_is_json_serializable_after_encoding():
    module = load_gateway_module()
    envelope = module.build_event_envelope(
        session={
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
        },
        event_type="message.accepted",
        payload={
            "message_id": "msg_fake_001",
            "submitted_at": datetime(2026, 3, 8, 10, 30, tzinfo=timezone.utc),
        },
        message_id="msg_fake_001",
    )

    encoded = module.jsonable_encoder(envelope)

    assert encoded["payload"]["submitted_at"] == "2026-03-08T10:30:00+00:00"
    assert json.loads(json.dumps(encoded))["message_id"] == "msg_fake_001"


def test_session_state_record_returns_ordered_messages():
    module = load_gateway_module()
    repository = FakeSessionRepository()

    body = module.create_session_state_record(repository, "sess_fake_001")

    assert isinstance(body, dict)
    assert body["session"]["session_id"] == "sess_fake_001"
    assert body["session"]["stage"] == "assess"
    assert len(body["messages"]) == 2
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][1]["role"] == "assistant"
