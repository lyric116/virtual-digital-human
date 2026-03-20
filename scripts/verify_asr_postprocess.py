#!/usr/bin/env python3
"""Verify ASR postprocessing improves readability on the same audio sample."""

from __future__ import annotations

import importlib.util
import io
import json
from pathlib import Path
import sys
import wave


ROOT = Path(__file__).resolve().parents[1]
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"


def load_asr_module():
    spec = importlib.util.spec_from_file_location("asr_postprocess_verify", ASR_MAIN)
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


def main() -> None:
    module = load_asr_module()
    engine = RawTranscriptEngine()
    audio_bytes = make_wave_with_pauses()

    raw_result = module.create_transcription_record(
        engine,
        build_settings(module, enabled=False),
        body=audio_bytes,
        filename="pause_sample.wav",
        content_type="audio/wav",
        record_id="synthetic/pause/001",
    )
    enhanced_result = module.create_transcription_record(
        engine,
        build_settings(module, enabled=True),
        body=audio_bytes,
        filename="pause_sample.wav",
        content_type="audio/wav",
        record_id="synthetic/pause/001",
    )

    if raw_result["transcript_text"] == enhanced_result["transcript_text"]:
        raise RuntimeError("postprocessing did not change the transcript text")
    if "de réflexe" not in enhanced_result["transcript_text"]:
        raise RuntimeError("hotword replacement did not apply to the enhanced transcript")
    if len(enhanced_result["transcript_segments"]) < 2:
        raise RuntimeError("pause-aware segmentation did not produce multiple segments")
    if not enhanced_result["transcript_text"].endswith("."):
        raise RuntimeError("enhanced transcript is missing terminal punctuation")
    if "si tu," in enhanced_result["transcript_text"]:
        raise RuntimeError("pause-aware segmentation split an obvious French clause incorrectly")
    if "qu'ont," in enhanced_result["transcript_text"]:
        raise RuntimeError("hotword cleanup plus punctuation produced an invalid French boundary")

    print(
        json.dumps(
            {
                "raw_transcript": raw_result["transcript_text"],
                "enhanced_transcript": enhanced_result["transcript_text"],
                "enhanced_segments": enhanced_result["transcript_segments"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
