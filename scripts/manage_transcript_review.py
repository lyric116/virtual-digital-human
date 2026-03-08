#!/usr/bin/env python3
"""Manage transcript review queue and review state transitions."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def find_row(rows: list[dict], record_id: str) -> dict:
    for row in rows:
        if row.get("record_id") == record_id:
            return row
    raise ValueError(f"record_id not found: {record_id}")


def append_note(existing: str | None, note: str | None) -> str:
    existing = (existing or "").strip()
    note = (note or "").strip()
    if not note:
        return existing
    if not existing:
        return note
    return f"{existing}\n{note}"


def merge_quality_flags(existing: list[str] | None, incoming: list[str] | None) -> list[str]:
    merged: list[str] = []
    for value in (existing or []) + (incoming or []):
        if value and value not in merged:
            merged.append(value)
    return merged


def infer_state(row: dict) -> tuple[str, str, str]:
    final_text = (row.get("final_text_normalized") or row.get("final_text") or "").strip()
    draft_text = (row.get("draft_text_normalized") or row.get("draft_text_raw") or "").strip()
    review_status = row.get("review_status")
    review_decision = row.get("review_decision")

    if row.get("locked_for_eval") and final_text:
        return ("verified", "done", "human_verified")
    if review_status == "completed" and review_decision == "approved" and final_text:
        return ("verified", "done", "human_verified")
    if review_status in {"queued", "in_progress"} and draft_text:
        return ("pending_review", "manual_review", "asr_generated")
    if review_status == "completed" and review_decision in {"needs_revision", "rejected"}:
        return ("pending_review", "manual_review", "asr_generated" if draft_text else "missing")
    if draft_text:
        return ("draft_ready", "manual_review", "asr_generated")
    return ("pending_asr", "run_asr_draft", "missing")


def append_history(row: dict, entry: dict) -> None:
    history = row.setdefault("review_history", [])
    history.append(entry)


def ensure_reviewable(row: dict) -> None:
    draft_text = (row.get("draft_text_normalized") or row.get("draft_text_raw") or "").strip()
    if not draft_text:
        raise ValueError(f"record has no ASR draft text: {row['record_id']}")
    if row.get("workflow_status") == "verified" and row.get("locked_for_eval"):
        raise ValueError(f"record is already locked for evaluation: {row['record_id']}")


def cmd_queue_report(args: argparse.Namespace) -> None:
    rows = load_jsonl(args.transcripts)
    active_rows = [
        row
        for row in rows
        if row.get("workflow_status") in {"draft_ready", "pending_review"}
    ]

    active_rows.sort(
        key=lambda row: (
            row.get("dataset", ""),
            row.get("canonical_role", ""),
            row.get("workflow_status", ""),
            row.get("record_id", ""),
        )
    )

    counts_by_status: dict[str, int] = {}
    for row in active_rows:
        key = row.get("workflow_status", "unknown")
        counts_by_status[key] = counts_by_status.get(key, 0) + 1

    lines = [
        "# Active Transcript Review Queue",
        "",
        "## Scope",
        "",
        f"- Transcript source: `{display_path(args.transcripts)}`",
        f"- Generated at: `{now_iso()}`",
        f"- Active records: `{len(active_rows)}`",
        "",
        "## Status Summary",
        "",
        "| Workflow status | Count |",
        "| --- | ---: |",
    ]

    for status_name in sorted(counts_by_status):
        lines.append(f"| {status_name} | {counts_by_status[status_name]} |")

    lines.extend(
        [
            "",
            "## Active Records",
            "",
            "| Record ID | Dataset | Role | Workflow | Review | Reviewer | Flags |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
    )

    for row in active_rows:
        flags = ", ".join(row.get("quality_flags") or []) or "-"
        lines.append(
            f"| {row['record_id']} | {row['dataset']} | {row['canonical_role']} | "
            f"{row.get('workflow_status')} | {row.get('review_status')} | "
            f"{row.get('reviewer') or '-'} | {flags} |"
        )

    lines.extend(
        [
            "",
            "## CLI",
            "",
            "Start a review item:",
            "",
            "```bash",
            "UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py "
            "start-review --record-id <record_id> --reviewer <reviewer>",
            "```",
            "",
            "Complete a verified review item:",
            "",
            "```bash",
            "UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py "
            "complete-review --record-id <record_id> --reviewer <reviewer> "
            "--decision approved --final-text \"...\"",
            "```",
            "",
        ]
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(lines), encoding="utf-8")
    print(
        json.dumps(
            {
                "output": display_path(args.output),
                "active_records": len(active_rows),
            },
            ensure_ascii=False,
        )
    )


def cmd_start_review(args: argparse.Namespace) -> None:
    rows = load_jsonl(args.transcripts)
    row = find_row(rows, args.record_id)
    ensure_reviewable(row)

    previous_review_status = row.get("review_status")
    previous_workflow_status = row.get("workflow_status")
    timestamp = now_iso()

    row["review_status"] = "in_progress"
    row["review_decision"] = None
    row["reviewer"] = args.reviewer
    row["reviewed_at"] = None
    row["quality_flags"] = merge_quality_flags(row.get("quality_flags"), args.quality_flag)
    row["notes"] = append_note(row.get("notes"), args.note)
    if args.language:
        row["language"] = args.language

    append_history(
        row,
        {
            "action": "start_review",
            "at": timestamp,
            "reviewer": args.reviewer,
            "previous_review_status": previous_review_status,
            "previous_workflow_status": previous_workflow_status,
            "note": args.note or "",
            "quality_flags": args.quality_flag or [],
        },
    )

    workflow_status, next_action, text_status = infer_state(row)
    row["workflow_status"] = workflow_status
    row["next_action"] = next_action
    row["text_status"] = text_status

    write_jsonl(args.transcripts, rows)
    print(
        json.dumps(
            {
                "record_id": args.record_id,
                "workflow_status": row["workflow_status"],
                "review_status": row["review_status"],
                "reviewer": row["reviewer"],
                "transcripts": display_path(args.transcripts),
            },
            ensure_ascii=False,
        )
    )


def cmd_complete_review(args: argparse.Namespace) -> None:
    rows = load_jsonl(args.transcripts)
    row = find_row(rows, args.record_id)
    ensure_reviewable(row)

    decision = args.decision
    final_text = (args.final_text or "").strip()
    final_text_normalized = (args.final_text_normalized or "").strip()
    if decision == "approved" and not final_text:
        raise ValueError("--final-text is required when --decision approved")
    if decision != "approved" and (final_text or final_text_normalized or args.lock_for_eval):
        raise ValueError("final text and lock_for_eval are only allowed when --decision approved")

    previous_review_status = row.get("review_status")
    previous_workflow_status = row.get("workflow_status")
    timestamp = now_iso()

    row["review_status"] = "completed"
    row["review_decision"] = decision
    row["reviewer"] = args.reviewer
    row["reviewed_at"] = timestamp
    row["quality_flags"] = merge_quality_flags(row.get("quality_flags"), args.quality_flag)
    row["notes"] = append_note(row.get("notes"), args.note)
    row["needs_second_review"] = bool(args.needs_second_review)
    if args.language:
        row["language"] = args.language

    if decision == "approved":
        row["final_text"] = final_text
        row["final_text_normalized"] = final_text_normalized or final_text
        row["locked_for_eval"] = bool(args.lock_for_eval)

    append_history(
        row,
        {
            "action": "complete_review",
            "at": timestamp,
            "reviewer": args.reviewer,
            "decision": decision,
            "previous_review_status": previous_review_status,
            "previous_workflow_status": previous_workflow_status,
            "quality_flags": args.quality_flag or [],
            "note": args.note or "",
            "needs_second_review": bool(args.needs_second_review),
            "final_text_present": bool(final_text),
            "locked_for_eval": bool(args.lock_for_eval),
        },
    )

    workflow_status, next_action, text_status = infer_state(row)
    row["workflow_status"] = workflow_status
    row["next_action"] = next_action
    row["text_status"] = text_status

    write_jsonl(args.transcripts, rows)
    print(
        json.dumps(
            {
                "record_id": args.record_id,
                "workflow_status": row["workflow_status"],
                "review_status": row["review_status"],
                "review_decision": row["review_decision"],
                "reviewer": row["reviewer"],
                "transcripts": display_path(args.transcripts),
            },
            ensure_ascii=False,
        )
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    queue = sub.add_parser("queue-report")
    queue.add_argument("--transcripts", type=Path, default=DEFAULT_TRANSCRIPTS)
    queue.add_argument("--output", type=Path, required=True)
    queue.set_defaults(func=cmd_queue_report)

    start = sub.add_parser("start-review")
    start.add_argument("--transcripts", type=Path, default=DEFAULT_TRANSCRIPTS)
    start.add_argument("--record-id", required=True)
    start.add_argument("--reviewer", required=True)
    start.add_argument("--language", default=None)
    start.add_argument("--quality-flag", action="append", default=[])
    start.add_argument("--note", default="")
    start.set_defaults(func=cmd_start_review)

    complete = sub.add_parser("complete-review")
    complete.add_argument("--transcripts", type=Path, default=DEFAULT_TRANSCRIPTS)
    complete.add_argument("--record-id", required=True)
    complete.add_argument("--reviewer", required=True)
    complete.add_argument("--decision", choices=["approved", "needs_revision", "rejected"], required=True)
    complete.add_argument("--final-text", default=None)
    complete.add_argument("--final-text-normalized", default=None)
    complete.add_argument("--language", default=None)
    complete.add_argument("--quality-flag", action="append", default=[])
    complete.add_argument("--note", default="")
    complete.add_argument("--needs-second-review", action="store_true")
    complete.add_argument("--lock-for-eval", action="store_true")
    complete.set_defaults(func=cmd_complete_review)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
