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
    spec = importlib.util.spec_from_file_location("asr_postprocess_test", ASR_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load asr service module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class RawTranscriptEngine:
    def transcribe_file(self, audio_path: Path, *, record_id: str | None, audio_metadata):
        module = load_asr_module()
        return module.ASREngineResult(
            transcript_text=(
                "de reflex mais compact je sais pas si tu connais un petit peu "
                "les appareils photo qu on peut changer ensuite l optique fait souvent la photo"
            ),
            transcript_language="fr",
            confidence_mean=None,
            confidence_available=False,
            transcript_segments=[],
        )


def build_settings(module, *, enabled: bool):
    return module.ASRSettings(
        service_host="127.0.0.1",
        service_port=8020,
        provider="dashscope",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="test-key",
        model="qwen3-asr-flash",
        language_hint="auto",
        timeout_seconds=60,
        postprocess_enabled=enabled,
        silence_window_ms=200,
        silence_min_duration_ms=350,
        silence_threshold_ratio=0.015,
        hotword_map_path=str(ROOT / "services" / "asr-service" / "hotwords.json"),
    )


def make_wave_with_pauses(sample_rate_hz: int = 16000) -> bytes:
    def frames(value: int, count: int) -> bytes:
        return int(value).to_bytes(2, byteorder="little", signed=True) * count

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate_hz)
        handle.writeframes(frames(8000, 2400))
        handle.writeframes(frames(0, 8000))
        handle.writeframes(frames(6000, 2400))
        handle.writeframes(frames(0, 8000))
        handle.writeframes(frames(7000, 2400))
    return buffer.getvalue()


def test_create_transcription_record_applies_pause_punctuation_and_hotword_cleanup():
    module = load_asr_module()
    engine = RawTranscriptEngine()

    raw_result = module.create_transcription_record(
        engine,
        build_settings(module, enabled=False),
        body=make_wave_with_pauses(),
        filename="sample.wav",
        content_type="audio/wav",
        record_id="noxi/sample/pause",
    )
    enhanced_result = module.create_transcription_record(
        engine,
        build_settings(module, enabled=True),
        body=make_wave_with_pauses(),
        filename="sample.wav",
        content_type="audio/wav",
        record_id="noxi/sample/pause",
    )

    assert raw_result["transcript_text"].startswith("de reflex")
    assert "de réflexe" in enhanced_result["transcript_text"]
    assert "," in enhanced_result["transcript_text"] or "." in enhanced_result["transcript_text"]
    assert enhanced_result["transcript_text"].endswith(".")
    assert len(enhanced_result["transcript_segments"]) >= 2
    assert "si tu," not in enhanced_result["transcript_text"]
    assert "qu'ont," not in enhanced_result["transcript_text"]
    assert "si tu connais" in enhanced_result["transcript_text"]
    assert "qu'on peut" in enhanced_result["transcript_text"]


def test_detect_silence_spans_finds_long_pauses_in_wave_audio():
    module = load_asr_module()
    settings = build_settings(module, enabled=True)

    with tempfile.TemporaryDirectory(prefix="vdh_asr_pause_") as temp_dir:
        temp_audio = Path(temp_dir) / "sample.wav"
        temp_audio.write_bytes(make_wave_with_pauses())
        audio_metadata = module.inspect_audio_file(
            temp_audio,
            filename="sample.wav",
            content_type="audio/wav",
        )
        silence_spans = module.detect_silence_spans(temp_audio, audio_metadata, settings)

    assert len(silence_spans) >= 2
    assert silence_spans[0]["duration_ms"] >= 350


def test_asr_postprocess_docs_are_present():
    service_readme = ASR_README.read_text(encoding="utf-8")
    root_readme = ROOT_README.read_text(encoding="utf-8")

    assert "silence handling" in service_readme
    assert "scripts/verify_asr_postprocess.py" in service_readme
    assert "scripts/verify_asr_postprocess.py" in root_readme
