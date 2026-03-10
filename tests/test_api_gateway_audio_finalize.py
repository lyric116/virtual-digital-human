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
    spec = importlib.util.spec_from_file_location("api_gateway_audio_finalize_test", GATEWAY_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load api gateway module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeAudioFinalizeRepository:
    def __init__(self) -> None:
        self.final_asset_calls: list[dict] = []
        self.audio_message_calls: list[dict] = []
        self.deleted_media_ids: list[str] = []

    def create_audio_final_asset(
        self,
        session_id: str,
        *,
        content: bytes,
        duration_ms: int | None,
        mime_type: str,
        metadata: dict | None = None,
    ) -> dict:
        self.final_asset_calls.append(
            {
                "session_id": session_id,
                "content": content,
                "duration_ms": duration_ms,
                "mime_type": mime_type,
                "metadata": metadata,
            }
        )
        if session_id == "missing":
            raise KeyError(session_id)
        return {
            "media_id": "media_audio_final_001",
            "session_id": session_id,
            "trace_id": "trace_audio_final_001",
            "media_kind": "audio_final",
            "storage_backend": "local",
            "storage_path": "data/derived/live_media/audio_final/sess_fake/media_audio_final_001.wav",
            "mime_type": mime_type,
            "duration_ms": duration_ms,
            "byte_size": len(content),
            "created_at": datetime(2026, 3, 8, 16, 40, tzinfo=timezone.utc),
        }

    def create_user_audio_message(
        self,
        session_id: str,
        *,
        content_text: str,
        metadata: dict | None = None,
    ) -> dict:
        self.audio_message_calls.append(
            {
                "session_id": session_id,
                "content_text": content_text,
                "metadata": metadata,
            }
        )
        return {
            "session": {
                "session_id": session_id,
                "trace_id": "trace_audio_final_001",
                "status": "active",
                "stage": "engage",
                "updated_at": datetime(2026, 3, 8, 16, 40, 5, tzinfo=timezone.utc),
            },
            "message": {
                "message_id": "msg_audio_final_001",
                "session_id": session_id,
                "trace_id": "trace_audio_final_001",
                "role": "user",
                "status": "accepted",
                "source_kind": "audio",
                "content_text": content_text,
                "submitted_at": datetime(2026, 3, 8, 16, 40, 5, tzinfo=timezone.utc),
            },
        }

    def delete_media_asset(self, media_id: str) -> None:
        self.deleted_media_ids.append(media_id)


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


def test_audio_message_record_calls_asr_and_creates_audio_user_message():
    module = load_gateway_module()
    repository = FakeAudioFinalizeRepository()
    settings = build_settings(module)

    def fake_request_asr_transcription(settings_obj, *, body: bytes, mime_type: str):
        assert settings_obj.asr_service_base_url == "http://127.0.0.1:8020"
        assert body == b"wav-bytes"
        assert mime_type == "audio/wav"
        return module.ASRServiceTranscriptionResponse(
            request_id="req_asr_001",
            record_id=None,
            provider="dashscope",
            model="qwen3-asr-flash",
            transcript_text="Bonjour, je me sens un peu tendu aujourd'hui.",
            transcript_language="fr",
            duration_ms=740,
            confidence_mean=None,
            confidence_available=False,
            transcript_segments=[],
            audio={"filename": "recording.wav", "content_type": "audio/wav", "byte_size": 9},
            generated_at=datetime(2026, 3, 8, 16, 40, 4, tzinfo=timezone.utc),
        )

    module.request_asr_transcription = fake_request_asr_transcription

    result = module.create_audio_message_record(
        repository,
        settings,
        "sess_fake_001",
        content=b"wav-bytes",
        duration_ms=740,
        mime_type="audio/wav",
    )

    assert isinstance(result, dict)
    assert result["audio"]["media_id"] == "media_audio_final_001"
    assert result["message"]["message_id"] == "msg_audio_final_001"
    assert result["message"]["source_kind"] == "audio"
    assert result["message"]["content_text"].startswith("Bonjour")
    assert result["transcription"]["model"] == "qwen3-asr-flash"
    assert repository.final_asset_calls[0]["mime_type"] == "audio/wav"
    assert repository.audio_message_calls[0]["metadata"]["audio_media_id"] == "media_audio_final_001"
    assert repository.audio_message_calls[0]["metadata"]["asr_provider"] == "dashscope"


def test_audio_message_record_normalizes_webm_content_type_parameters():
    module = load_gateway_module()
    repository = FakeAudioFinalizeRepository()
    settings = build_settings(module)

    def fake_request_asr_transcription(settings_obj, *, body: bytes, mime_type: str):
        assert mime_type == "audio/webm"
        return module.ASRServiceTranscriptionResponse(
            request_id="req_asr_webm_001",
            record_id=None,
            provider="dashscope",
            model="qwen3-asr-flash",
            transcript_text="测试语音。",
            transcript_language="zh-CN",
            duration_ms=320,
            confidence_mean=None,
            confidence_available=False,
            transcript_segments=[],
            audio={"filename": "recording.webm", "content_type": mime_type, "byte_size": 10},
            generated_at=datetime(2026, 3, 8, 16, 40, 4, tzinfo=timezone.utc),
        )

    module.request_asr_transcription = fake_request_asr_transcription

    result = module.create_audio_message_record(
        repository,
        settings,
        "sess_fake_001",
        content=b"webm-bytes",
        duration_ms=320,
        mime_type="audio/webm;codecs=opus",
    )

    assert isinstance(result, dict)
    assert result["audio"]["mime_type"] == "audio/webm"
    assert repository.final_asset_calls[0]["mime_type"] == "audio/webm"
    assert repository.audio_message_calls[0]["metadata"]["audio_mime_type"] == "audio/webm"


def test_audio_message_record_rejects_empty_audio_body():
    module = load_gateway_module()
    repository = FakeAudioFinalizeRepository()
    settings = build_settings(module)

    response = module.create_audio_message_record(
        repository,
        settings,
        "sess_fake_001",
        content=b"",
        duration_ms=0,
        mime_type="audio/wav",
    )

    assert response.status_code == 400
    payload = json.loads(response.body.decode("utf-8"))
    assert payload["error_code"] == "audio_final_empty"


def test_audio_message_record_rejects_negative_duration():
    module = load_gateway_module()
    repository = FakeAudioFinalizeRepository()
    settings = build_settings(module)

    response = module.create_audio_message_record(
        repository,
        settings,
        "sess_fake_001",
        content=b"wav-bytes",
        duration_ms=-1,
        mime_type="audio/wav",
    )

    assert response.status_code == 400
    payload = json.loads(response.body.decode("utf-8"))
    assert payload["error_code"] == "audio_final_invalid_duration"


def test_audio_message_record_cleans_up_orphan_asset_when_asr_fails():
    module = load_gateway_module()
    repository = FakeAudioFinalizeRepository()
    settings = build_settings(module)

    def fake_request_asr_transcription(settings_obj, *, body: bytes, mime_type: str):
        raise RuntimeError("upstream timeout")

    module.request_asr_transcription = fake_request_asr_transcription

    response = module.create_audio_message_record(
        repository,
        settings,
        "sess_fake_001",
        content=b"wav-bytes",
        duration_ms=740,
        mime_type="audio/wav",
    )

    assert response.status_code == 502
    payload = json.loads(response.body.decode("utf-8"))
    assert payload["error_code"] == "audio_transcription_failed"
    assert repository.deleted_media_ids == ["media_audio_final_001"]


def test_audio_message_record_cleans_up_orphan_asset_when_asr_is_empty():
    module = load_gateway_module()
    repository = FakeAudioFinalizeRepository()
    settings = build_settings(module)

    def fake_request_asr_transcription(settings_obj, *, body: bytes, mime_type: str):
        return module.ASRServiceTranscriptionResponse(
            request_id="req_asr_empty_001",
            record_id=None,
            provider="dashscope",
            model="qwen3-asr-flash",
            transcript_text="   ",
            transcript_language="zh-CN",
            duration_ms=320,
            confidence_mean=None,
            confidence_available=False,
            transcript_segments=[],
            audio={"filename": "recording.wav", "content_type": mime_type, "byte_size": len(body)},
            generated_at=datetime(2026, 3, 8, 16, 40, 4, tzinfo=timezone.utc),
        )

    module.request_asr_transcription = fake_request_asr_transcription

    response = module.create_audio_message_record(
        repository,
        settings,
        "sess_fake_001",
        content=b"wav-bytes",
        duration_ms=740,
        mime_type="audio/wav",
    )

    assert response.status_code == 502
    payload = json.loads(response.body.decode("utf-8"))
    assert payload["error_code"] == "audio_transcription_empty"
    assert repository.deleted_media_ids == ["media_audio_final_001"]


def test_audio_finalize_route_and_readme_are_present():
    module = load_gateway_module()

    class RouteRepository(FakeAudioFinalizeRepository):
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

        def record_system_event(self, envelope: dict):
            return None

    app = module.create_app(repository=RouteRepository())
    paths = {route.path for route in app.routes}
    readme = GATEWAY_README.read_text(encoding="utf-8")

    assert "/api/session/{session_id}/audio/finalize" in paths
    assert "POST /api/session/{session_id}/audio/finalize" in readme
