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
AFFECT_README = ROOT / "services" / "affect-service" / "README.md"
TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"


def load_affect_module():
    spec = importlib.util.spec_from_file_location("affect_service_main_test", AFFECT_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load affect service module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def build_settings(module):
    return module.AffectServiceSettings(
        affect_service_host="127.0.0.1",
        affect_service_port=8060,
        affect_service_base_url="http://127.0.0.1:8060",
        affect_cors_origins=("http://127.0.0.1:4173",),
    )


def load_transcript_text(record_id: str) -> str:
    for raw_line in TRANSCRIPTS.read_text(encoding="utf-8").splitlines():
        payload = json.loads(raw_line)
        if payload.get("record_id") == record_id:
            return str(payload.get("draft_text_raw") or "")
    raise AssertionError(f"missing transcript sample for {record_id}")


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


def test_affect_service_returns_anxious_snapshot_with_live_video_audio_state():
    module = load_affect_module()
    response = module.generate_affect_snapshot(
        build_settings(module),
        module.AffectAnalyzeRequest(
            session_id="sess_affect_001",
            trace_id="trace_affect_001",
            current_stage="assess",
            text_input="我这两天总是睡不好，脑子停不下来。",
            metadata={"source": "web-shell"},
            capture_state={
                "recording_state": "recording",
                "audio_upload_state": "uploading",
                "uploaded_chunk_count": 2,
                "camera_state": "previewing",
                "uploaded_video_frame_count": 3,
            },
        ),
    )

    assert response.text_result.label == "anxious"
    assert response.audio_result.status == "ready"
    assert response.video_result.label == "face_present_proxy"
    assert response.fusion_result.risk_level == "medium"
    assert response.source_context.dataset == "live_web"
    assert response.source_context.record_id == "session/sess_affect_001"


def test_affect_service_marks_conflict_for_neutral_text_with_other_modal_activity():
    module = load_affect_module()
    response = module.generate_affect_snapshot(
        build_settings(module),
        module.AffectAnalyzeRequest(
            session_id="sess_affect_002",
            trace_id="trace_affect_002",
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

    assert response.text_result.label == "guarded"
    assert response.fusion_result.conflict is True
    assert response.fusion_result.risk_level == "medium"
    assert "text-guarded" in (response.fusion_result.conflict_reason or "")


def test_affect_service_classifies_low_mood_text_lane():
    module = load_affect_module()
    response = module.generate_affect_snapshot(
        build_settings(module),
        module.AffectAnalyzeRequest(
            session_id="sess_affect_003",
            trace_id="trace_affect_003",
            current_stage="assess",
            text_input="这几天我一直提不起劲，感觉很多事情都没有意义。",
        ),
    )

    assert response.text_result.label == "low_mood"
    assert response.fusion_result.emotion_state == "low_mood_monitoring"
    assert response.fusion_result.risk_level == "medium"


def test_affect_service_handles_enterprise_transcript_samples_with_distinct_labels():
    module = load_affect_module()
    neutral_text = load_transcript_text("noxi/001_2016-03-17_Paris/speaker_a/1")
    guarded_text = load_transcript_text("noxi/001_2016-03-17_Paris/speaker_b/2")

    neutral_response = module.generate_affect_snapshot(
        build_settings(module),
        module.AffectAnalyzeRequest(
            session_id="sess_affect_enterprise_001",
            trace_id="trace_affect_enterprise_001",
            current_stage="assess",
            text_input=neutral_text,
            metadata={"dataset": "noxi", "record_id": "noxi/001_2016-03-17_Paris/speaker_a/1"},
        ),
    )
    guarded_response = module.generate_affect_snapshot(
        build_settings(module),
        module.AffectAnalyzeRequest(
            session_id="sess_affect_enterprise_002",
            trace_id="trace_affect_enterprise_002",
            current_stage="assess",
            text_input=guarded_text,
            metadata={"dataset": "noxi", "record_id": "noxi/001_2016-03-17_Paris/speaker_b/2"},
        ),
    )

    assert neutral_response.text_result.label == "neutral"
    assert guarded_response.text_result.label == "guarded"
    assert neutral_response.source_context.record_id.endswith("speaker_a/1")
    assert guarded_response.source_context.record_id.endswith("speaker_b/2")


def test_affect_service_distinguishes_fast_and_slow_audio_feature_proxies():
    module = load_affect_module()
    with tempfile.TemporaryDirectory() as temp_dir:
        fast_path = Path(temp_dir) / "fast_high.wav"
        slow_path = Path(temp_dir) / "slow_low.wav"
        write_pattern_wav(fast_path, amplitude=0.58, tone_ms=90, silence_ms=20, cycles=28)
        write_pattern_wav(slow_path, amplitude=0.08, tone_ms=80, silence_ms=520, cycles=6)

        fast_response = module.generate_affect_snapshot(
            build_settings(module),
            module.AffectAnalyzeRequest(
                session_id="sess_affect_audio_fast",
                trace_id="trace_affect_audio_fast",
                current_stage="assess",
                metadata={"audio_path_16k_mono": str(fast_path)},
            ),
        )
        slow_response = module.generate_affect_snapshot(
            build_settings(module),
            module.AffectAnalyzeRequest(
                session_id="sess_affect_audio_slow",
                trace_id="trace_affect_audio_slow",
                current_stage="assess",
                metadata={"audio_path_16k_mono": str(slow_path)},
            ),
        )

    assert fast_response.audio_result.label == "fast_high_energy_proxy"
    assert slow_response.audio_result.label == "slow_low_energy_proxy"
    assert "mean_rms" in " ".join(fast_response.audio_result.evidence)
    assert "pause_ratio" in " ".join(slow_response.audio_result.evidence)


def test_affect_service_handles_enterprise_audio_samples_with_distinct_energy_levels():
    module = load_affect_module()
    strong_path = "data/derived/audio_16k_mono/RECOLA/group-2/P41/1.wav"
    weak_path = "data/derived/audio_16k_mono/NoXI/001_2016-03-17_Paris/Novice_video/2.wav"

    strong_response = module.generate_affect_snapshot(
        build_settings(module),
        module.AffectAnalyzeRequest(
            session_id="sess_affect_enterprise_audio_001",
            trace_id="trace_affect_enterprise_audio_001",
            current_stage="assess",
            metadata={
                "dataset": "recola",
                "record_id": "recola/group-2/speaker_a/1",
                "audio_path_16k_mono": strong_path,
            },
        ),
    )
    weak_response = module.generate_affect_snapshot(
        build_settings(module),
        module.AffectAnalyzeRequest(
            session_id="sess_affect_enterprise_audio_002",
            trace_id="trace_affect_enterprise_audio_002",
            current_stage="assess",
            metadata={
                "dataset": "noxi",
                "record_id": "noxi/001_2016-03-17_Paris/speaker_b/2",
                "audio_path_16k_mono": weak_path,
            },
        ),
    )

    assert strong_response.audio_result.label in {"steady_high_energy_proxy", "fast_high_energy_proxy"}
    assert weak_response.audio_result.label == "slow_low_energy_proxy"
    assert strong_response.source_context.record_id.endswith("speaker_a/1")
    assert weak_response.source_context.record_id.endswith("speaker_b/2")


def test_affect_service_app_and_readme_document_endpoints():
    module = load_affect_module()
    app = module.create_app()
    paths = {route.path for route in app.routes}
    content = AFFECT_README.read_text(encoding="utf-8")

    assert "/health" in paths
    assert "/internal/affect/analyze" in paths
    assert "POST /internal/affect/analyze" in content
