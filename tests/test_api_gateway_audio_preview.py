from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"


def load_gateway_module():
    spec = importlib.util.spec_from_file_location("api_gateway_audio_preview_test", GATEWAY_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load api gateway module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeAudioPreviewRepository:
    def get_session_summary(self, session_id: str) -> dict | None:
        if session_id == "missing":
            return None
        return {
            "session_id": session_id,
            "trace_id": "trace_audio_preview_001",
            "status": "active",
            "stage": "engage",
            "updated_at": datetime(2026, 3, 8, 20, 0, tzinfo=timezone.utc),
        }


def build_settings(module):
    return module.GatewaySettings(
        database_url="postgresql://app:change_me@localhost:5432/virtual_human",
        default_avatar_id="companion_female_01",
        gateway_host="127.0.0.1",
        gateway_port=8000,
        cors_origins=["http://127.0.0.1:4173"],
        orchestrator_base_url="http://127.0.0.1:8010",
        orchestrator_timeout_seconds=60.0,
        asr_service_base_url="http://127.0.0.1:8020",
        asr_timeout_seconds=60.0,
        media_storage_root="data/derived/live_media",
    )


def test_audio_preview_record_returns_partial_contract_shape():
    module = load_gateway_module()
    repository = FakeAudioPreviewRepository()
    settings = build_settings(module)

    def fake_request_asr_transcription(settings_obj, *, body: bytes, mime_type: str):
        assert settings_obj.asr_service_base_url == "http://127.0.0.1:8020"
        assert body == b"wav-preview"
        assert mime_type == "audio/wav"
        return module.ASRServiceTranscriptionResponse(
            request_id="req_asr_preview_001",
            record_id=None,
            provider="dashscope",
            model="qwen3-asr-flash",
            transcript_text="Bonjour, je me sens ...",
            transcript_language="fr",
            duration_ms=500,
            confidence_mean=None,
            confidence_available=False,
            transcript_segments=[],
            audio={"filename": "recording.wav", "content_type": "audio/wav", "byte_size": 11},
            generated_at=datetime(2026, 3, 8, 20, 0, 1, tzinfo=timezone.utc),
        )

    module.request_asr_transcription = fake_request_asr_transcription

    result = module.create_audio_preview_record(
        repository,
        settings,
        "sess_fake_001",
        content=b"wav-preview",
        duration_ms=500,
        mime_type="audio/wav",
        preview_seq=2,
        recording_id="rec_001",
    )

    assert isinstance(result, dict)
    assert result["session"]["trace_id"] == "trace_audio_preview_001"
    assert result["transcript"]["transcript_kind"] == "partial"
    assert result["transcript"]["preview_seq"] == 2
    assert result["transcript"]["recording_id"] == "rec_001"
    assert result["transcript"]["text"].startswith("Bonjour")


def test_audio_preview_record_rejects_empty_audio_body():
    module = load_gateway_module()
    repository = FakeAudioPreviewRepository()
    settings = build_settings(module)

    response = module.create_audio_preview_record(
        repository,
        settings,
        "sess_fake_001",
        content=b"",
        duration_ms=0,
        mime_type="audio/wav",
        preview_seq=1,
        recording_id="rec_001",
    )

    assert response.status_code == 400
    payload = json.loads(response.body.decode("utf-8"))
    assert payload["error_code"] == "audio_preview_empty"


def test_audio_preview_record_normalizes_webm_content_type_parameters():
    module = load_gateway_module()
    repository = FakeAudioPreviewRepository()
    settings = build_settings(module)

    def fake_request_asr_transcription(settings_obj, *, body: bytes, mime_type: str):
        assert mime_type == "audio/webm"
        return module.ASRServiceTranscriptionResponse(
            request_id="req_asr_preview_002",
            record_id=None,
            provider="dashscope",
            model="qwen3-asr-flash",
            transcript_text="测试预览",
            transcript_language="zh-CN",
            duration_ms=260,
            confidence_mean=None,
            confidence_available=False,
            transcript_segments=[],
            audio={"filename": "recording.webm", "content_type": mime_type, "byte_size": 11},
            generated_at=datetime(2026, 3, 8, 20, 0, 1, tzinfo=timezone.utc),
        )

    module.request_asr_transcription = fake_request_asr_transcription

    result = module.create_audio_preview_record(
        repository,
        settings,
        "sess_fake_001",
        content=b"webm-preview",
        duration_ms=260,
        mime_type="audio/webm;codecs=opus",
        preview_seq=3,
        recording_id="rec_002",
    )

    assert isinstance(result, dict)
    assert result["transcript"]["text"] == "测试预览"


def test_audio_preview_route_and_readme_are_present():
    module = load_gateway_module()

    class RouteRepository(FakeAudioPreviewRepository):
        def create_session(self, payload):
            return {}

        def get_session_state(self, session_id: str):
            return None

        def get_session_export(self, session_id: str):
            return None

        def create_user_text_message(self, session_id: str, payload):
            return {}

        def create_user_audio_message(self, session_id: str, *, content_text: str, metadata: dict | None = None):
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

    assert "/api/session/{session_id}/audio/preview" in paths
    assert "POST /api/session/{session_id}/audio/preview" in readme
