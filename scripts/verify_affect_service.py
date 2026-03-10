#!/usr/bin/env python3
"""Verify deterministic affect snapshots for steps 37-39 without live model services."""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path
import sys
import tempfile
import wave


ROOT = Path(__file__).resolve().parents[1]
AFFECT_MAIN = ROOT / "services" / "affect-service" / "main.py"
TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"


def load_module():
    spec = importlib.util.spec_from_file_location("affect_service_verify", AFFECT_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load affect service module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_transcript_text(record_id: str) -> str:
    for raw_line in TRANSCRIPTS.read_text(encoding="utf-8").splitlines():
        payload = json.loads(raw_line)
        if payload.get("record_id") == record_id:
            return str(payload.get("draft_text_raw") or "")
    raise RuntimeError(f"missing transcript sample for {record_id}")


def write_pattern_wav(
    path: Path,
    *,
    amplitude: float,
    tone_ms: int,
    silence_ms: int,
    cycles: int,
    sample_rate_hz: int = 16000,
    frequency_hz: float = 220.0,
) -> None:
    pcm = bytearray()
    tone_frames = int(sample_rate_hz * (tone_ms / 1000.0))
    silence_frames = int(sample_rate_hz * (silence_ms / 1000.0))

    for _ in range(cycles):
        for index in range(tone_frames):
            sample = int(
                max(-1.0, min(1.0, amplitude))
                * math.sin((2.0 * math.pi * frequency_hz * index) / sample_rate_hz)
                * 32767
            )
            pcm.extend(int(sample).to_bytes(2, byteorder="little", signed=True))
        pcm.extend((0).to_bytes(2, byteorder="little", signed=True) * silence_frames)

    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate_hz)
        wav_file.writeframes(bytes(pcm))


