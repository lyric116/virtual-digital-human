from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


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


def test_affect_service_app_and_readme_document_endpoints():
    module = load_affect_module()
    app = module.create_app()
    paths = {route.path for route in app.routes}
    content = AFFECT_README.read_text(encoding="utf-8")

    assert "/health" in paths
    assert "/internal/affect/analyze" in paths
    assert "POST /internal/affect/analyze" in content
