#!/usr/bin/env python3
"""Verify deterministic step-37 affect snapshots without requiring live model services."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
AFFECT_MAIN = ROOT / "services" / "affect-service" / "main.py"


def load_module():
    spec = importlib.util.spec_from_file_location("affect_service_verify", AFFECT_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load affect service module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


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

    if anxious_snapshot.text_result.label != "anxious":
        raise RuntimeError("anxious snapshot did not classify text lane as anxious")
    if anxious_snapshot.video_result.status != "ready":
        raise RuntimeError("anxious snapshot did not mark video lane ready")
    if conflict_snapshot.fusion_result.conflict is not True:
        raise RuntimeError("neutral masking snapshot did not raise a conflict flag")

    print(
        json.dumps(
            {
                "anxious_snapshot": anxious_snapshot.model_dump(mode="json"),
                "conflict_snapshot": conflict_snapshot.model_dump(mode="json"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
