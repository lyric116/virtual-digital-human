from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys

from starlette.requests import Request


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
        tts_stream_sample_rate_hz=24_000,
        tts_stream_timeout_seconds=90.0,
        tts_stream_session_ttl_seconds=120.0,
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
    assert "/internal/tts/synthesize-stream" in paths
    assert "/internal/tts/stream/{tts_id}" in paths
    assert "/media/tts/{filename}" in paths
    assert "POST /internal/tts/synthesize" in content


def test_tts_service_route_translates_runtime_error(monkeypatch):
    module = load_tts_module()
    app = module.create_app()
    route = next(route for route in app.routes if route.path == "/internal/tts/synthesize")

    async def boom(settings, payload, *, public_base_url=None):
        raise RuntimeError("tts upstream unavailable")

    monkeypatch.setattr(module, "synthesize_tts_asset", boom)
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "http",
            "path": "/internal/tts/synthesize",
            "root_path": "",
            "headers": [],
            "query_string": b"",
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
        },
    )

    try:
        asyncio.run(route.endpoint(request, module.TTSSynthesizeRequest(text="普通文本")))
    except module.HTTPException as exc:
        assert exc.status_code == 502
        assert exc.detail == "tts upstream unavailable"
    else:
        raise AssertionError("expected tts route to translate runtime error")


def test_tts_service_route_uses_request_base_url_for_audio_url(monkeypatch):
    module = load_tts_module()
    app = module.create_app()
    route = next(route for route in app.routes if route.path == "/internal/tts/synthesize")
    captured = {}

    async def fake_synthesize(settings, payload, *, public_base_url=None):
        captured["public_base_url"] = public_base_url
        return module.TTSSynthesizeResponse(
            tts_id="tts_route_001",
            session_id=payload.session_id,
            trace_id=payload.trace_id,
            message_id=payload.message_id,
            voice_id="zh-CN-XiaoxiaoNeural",
            subtitle=payload.text,
            audio_format="wav",
            audio_url=f"{public_base_url}/media/tts/tts_route_001.wav",
            duration_ms=1200,
            byte_size=128,
            provider_used="wave_fallback",
            fallback_used=True,
            fallback_reason="provider_forced_wave_fallback",
            generated_at=module.datetime.now(module.timezone.utc),
        )

    monkeypatch.setattr(module, "synthesize_tts_asset", fake_synthesize)
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "http",
            "path": "/internal/tts/synthesize",
            "root_path": "",
            "headers": [],
            "query_string": b"",
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
        },
    )
    response = asyncio.run(route.endpoint(request, module.TTSSynthesizeRequest(text="普通文本")))

    assert captured["public_base_url"] == "http://testserver"
    assert response.audio_url == "http://testserver/media/tts/tts_route_001.wav"


def test_tts_service_prepares_streaming_session_when_model_configured(tmp_path):
    module = load_tts_module()
    settings = build_settings(module)
    settings.tts_storage_root = str(tmp_path)
    settings.tts_base_url = "https://dashscope.aliyuncs.com/api/v1"
    settings.tts_api_key = "sk-test"
    settings.tts_model = "qwen3-tts-flash"
    app = module.create_app()

    response = module.prepare_stream_tts_session(
        app,
        settings,
        module.TTSSynthesizeRequest(
            text="你好，欢迎回来。",
            voice_id="companion_female_01",
            session_id="sess_stream_001",
            trace_id="trace_stream_001",
            message_id="msg_stream_001",
        ),
        public_base_url="http://testserver",
    )

    assert response.streaming is True
    assert response.provider_used == "qwen_tts_stream"
    assert response.audio_format == "wav"
    assert response.voice_id == "Cherry"
    assert response.audio_url.startswith("http://testserver/media/tts/")
    assert response.stream_url == f"http://testserver/internal/tts/stream/{response.tts_id}"
    assert response.stream_audio_format == "pcm_s16le"
    assert response.stream_sample_rate_hz == 24_000
    assert response.tts_id in app.state.prepared_stream_sessions


def test_tts_service_stream_route_returns_ndjson(monkeypatch):
    module = load_tts_module()
    app = module.create_app()
    settings = app.state.settings
    settings.tts_base_url = "https://dashscope.aliyuncs.com/api/v1"
    settings.tts_api_key = "sk-test"
    settings.tts_model = "qwen3-tts-flash"

    prepared = module.prepare_stream_tts_session(
        app,
        settings,
        module.TTSSynthesizeRequest(
            text="欢迎回来。",
            session_id="sess_stream_002",
            trace_id="trace_stream_002",
            message_id="msg_stream_002",
        ),
        public_base_url="http://testserver",
    )
    route = next(route for route in app.routes if route.path == "/internal/tts/stream/{tts_id}")

    async def fake_stream_response(stream_settings, pending):
        yield module.encode_stream_event({"type": "started", "tts_id": pending.tts_id})
        yield module.encode_stream_event(
            {
                "type": "completed",
                "tts_id": pending.tts_id,
                "audio_url": pending.audio_url,
                "audio_format": "wav",
                "duration_ms": 1200,
                "byte_size": 128,
                "generated_at": pending.generated_at.isoformat(),
                "provider_used": "qwen_tts_stream",
            }
        )

    monkeypatch.setattr(module, "build_streaming_tts_response", fake_stream_response)
    response = asyncio.run(route.endpoint(prepared.tts_id))
    body = b"".join(asyncio.run(_collect_async_chunks(response.body_iterator)))

    assert response.media_type == "application/x-ndjson"
    assert b'"type": "started"' in body
    assert b'"type": "completed"' in body


async def _collect_async_chunks(iterator):
    chunks = []
    async for chunk in iterator:
        chunks.append(chunk)
    return chunks
