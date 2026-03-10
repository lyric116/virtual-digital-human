from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"


def load_gateway_module():
    spec = importlib.util.spec_from_file_location("api_gateway_video_frame_test", GATEWAY_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load api gateway module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeVideoFrameRepository:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def create_video_frame_index(
        self,
        session_id: str,
        *,
        content: bytes,
        frame_seq: int,
        captured_at_ms: int | None,
        width: int | None,
        height: int | None,
        mime_type: str,
        metadata: dict | None = None,
    ) -> dict:
        self.calls.append(
            {
                "session_id": session_id,
                "content": content,
                "frame_seq": frame_seq,
                "captured_at_ms": captured_at_ms,
                "width": width,
                "height": height,
                "mime_type": mime_type,
                "metadata": metadata,
            }
        )
        if session_id == "missing":
            raise KeyError(session_id)

        return {
            "media_id": "media_video_001",
            "session_id": session_id,
            "trace_id": "trace_video_001",
            "media_kind": "video_frame",
            "storage_backend": "local",
            "storage_path": "data/derived/live_media/video_frames/sess_fake/000001_media_video_001.jpg",
            "mime_type": mime_type,
            "byte_size": len(content),
            "frame_seq": frame_seq,
            "captured_at_ms": captured_at_ms,
            "width": width,
            "height": height,
            "created_at": "2026-03-10T10:00:00Z",
        }


def test_video_frame_record_returns_contract_shape():
    module = load_gateway_module()
    repository = FakeVideoFrameRepository()

    body = module.create_video_frame_record(
        repository,
        "sess_fake_001",
        content=b"fake frame bytes",
        frame_seq=3,
        captured_at_ms=1800,
        width=640,
        height=360,
        mime_type="image/jpeg",
        metadata={"source": "web-shell"},
    )

    assert isinstance(body, dict)
    assert body["media_id"] == "media_video_001"
    assert body["media_kind"] == "video_frame"
    assert body["frame_seq"] == 3
    assert body["width"] == 640
    assert repository.calls[0]["mime_type"] == "image/jpeg"


def test_video_frame_record_rejects_empty_body():
    module = load_gateway_module()
    repository = FakeVideoFrameRepository()

    response = module.create_video_frame_record(
        repository,
        "sess_fake_001",
        content=b"",
        frame_seq=1,
        captured_at_ms=0,
        width=640,
        height=360,
        mime_type="image/jpeg",
        metadata={"source": "web-shell"},
    )

    assert response.status_code == 400
    payload = json.loads(response.body.decode("utf-8"))
    assert payload["error_code"] == "video_frame_empty"


def test_video_frame_record_normalizes_content_type_parameters():
    module = load_gateway_module()
    repository = FakeVideoFrameRepository()

    body = module.create_video_frame_record(
        repository,
        "sess_fake_001",
        content=b"fake frame bytes",
        frame_seq=2,
        captured_at_ms=900,
        width=640,
        height=360,
        mime_type="image/jpeg;quality=0.8",
        metadata={"source": "web-shell"},
    )

    assert isinstance(body, dict)
    assert body["mime_type"] == "image/jpeg"
    assert repository.calls[0]["mime_type"] == "image/jpeg"


def test_video_frame_route_and_readme_are_present():
    module = load_gateway_module()

    class RouteRepository(FakeVideoFrameRepository):
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

        def create_audio_chunk_index(self, session_id: str, **kwargs):
            return {}

        def create_audio_final_asset(self, session_id: str, **kwargs):
            return {}

        def record_system_event(self, envelope: dict):
            return None

    app = module.create_app(repository=RouteRepository())
    paths = {route.path for route in app.routes}
    readme = GATEWAY_README.read_text(encoding="utf-8")

    assert "/api/session/{session_id}/video/frame" in paths
    assert "POST /api/session/{session_id}/video/frame" in readme
