#!/usr/bin/env python3
"""Verify transcript review state transitions on a temporary workflow copy."""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
MANAGE_REVIEW = ROOT / "scripts" / "manage_transcript_review.py"
TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def run_checked(args: list[str]) -> str:
    completed = subprocess.run(
        args,
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return completed.stdout.strip()


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="vdh_review_verify_") as temp_dir:
        temp_root = Path(temp_dir)
        temp_transcripts = temp_root / "val_transcripts_template.jsonl"
        temp_queue = temp_root / "review_queue_active.md"
        shutil.copyfile(TRANSCRIPTS, temp_transcripts)

        draft_rows = [row for row in load_jsonl(temp_transcripts) if row.get("workflow_status") == "draft_ready"]
        if len(draft_rows) < 2:
            raise RuntimeError("need at least two draft_ready rows for review verification")

        in_progress_id = draft_rows[0]["record_id"]
        verified_id = draft_rows[1]["record_id"]

        run_checked(
            [
                sys.executable,
                str(MANAGE_REVIEW),
                "start-review",
                "--transcripts",
                str(temp_transcripts),
                "--record-id",
                in_progress_id,
                "--reviewer",
                "reviewer_in_progress",
                "--language",
                "fr-FR",
                "--quality-flag",
                "language_metadata_needs_check",
                "--note",
                "started first-pass manual review",
            ]
        )
        run_checked(
            [
                sys.executable,
                str(MANAGE_REVIEW),
                "complete-review",
                "--transcripts",
                str(temp_transcripts),
                "--record-id",
                verified_id,
                "--reviewer",
                "reviewer_verified",
                "--decision",
                "approved",
                "--final-text",
                "Bonjour, transcription verifiee.",
                "--language",
                "fr-FR",
                "--quality-flag",
                "punctuation_checked",
                "--note",
                "approved after manual check",
            ]
        )
        run_checked(
            [
                sys.executable,
                str(MANAGE_REVIEW),
                "queue-report",
                "--transcripts",
                str(temp_transcripts),
                "--output",
                str(temp_queue),
            ]
        )

        rows = {row["record_id"]: row for row in load_jsonl(temp_transcripts)}
        in_progress = rows[in_progress_id]
        verified = rows[verified_id]
        queue_text = temp_queue.read_text(encoding="utf-8")

        if in_progress["workflow_status"] != "pending_review":
            raise RuntimeError("in-progress row did not move to pending_review")
        if in_progress["review_status"] != "in_progress":
            raise RuntimeError("in-progress row review_status mismatch")
        if in_progress["review_decision"] is not None:
            raise RuntimeError("in-progress row should not have a review_decision yet")
        if in_progress["reviewed_at"] is not None:
            raise RuntimeError("in-progress row should not have reviewed_at yet")
        if not in_progress["review_history"] or in_progress["review_history"][-1]["action"] != "start_review":
            raise RuntimeError("in-progress row missing start_review history")

        if verified["workflow_status"] != "verified":
            raise RuntimeError("verified row did not move to verified")
        if verified["review_status"] != "completed":
            raise RuntimeError("verified row review_status mismatch")
        if verified["review_decision"] != "approved":
            raise RuntimeError("verified row review_decision mismatch")
        if not verified["reviewed_at"]:
            raise RuntimeError("verified row missing reviewed_at")
        if not verified["final_text"]:
            raise RuntimeError("verified row missing final_text")
        if verified["text_status"] != "human_verified":
            raise RuntimeError("verified row text_status mismatch")
        if not verified["review_history"] or verified["review_history"][-1]["action"] != "complete_review":
            raise RuntimeError("verified row missing complete_review history")

        if in_progress_id not in queue_text:
            raise RuntimeError("in-progress row missing from active review queue")
        if verified_id in queue_text:
            raise RuntimeError("verified row should not remain in active review queue")

        print(
            json.dumps(
                {
                    "in_progress_record_id": in_progress_id,
                    "verified_record_id": verified_id,
                    "queue_output": str(temp_queue.relative_to(temp_root)),
                },
                ensure_ascii=False,
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
