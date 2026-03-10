#!/usr/bin/env python3
"""Verify deterministic step-37 affect snapshots without requiring live model services."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


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

    print(
        json.dumps(
            {
                "anxious_snapshot": anxious_snapshot.model_dump(mode="json"),
                "low_mood_snapshot": low_mood_snapshot.model_dump(mode="json"),
                "conflict_snapshot": conflict_snapshot.model_dump(mode="json"),
                "enterprise_neutral_snapshot": enterprise_neutral_snapshot.model_dump(mode="json"),
                "enterprise_guarded_snapshot": enterprise_guarded_snapshot.model_dump(mode="json"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
