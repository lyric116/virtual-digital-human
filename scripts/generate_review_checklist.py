#!/usr/bin/env python3
"""Generate a manual review checklist for an ASR draft batch."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def review_flags(row: dict) -> list[str]:
    flags: list[str] = []
    text = row.get("draft_text_raw", "")

    if row.get("language") == "zh-CN":
        flags.append("language_metadata_needs_check")
    if not text:
        flags.append("empty_draft")
    if len(text) < 20:
        flags.append("short_utterance_confirm_audio")
    if row.get("draft_segments") in (None, []):
        flags.append("no_segment_timestamps")
    return flags


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--transcripts", type=Path, default=DEFAULT_TRANSCRIPTS)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--reviewer-role", default="asr_reviewer")
    args = parser.parse_args()

    batch_rows = load_jsonl(args.batch)
    transcript_rows = {row["record_id"]: row for row in load_jsonl(args.transcripts)}
    resolved_rows = [transcript_rows[item["record_id"]] for item in batch_rows if item["record_id"] in transcript_rows]

    lines = [
        f"# Manual Review Checklist: {args.batch.stem}",
        "",
        "## Scope",
        "",
        f"- Batch file: `{display_path(args.batch)}`",
        f"- Transcript source: `{display_path(args.transcripts)}`",
        f"- Reviewer role: `{args.reviewer_role}`",
        f"- Total records: `{len(resolved_rows)}`",
        "",
        "## Review Procedure",
        "",
        "1. Listen to the full `audio_path_16k_mono` file for each record.",
        "2. Compare the audio against `draft_text_raw` and correct omissions, misrecognitions, punctuation, and sentence boundaries.",
        "3. Fill `final_text` and `final_text_normalized` only after the draft is fully checked.",
        "4. Use `scripts/manage_transcript_review.py start-review` when work begins, then use `complete-review` when the item is finished.",
        "5. If the language metadata is wrong, correct `language` during review.",
        "6. Let the review script move `workflow_status` to `pending_review` or `verified`; do not hand-edit state fields unless recovery is required.",
        "",
        "## Batch Summary",
        "",
        "| Record ID | Dataset | Role | Current status | Draft chars | Review flags |",
        "| --- | --- | --- | --- | ---: | --- |",
    ]

    for row in resolved_rows:
        flags = ", ".join(review_flags(row)) or "-"
        lines.append(
            f"| {row['record_id']} | {row['dataset']} | {row['canonical_role']} | "
            f"{row['workflow_status']} | {len(row.get('draft_text_raw', ''))} | {flags} |"
        )

    lines.extend(["", "## Record Details", ""])

    for idx, row in enumerate(resolved_rows, start=1):
        flags = review_flags(row)
        lines.extend(
            [
                f"### {idx}. `{row['record_id']}`",
                "",
                f"- Audio: `{row['audio_path_16k_mono']}`",
                f"- ASR engine: `{row.get('asr_engine')}`",
                f"- Generated at: `{row.get('asr_generated_at')}`",
                f"- Current workflow status: `{row.get('workflow_status')}`",
                f"- Current text status: `{row.get('text_status')}`",
                f"- Current language: `{row.get('language')}`",
                f"- Review flags: `{', '.join(flags) if flags else '-'}`",
                f"- Draft text: `{row.get('draft_text_raw', '')}`",
                "",
                "Reviewer actions:",
                f"- Start review: `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py start-review --record-id {row['record_id']} --reviewer <reviewer>`",
                "- Confirm the spoken language and update `language` if needed.",
                "- Correct transcript content into `final_text` and `final_text_normalized` via the review CLI.",
                f"- Complete review: `UV_CACHE_DIR=.uv-cache uv run python scripts/manage_transcript_review.py complete-review --record-id {row['record_id']} --reviewer <reviewer> --decision approved --final-text \"...\"`",
                "- If the draft is not acceptable, complete review with `--decision needs_revision` and add notes or quality flags.",
                "",
            ]
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "batch": display_path(args.batch),
                "output": display_path(args.output),
                "records": len(resolved_rows),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
