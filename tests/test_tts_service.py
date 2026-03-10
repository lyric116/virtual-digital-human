from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
TTS_MAIN = ROOT / "services" / "tts-service" / "main.py"
TTS_README = ROOT / "services" / "tts-service" / "README.md"


def load_tts_module():
    spec = importlib.util.spec_from_file_location("tts_service_main_test", TTS_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load tts service module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def build_settings(module):
    return module.TTSServiceSettings(
        tts_service_host="127.0.0.1",
        tts_service_port=8040,
        tts_service_base_url="http://127.0.0.1:8040",
        tts_provider="edge_tts",
        tts_base_url="",
        tts_api_key="",
        tts_model="",
        tts_voice_a="companion_female_01",
        tts_voice_b="coach_male_01",
        tts_audio_format="wav",
        tts_storage_root="data/derived/test_tts_audio",
        tts_cors_origins=("http://127.0.0.1:4173",),
        tts_edge_timeout_seconds=18.0,
        tts_enable_wave_fallback=True,
    )


def test_tts_service_resolves_voice_alias_and_estimates_duration(tmp_path):
    module = load_tts_module()

    assert module.resolve_voice_id(build_settings(module), "companion_female_01") == "zh-CN-XiaoxiaoNeural"
    assert module.resolve_voice_id(build_settings(module), "zh-CN-YunxiNeural") == "zh-CN-YunxiNeural"
    assert module.estimate_duration_ms("短句") < module.estimate_duration_ms("这是一个明显更长的中文句子。")
    duration_ms = module.synthesize_wave_fallback(
        text="这是一个本地兜底音频。",
        output_path=tmp_path / "fallback.wav",
    )
    assert duration_ms >= module.estimate_duration_ms("这是一个本地兜底音频。")
    assert (tmp_path / "fallback.wav").exists()


def test_tts_service_synthesizes_contract_with_mocked_edge_tts(tmp_path, monkeypatch):
    module = load_tts_module()
    settings = build_settings(module)
    settings.tts_storage_root = str(tmp_path)

    async def fake_synthesize_edge_tts(*, text, voice_id, output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"fake-mp3-data")
        return 2345

    monkeypatch.setattr(module, "synthesize_edge_tts", fake_synthesize_edge_tts)

    response = asyncio.run(
        module.synthesize_tts_asset(
            settings,
            module.TTSSynthesizeRequest(
                text="我们先慢一点，把现在最难受的部分说清楚。",
                voice_id="companion_female_01",
                session_id="sess_fake_001",
                trace_id="trace_fake_001",
                message_id="msg_assistant_001",
            ),
        )
    )

    assert response.audio_format == "mp3"
    assert response.voice_id == "zh-CN-XiaoxiaoNeural"
    assert response.duration_ms == 2345
    assert response.byte_size == len(b"fake-mp3-data")
    assert response.audio_url.endswith(".mp3")
    assert response.provider_used == "edge_tts"
    assert response.fallback_used is False


def test_tts_service_falls_back_to_wave_when_edge_tts_fails(tmp_path, monkeypatch):
    module = load_tts_module()
    settings = build_settings(module)
    settings.tts_storage_root = str(tmp_path)
    settings.tts_edge_timeout_seconds = 0.01
    settings.tts_enable_wave_fallback = True

    async def fake_synthesize_edge_tts(*, text, voice_id, output_path):
        raise TimeoutError("edge_tts upstream timeout")

    monkeypatch.setattr(module, "synthesize_edge_tts", fake_synthesize_edge_tts)

    response = asyncio.run(
        module.synthesize_tts_asset(
            settings,
            module.TTSSynthesizeRequest(
                text="这是回退路径测试。",
                voice_id="coach_male_01",
                session_id="sess_fake_002",
                trace_id="trace_fake_002",
                message_id="msg_assistant_002",
            ),
        )
    )

    assert response.audio_format == "wav"
    assert response.voice_id == "zh-CN-YunxiNeural"
    assert response.duration_ms >= module.estimate_duration_ms("这是回退路径测试。")
    assert response.byte_size > 0
    assert response.audio_url.endswith(".wav")
    assert response.provider_used == "wave_fallback"
    assert response.fallback_used is True
    assert response.fallback_reason == "TimeoutError"


def test_tts_service_app_and_readme_document_endpoints():
    module = load_tts_module()
    app = module.create_app()
    paths = {route.path for route in app.routes}
    content = TTS_README.read_text(encoding="utf-8")

    assert "/health" in paths
    assert "/internal/tts/synthesize" in paths
    assert "/media/tts/{filename}" in paths
    assert "POST /internal/tts/synthesize" in content


def test_tts_service_route_translates_runtime_error(monkeypatch):
    module = load_tts_module()
    app = module.create_app()
    route = next(route for route in app.routes if route.path == "/internal/tts/synthesize")

    async def boom(settings, payload):
        raise RuntimeError("tts upstream unavailable")

    monkeypatch.setattr(module, "synthesize_tts_asset", boom)

    try:
        asyncio.run(route.endpoint(module.TTSSynthesizeRequest(text="普通文本")))
    except module.HTTPException as exc:
        assert exc.status_code == 502
        assert exc.detail == "tts upstream unavailable"
    else:
        raise AssertionError("expected tts route to translate runtime error")
