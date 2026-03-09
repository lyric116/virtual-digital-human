from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"


def load_gateway_module():
    spec = importlib.util.spec_from_file_location("api_gateway_audio_chunk_test", GATEWAY_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load api gateway module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeAudioChunkRepository:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def create_audio_chunk_index(
        self,
        session_id: str,
        *,
        content: bytes,
        chunk_seq: int,
        chunk_started_at_ms: int | None,
        duration_ms: int | None,
        is_final: bool,
        mime_type: str,
        metadata: dict | None = None,
    ) -> dict:
        self.calls.append(
            {
                "session_id": session_id,
                "content": content,
                "chunk_seq": chunk_seq,
                "chunk_started_at_ms": chunk_started_at_ms,
                "duration_ms": duration_ms,
                "is_final": is_final,
                "mime_type": mime_type,
                "metadata": metadata,
            }
        )
        if session_id == "missing":
            raise KeyError(session_id)

        return {
            "media_id": "media_fake_001",
            "session_id": session_id,
            "trace_id": "trace_fake_001",
            "media_kind": "audio_chunk",
            "storage_backend": "local",
            "storage_path": "data/derived/live_media/audio_chunks/sess_fake/000001_media_fake_001.webm",
            "mime_type": mime_type,
            "duration_ms": duration_ms,
            "byte_size": len(content),
            "chunk_seq": chunk_seq,
            "chunk_started_at_ms": chunk_started_at_ms,
            "is_final": is_final,
            "created_at": "2026-03-08T16:00:00Z",
        }


def test_audio_chunk_record_returns_contract_shape():
    module = load_gateway_module()
    repository = FakeAudioChunkRepository()

    body = module.create_audio_chunk_record(
        repository,
        "sess_fake_001",
        content=b"fake audio bytes",
        chunk_seq=2,
        chunk_started_at_ms=250,
        duration_ms=250,
        is_final=False,
        mime_type="audio/webm",
        metadata={"source": "web-shell"},
    )

    assert isinstance(body, dict)
    assert body["media_id"] == "media_fake_001"
    assert body["session_id"] == "sess_fake_001"
    assert body["storage_backend"] == "local"
    assert body["mime_type"] == "audio/webm"
    assert body["chunk_seq"] == 2
    assert repository.calls[0]["duration_ms"] == 250


def test_audio_chunk_record_rejects_empty_body():
    module = load_gateway_module()
    repository = FakeAudioChunkRepository()

    response = module.create_audio_chunk_record(
        repository,
        "sess_fake_001",
        content=b"",
        chunk_seq=1,
        chunk_started_at_ms=0,
        duration_ms=250,
        is_final=False,
        mime_type="audio/webm",
        metadata={"source": "web-shell"},
    )

    assert response.status_code == 400
    payload = json.loads(response.body.decode("utf-8"))
    assert payload["error_code"] == "audio_chunk_empty"


def test_audio_chunk_record_normalizes_content_type_parameters():
    module = load_gateway_module()
    repository = FakeAudioChunkRepository()

    body = module.create_audio_chunk_record(
        repository,
        "sess_fake_001",
        content=b"fake audio bytes",
        chunk_seq=2,
        chunk_started_at_ms=250,
        duration_ms=250,
        is_final=False,
        mime_type="audio/webm;codecs=opus",
        metadata={"source": "web-shell"},
    )

    assert isinstance(body, dict)
    assert body["mime_type"] == "audio/webm"
    assert repository.calls[0]["mime_type"] == "audio/webm"


def test_audio_chunk_route_and_readme_are_present():
    module = load_gateway_module()

    class RouteRepository(FakeAudioChunkRepository):
        def create_session(self, payload):
            return {}

        def get_session_summary(self, session_id: str):
            return None

        def get_session_state(self, session_id: str):
            return None

        def get_session_export(self, session_id: str):
            return None

        def create_user_text_message(self, session_id: str, payload):
            return {}

        def create_assistant_dialogue_message(self, session_id: str, payload):
            return {}

        def record_system_event(self, envelope: dict):
            return None

    app = module.create_app(repository=RouteRepository())
    paths = {route.path for route in app.routes}
    readme = GATEWAY_README.read_text(encoding="utf-8")

    assert "/api/session/{session_id}/audio/chunk" in paths
    assert "POST /api/session/{session_id}/audio/chunk" in readme
