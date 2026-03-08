#!/usr/bin/env python3
"""Verify the ASR baseline evaluator with deterministic fixtures and real workflow gating."""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
EVAL_SCRIPT = ROOT / "scripts" / "eval_asr_baseline.py"
REAL_TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def run_eval(transcripts_path: Path, report_path: Path, details_path: Path) -> dict:
    completed = subprocess.run(
        [
            sys.executable,
            str(EVAL_SCRIPT),
            "--transcripts",
            str(transcripts_path),
            "--report",
            str(report_path),
            "--details-json",
            str(details_path),
            "--hypothesis-source",
            "draft",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(completed.stdout)


def fixture_row(
    record_id: str,
    *,
    workflow_status: str,
    locked_for_eval: bool,
    text_status: str,
    draft_text: str,
    final_text: str,
) -> dict:
    return {
        "record_id": record_id,
        "dataset": "noxi",
        "canonical_role": "speaker_a",
        "segment_id": "1",
        "audio_path_16k_mono": "data/derived/audio_16k_mono/NoXI/example.wav",
        "workflow_status": workflow_status,
        "next_action": "done" if workflow_status == "verified" else "manual_review",
        "draft_text_raw": draft_text,
        "draft_text_normalized": draft_text,
        "final_text": final_text,
        "final_text_normalized": final_text,
        "text_status": text_status,
        "reviewer": "reviewer_demo" if workflow_status == "verified" else None,
        "reviewed_at": "2026-03-08T16:00:00+00:00" if workflow_status == "verified" else None,
        "review_decision": "approved" if workflow_status == "verified" else None,
        "locked_for_eval": locked_for_eval,
        "review_history": [{"action": "complete_review"}] if workflow_status == "verified" else [],
    }


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="vdh_asr_eval_verify_") as temp_dir:
        temp_root = Path(temp_dir)

        fixture_transcripts = temp_root / "fixture_transcripts.jsonl"
        fixture_report = temp_root / "fixture_report.md"
        fixture_details = temp_root / "fixture_details.json"
        write_jsonl(
            fixture_transcripts,
            [
                fixture_row(
                    "noxi/test/speaker_a/1",
                    workflow_status="verified",
                    locked_for_eval=True,
                    text_status="human_verified",
                    draft_text="bonjour test final",
                    final_text="bonjour test final",
                ),
                fixture_row(
                    "noxi/test/speaker_a/2",
                    workflow_status="verified",
                    locked_for_eval=True,
                    text_status="human_verified",
                    draft_text="bonjour petit erreur",
                    final_text="bonjour petite erreur",
                ),
                fixture_row(
                    "noxi/test/speaker_a/3",
                    workflow_status="draft_ready",
                    locked_for_eval=False,
                    text_status="asr_generated",
                    draft_text="bonjour ignoré",
                    final_text="",
                ),
            ],
        )

        fixture_summary = run_eval(fixture_transcripts, fixture_report, fixture_details)
        fixture_details_payload = json.loads(fixture_details.read_text(encoding="utf-8"))
        fixture_report_text = fixture_report.read_text(encoding="utf-8")

        if fixture_summary["status"] != "complete":
            raise RuntimeError("fixture evaluation should have produced a complete report")
        if fixture_summary["gating"]["eligible_records"] != 2:
            raise RuntimeError("fixture evaluation expected two eligible records")
        if fixture_details_payload["metrics"]["sample_count"] != 2:
            raise RuntimeError("fixture metrics sample_count mismatch")
        if "WER" not in fixture_report_text or "SER" not in fixture_report_text:
            raise RuntimeError("fixture report missing WER/SER metrics")
        if "noxi/test/speaker_a/2" not in fixture_report_text:
            raise RuntimeError("fixture report missing failure example")

        real_report = temp_root / "real_report.md"
        real_details = temp_root / "real_details.json"
        shutil.copyfile(REAL_TRANSCRIPTS, temp_root / "real_transcripts.jsonl")
        real_summary = run_eval(temp_root / "real_transcripts.jsonl", real_report, real_details)
        real_report_text = real_report.read_text(encoding="utf-8")

        if real_summary["status"] != "blocked":
            raise RuntimeError("real workflow should currently be blocked without locked samples")
        if real_summary["gating"]["eligible_records"] != 0:
            raise RuntimeError("real workflow unexpectedly has eligible evaluation samples")
        if "Blocked: no transcript rows currently satisfy the formal ASR evaluation gate." not in real_report_text:
            raise RuntimeError("real report should explain the gating block")

        print(
            json.dumps(
                {
                    "fixture_status": fixture_summary["status"],
                    "fixture_metrics": fixture_summary["metrics"],
                    "real_status": real_summary["status"],
                    "real_gating": real_summary["gating"],
                    "fixture_report": str(fixture_report.relative_to(temp_root)),
                    "real_report": str(real_report.relative_to(temp_root)),
                },
                ensure_ascii=False,
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
