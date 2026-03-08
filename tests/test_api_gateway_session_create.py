from __future__ import annotations

import importlib.util
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
        self.calls: list[dict] = []

    def create_session(self, payload):
        dumped = payload.model_dump()
        self.calls.append(dumped)
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
            "status": "created",
            "stage": "engage",
            "updated_at": "2026-03-07T14:00:00Z",
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
    assert repository.calls[0]["input_modes"] == ["text", "audio"]


def test_create_session_rejects_invalid_input_modes():
    module = load_gateway_module()
    try:
        module.SessionCreateRequest(input_modes=[])
    except ValidationError:
        assert True
        return
    raise AssertionError("expected SessionCreateRequest validation to fail for empty input_modes")


def test_gateway_app_and_readme_document_endpoint():
    module = load_gateway_module()
    app = module.create_app(repository=FakeSessionRepository())
    paths = {route.path for route in app.routes}

    assert "/health" in paths
    assert "/api/session/create" in paths
    assert "/ws/session/{session_id}" in paths

    content = GATEWAY_README.read_text(encoding="utf-8")
    assert "POST /api/session/create" in content
    assert "uvicorn" in content


def test_gateway_event_envelope_matches_shared_shape():
    module = load_gateway_module()
    envelope = module.build_event_envelope(
        session={
            "session_id": "sess_fake_001",
            "trace_id": "trace_fake_001",
        },
        event_type="session.heartbeat",
        payload={"connection_status": "alive"},
    )

    assert envelope["event_type"] == "session.heartbeat"
    assert envelope["schema_version"] == "v1alpha1"
    assert envelope["source_service"] == "api_gateway"
    assert envelope["session_id"] == "sess_fake_001"
    assert envelope["trace_id"] == "trace_fake_001"
    assert envelope["payload"]["connection_status"] == "alive"
