from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "manage_transcript_review.py"


def load_module():
    spec = importlib.util.spec_from_file_location("manage_transcript_review_test", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load manage_transcript_review module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def reviewable_row(record_id: str) -> dict:
    return {
        "record_id": record_id,
        "dataset": "noxi",
        "canonical_role": "speaker_a",
        "workflow_status": "draft_ready",
        "next_action": "manual_review",
        "review_status": "not_started",
        "review_decision": None,
        "reviewer": None,
        "reviewed_at": None,
        "draft_text_raw": "bonjour test",
        "draft_text_normalized": "bonjour test",
        "final_text": "",
        "final_text_normalized": "",
        "text_status": "asr_generated",
        "quality_flags": [],
        "needs_second_review": False,
        "locked_for_eval": False,
        "review_history": [],
        "notes": "",
        "language": "zh-CN",
    }


def test_start_review_moves_row_to_pending_review(tmp_path):
    module = load_module()
    transcripts_path = tmp_path / "transcripts.jsonl"
    write_jsonl(transcripts_path, [reviewable_row("noxi/test/speaker_a/1")])

    args = argparse.Namespace(
        transcripts=transcripts_path,
        record_id="noxi/test/speaker_a/1",
        reviewer="reviewer_a",
        language="fr-FR",
        quality_flag=["language_metadata_needs_check"],
        note="started manual review",
    )
    module.cmd_start_review(args)

    [row] = read_jsonl(transcripts_path)
    assert row["workflow_status"] == "pending_review"
    assert row["review_status"] == "in_progress"
    assert row["review_decision"] is None
    assert row["reviewer"] == "reviewer_a"
    assert row["reviewed_at"] is None
    assert row["final_text"] == ""
    assert row["text_status"] == "asr_generated"
    assert row["language"] == "fr-FR"
    assert row["review_history"][-1]["action"] == "start_review"


def test_complete_review_verifies_row_and_sets_human_verified(tmp_path):
    module = load_module()
    transcripts_path = tmp_path / "transcripts.jsonl"
    row = reviewable_row("noxi/test/speaker_a/2")
    row["review_status"] = "in_progress"
    write_jsonl(transcripts_path, [row])

    args = argparse.Namespace(
        transcripts=transcripts_path,
        record_id="noxi/test/speaker_a/2",
        reviewer="reviewer_b",
        decision="approved",
        final_text="Bonjour, test final.",
        final_text_normalized="Bonjour, test final.",
        language="fr-FR",
        quality_flag=["punctuation_checked"],
        note="approved after manual verification",
        needs_second_review=False,
        lock_for_eval=True,
    )
    module.cmd_complete_review(args)

    [updated] = read_jsonl(transcripts_path)
    assert updated["workflow_status"] == "verified"
    assert updated["next_action"] == "done"
    assert updated["review_status"] == "completed"
    assert updated["review_decision"] == "approved"
    assert updated["reviewer"] == "reviewer_b"
    assert updated["reviewed_at"]
    assert updated["final_text"] == "Bonjour, test final."
    assert updated["text_status"] == "human_verified"
    assert updated["locked_for_eval"] is True
    assert updated["review_history"][-1]["action"] == "complete_review"


def test_queue_report_lists_only_active_items(tmp_path):
    module = load_module()
    transcripts_path = tmp_path / "transcripts.jsonl"
    output_path = tmp_path / "queue.md"

    row_a = reviewable_row("noxi/test/speaker_a/1")
    row_b = reviewable_row("noxi/test/speaker_b/1")
    row_b["canonical_role"] = "speaker_b"
    row_b["workflow_status"] = "pending_review"
    row_b["review_status"] = "in_progress"
    row_c = reviewable_row("noxi/test/speaker_a/2")
    row_c["workflow_status"] = "verified"
    row_c["review_status"] = "completed"
    row_c["review_decision"] = "approved"
    row_c["final_text"] = "final"
    row_c["final_text_normalized"] = "final"
    row_c["text_status"] = "human_verified"
    write_jsonl(transcripts_path, [row_a, row_b, row_c])

    args = argparse.Namespace(transcripts=transcripts_path, output=output_path)
    module.cmd_queue_report(args)

    report = output_path.read_text(encoding="utf-8")
    assert "noxi/test/speaker_a/1" in report
    assert "noxi/test/speaker_b/1" in report
    assert "noxi/test/speaker_a/2" not in report
    assert "Active Transcript Review Queue" in report