def main() -> None:
    module = load_module()
    settings = module.AffectServiceSettings(
        affect_service_host="127.0.0.1",
        affect_service_port=8060,
        affect_service_base_url="http://127.0.0.1:8060",
        affect_cors_origins=("http://127.0.0.1:4173",),
    )

    anxious_snapshot = module.generate_affect_snapshot(
        settings,
        module.AffectAnalyzeRequest(
            session_id="sess_verify_affect",
            trace_id="trace_verify_affect",
            current_stage="assess",
            text_input="我这两天总是睡不好，脑子停不下来。",
            metadata={"source": "verify_affect_service"},
            capture_state={
                "recording_state": "recording",
                "audio_upload_state": "uploading",
                "uploaded_chunk_count": 2,
                "camera_state": "previewing",
                "uploaded_video_frame_count": 2,
            },
        ),
    )
    conflict_snapshot = module.generate_affect_snapshot(
        settings,
        module.AffectAnalyzeRequest(
            session_id="sess_verify_affect_conflict",
            trace_id="trace_verify_affect_conflict",
            current_stage="assess",
            text_input="我没事，不用担心。",
            capture_state={
                "recording_state": "recording",
                "uploaded_chunk_count": 1,
                "camera_state": "previewing",
                "uploaded_video_frame_count": 1,
            },
        ),
    )
    low_mood_snapshot = module.generate_affect_snapshot(
        settings,
        module.AffectAnalyzeRequest(
            session_id="sess_verify_affect_low_mood",
            trace_id="trace_verify_affect_low_mood",
            current_stage="assess",
            text_input="这几天我一直提不起劲，感觉很多事情都没有意义。",
        ),
    )
    enterprise_neutral_snapshot = module.generate_affect_snapshot(
        settings,
        module.AffectAnalyzeRequest(
            session_id="sess_verify_affect_enterprise_neutral",
            trace_id="trace_verify_affect_enterprise_neutral",
            current_stage="assess",
            text_input=load_transcript_text("noxi/001_2016-03-17_Paris/speaker_a/1"),
            metadata={
                "source": "enterprise_validation_manifest",
                "dataset": "noxi",
                "record_id": "noxi/001_2016-03-17_Paris/speaker_a/1",
            },
        ),
    )
    enterprise_guarded_snapshot = module.generate_affect_snapshot(
        settings,
        module.AffectAnalyzeRequest(
            session_id="sess_verify_affect_enterprise_guarded",
            trace_id="trace_verify_affect_enterprise_guarded",
            current_stage="assess",
            text_input=load_transcript_text("noxi/001_2016-03-17_Paris/speaker_b/2"),
            metadata={
                "source": "enterprise_validation_manifest",
                "dataset": "noxi",
                "record_id": "noxi/001_2016-03-17_Paris/speaker_b/2",
            },
        ),
    )
    with tempfile.TemporaryDirectory() as temp_dir:
        fast_path = Path(temp_dir) / "fast_high.wav"
        slow_path = Path(temp_dir) / "slow_low.wav"
        write_pattern_wav(fast_path, amplitude=0.58, tone_ms=90, silence_ms=20, cycles=28)
        write_pattern_wav(slow_path, amplitude=0.08, tone_ms=80, silence_ms=520, cycles=6)

        fast_audio_snapshot = module.generate_affect_snapshot(
            settings,
            module.AffectAnalyzeRequest(
                session_id="sess_verify_affect_audio_fast",
                trace_id="trace_verify_affect_audio_fast",
                current_stage="assess",
                metadata={"audio_path_16k_mono": str(fast_path)},
            ),
        )
        slow_audio_snapshot = module.generate_affect_snapshot(
            settings,
            module.AffectAnalyzeRequest(
                session_id="sess_verify_affect_audio_slow",
                trace_id="trace_verify_affect_audio_slow",
                current_stage="assess",
                metadata={"audio_path_16k_mono": str(slow_path)},
            ),
        )
    enterprise_strong_audio_snapshot = module.generate_affect_snapshot(
        settings,
        module.AffectAnalyzeRequest(
            session_id="sess_verify_affect_enterprise_audio_strong",
            trace_id="trace_verify_affect_enterprise_audio_strong",
            current_stage="assess",
            metadata={
                "source": "enterprise_validation_manifest",
                "dataset": "recola",
                "record_id": "recola/group-2/speaker_a/1",
                "audio_path_16k_mono": "data/derived/audio_16k_mono/RECOLA/group-2/P41/1.wav",
            },
        ),
    )
    enterprise_weak_audio_snapshot = module.generate_affect_snapshot(
        settings,
        module.AffectAnalyzeRequest(
            session_id="sess_verify_affect_enterprise_audio_weak",
            trace_id="trace_verify_affect_enterprise_audio_weak",
            current_stage="assess",
            metadata={
                "source": "enterprise_validation_manifest",
                "dataset": "noxi",
                "record_id": "noxi/001_2016-03-17_Paris/speaker_b/2",
                "audio_path_16k_mono": "data/derived/audio_16k_mono/NoXI/001_2016-03-17_Paris/Novice_video/2.wav",
            },
        ),
    )

    if anxious_snapshot.text_result.label != "anxious":
        raise RuntimeError("anxious snapshot did not classify text lane as anxious")
    if anxious_snapshot.video_result.status != "ready":
        raise RuntimeError("anxious snapshot did not mark video lane ready")
    if conflict_snapshot.text_result.label != "guarded":
        raise RuntimeError("guarded snapshot did not classify text lane as guarded")
    if conflict_snapshot.fusion_result.conflict is not True:
        raise RuntimeError("guarded masking snapshot did not raise a conflict flag")
    if low_mood_snapshot.text_result.label != "low_mood":
        raise RuntimeError("low mood snapshot did not classify text lane as low_mood")
    if enterprise_neutral_snapshot.text_result.label != "neutral":
        raise RuntimeError("enterprise neutral sample did not stay neutral")
    if enterprise_guarded_snapshot.text_result.label != "guarded":
        raise RuntimeError("enterprise guarded sample did not classify as guarded")
    if fast_audio_snapshot.audio_result.label != "fast_high_energy_proxy":
        raise RuntimeError("fast synthetic audio did not classify as fast_high_energy_proxy")
    if slow_audio_snapshot.audio_result.label != "slow_low_energy_proxy":
        raise RuntimeError("slow synthetic audio did not classify as slow_low_energy_proxy")
    if enterprise_strong_audio_snapshot.audio_result.label not in {"steady_high_energy_proxy", "fast_high_energy_proxy"}:
        raise RuntimeError("enterprise strong audio sample did not classify as a high-energy proxy")
    if enterprise_weak_audio_snapshot.audio_result.label != "slow_low_energy_proxy":
        raise RuntimeError("enterprise weak audio sample did not classify as slow_low_energy_proxy")

    print(
        json.dumps(
            {
                "anxious_snapshot": anxious_snapshot.model_dump(mode="json"),
                "low_mood_snapshot": low_mood_snapshot.model_dump(mode="json"),
                "conflict_snapshot": conflict_snapshot.model_dump(mode="json"),
                "enterprise_neutral_snapshot": enterprise_neutral_snapshot.model_dump(mode="json"),
                "enterprise_guarded_snapshot": enterprise_guarded_snapshot.model_dump(mode="json"),
                "fast_audio_snapshot": fast_audio_snapshot.model_dump(mode="json"),
                "slow_audio_snapshot": slow_audio_snapshot.model_dump(mode="json"),
                "enterprise_strong_audio_snapshot": enterprise_strong_audio_snapshot.model_dump(mode="json"),
                "enterprise_weak_audio_snapshot": enterprise_weak_audio_snapshot.model_dump(mode="json"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
