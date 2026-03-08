from __future__ import annotations

import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import wave


ROOT = Path(__file__).resolve().parents[1]
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"
ASR_README = ROOT / "services" / "asr-service" / "README.md"
ROOT_README = ROOT / "README.md"


def load_asr_module():
    spec = importlib.util.spec_from_file_location("asr_service_main_test", ASR_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load asr service module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeASREngine:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def transcribe_file(self, audio_path: Path, *, record_id: str | None, audio_metadata):
        self.calls.append(
            {
                "audio_path": audio_path,
                "record_id": record_id,
                "audio_metadata": audio_metadata,
            }
        )
        module = load_asr_module()
        return module.ASREngineResult(
            transcript_text="bonjour test",
            transcript_language="fr-FR",
            confidence_mean=0.91,
            confidence_available=True,
            transcript_segments=[],
        )


def make_wave_bytes(sample_rate_hz: int = 16000, channels: int = 1, duration_frames: int = 8000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate_hz)
        handle.writeframes(b"\x00\x00" * duration_frames * channels)
    return buffer.getvalue()


def build_settings(module):
    return module.ASRSettings(
        service_host="127.0.0.1",
        service_port=8020,
        provider="dashscope",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="test-key",
        model="qwen3-asr-flash",
        language_hint="auto",
        timeout_seconds=60,
        postprocess_enabled=True,
        silence_window_ms=200,
        silence_min_duration_ms=350,
        silence_threshold_ratio=0.015,
        hotword_map_path=str(ROOT / "services" / "asr-service" / "hotwords.json"),
    )


def test_create_transcription_record_returns_contract_shape():
    module = load_asr_module()
    settings = build_settings(module)
    engine = FakeASREngine()

    result = module.create_transcription_record(
        engine,
        settings,
        body=make_wave_bytes(),
        filename="sample.wav",
        content_type="audio/wav",
        record_id="noxi/sample/1",
    )

    assert isinstance(result, dict)
    assert result["record_id"] == "noxi/sample/1"
    assert result["provider"] == "dashscope"
    assert result["model"] == "qwen3-asr-flash"
    assert result["transcript_text"] == "bonjour test."
    assert result["duration_ms"] == 500
    assert result["confidence_mean"] == 0.91
    assert result["confidence_available"] is True
    assert result["audio"]["sample_rate_hz"] == 16000
    assert result["audio"]["channels"] == 1


def test_create_transcription_record_rejects_empty_body():
    module = load_asr_module()
    settings = build_settings(module)
    engine = FakeASREngine()

    response = module.create_transcription_record(
        engine,
        settings,
        body=b"",
        filename="empty.wav",
        content_type="audio/wav",
        record_id="noxi/sample/2",
    )

    assert response.status_code == 400
    assert b"audio_body_empty" in response.body


def test_asr_service_routes_and_docs_are_present():
    module = load_asr_module()
    app = module.create_app(engine=FakeASREngine())
    paths = {route.path for route in app.routes}
    service_readme = ASR_README.read_text(encoding="utf-8")
    root_readme = ROOT_README.read_text(encoding="utf-8")

    assert "/health" in paths
    assert "/api/asr/transcribe" in paths
    assert "POST /api/asr/transcribe" in service_readme
    assert "scripts/verify_asr_service.py" in service_readme
    assert "scripts/verify_asr_service.py" in root_readme


def test_asr_settings_only_use_canonical_asr_environment(monkeypatch):
    module = load_asr_module()
    monkeypatch.setenv("ASR_API_KEY", "canonical-key")
    monkeypatch.setenv("ASR_BASE_URL", "https://canonical.example/v1")
    monkeypatch.setenv("ASR_MODEL", "canonical-model")
    monkeypatch.setenv("OPENAI_API_KEY", "legacy-openai-key")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://legacy-openai.example/v1")
    monkeypatch.setenv("OPENAI_MODEL", "legacy-openai-model")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "legacy-dashscope-key")
    monkeypatch.setenv("DASHSCOPE_BASE_URL", "https://legacy-dashscope.example/v1")

    settings = module.ASRSettings.from_env()

    assert settings.api_key == "canonical-key"
    assert settings.base_url == "https://canonical.example/v1"
    assert settings.model == "canonical-model"


def test_extract_dashscope_message_reads_text_and_language():
    module = load_asr_module()

    transcript_text, transcript_language = module.extract_dashscope_message(
        {
            "output": {
                "choices": [
                    {
                        "message": {
                            "annotations": [{"type": "audio_info", "language": "fr"}],
                            "content": [{"text": "Bonjour tout le monde."}],
                        }
                    }
                ]
            }
        }
    )

    assert transcript_text == "Bonjour tout le monde."
    assert transcript_language == "fr"


def test_dashscope_native_transport_is_used_for_qwen3(monkeypatch):
    module = load_asr_module()
    settings = build_settings(module)
    engine = module.OpenAICompatibleASREngine(settings)
    captured: dict[str, str] = {}

    class FakeHTTPResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return (
                b'{"output":{"choices":[{"message":{"annotations":[{"language":"fr"}],'
                b'"content":[{"text":"Bonjour depuis DashScope."}]}}]}}'
            )

    class FakeOpener:
        def open(self, request, timeout):
            captured["url"] = request.full_url
            captured["authorization"] = request.get_header("Authorization")
            captured["content_type"] = request.get_header("Content-type")
            captured["timeout"] = str(timeout)
            return FakeHTTPResponse()

    monkeypatch.setattr(module.urllib.request, "build_opener", lambda *args: FakeOpener())

    with tempfile.TemporaryDirectory(prefix="vdh_asr_native_") as temp_dir:
        audio_path = Path(temp_dir) / "sample.wav"
        audio_path.write_bytes(make_wave_bytes())
        audio_metadata = module.inspect_audio_file(audio_path, "sample.wav", "audio/wav")
        result = engine.transcribe_file(
            audio_path,
            record_id="noxi/sample/native",
            audio_metadata=audio_metadata,
        )

    assert result.transcript_text == "Bonjour depuis DashScope."
    assert result.transcript_language == "fr"
    assert captured["url"] == module.DEFAULT_DASHSCOPE_QWEN3_NATIVE_URL
    assert captured["authorization"] == "Bearer test-key"
    assert captured["content_type"] == "application/json"
