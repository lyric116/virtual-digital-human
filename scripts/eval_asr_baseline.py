#!/usr/bin/env python3
"""Evaluate ASR quality on verified and locked transcript records."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"
DEFAULT_REPORT = ROOT / "data" / "derived" / "eval" / "asr_baseline_report.md"
DEFAULT_DETAILS = ROOT / "data" / "derived" / "eval" / "asr_baseline_details.json"
LATIN_TOKEN_CLEAN_RE = re.compile(r"[^\w\s'\u00C0-\u024F]+", re.UNICODE)
WHITESPACE_RE = re.compile(r"\s+")


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


def is_cjk_dominant(text: str) -> bool:
    cjk_count = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
    latin_count = sum(1 for char in text if char.isascii() and char.isalpha())
    return cjk_count > latin_count


def normalize_text_for_eval(text: str) -> str:
    normalized = text.strip().lower().replace("’", "'")
    if not normalized:
        return ""
    if is_cjk_dominant(normalized):
        filtered = "".join(char for char in normalized if "\u4e00" <= char <= "\u9fff")
        return filtered
    filtered = LATIN_TOKEN_CLEAN_RE.sub(" ", normalized)
    return WHITESPACE_RE.sub(" ", filtered).strip()


def tokenize_text(text: str) -> list[str]:
    normalized = normalize_text_for_eval(text)
    if not normalized:
        return []
    if is_cjk_dominant(normalized):
        return [char for char in normalized if "\u4e00" <= char <= "\u9fff"]
    return [token for token in normalized.split(" ") if token]


def levenshtein_distance(reference_tokens: list[str], hypothesis_tokens: list[str]) -> int:
    if not reference_tokens:
        return len(hypothesis_tokens)
    if not hypothesis_tokens:
        return len(reference_tokens)

    previous = list(range(len(hypothesis_tokens) + 1))
    for ref_index, ref_token in enumerate(reference_tokens, start=1):
        current = [ref_index]
        for hyp_index, hyp_token in enumerate(hypothesis_tokens, start=1):
            cost = 0 if ref_token == hyp_token else 1
            current.append(
                min(
                    previous[hyp_index] + 1,
                    current[hyp_index - 1] + 1,
                    previous[hyp_index - 1] + cost,
                )
            )
        previous = current
    return previous[-1]


def select_eligible_rows(rows: list[dict]) -> tuple[list[dict], dict[str, int]]:
    gating = {
        "total_rows": len(rows),
        "eligible_records": 0,
        "not_verified": 0,
        "not_locked_for_eval": 0,
        "not_human_verified": 0,
        "missing_final_text": 0,
    }
    eligible: list[dict] = []

    for row in rows:
        if row.get("workflow_status") != "verified":
            gating["not_verified"] += 1
            continue
        if not row.get("locked_for_eval"):
            gating["not_locked_for_eval"] += 1
            continue
        if row.get("text_status") != "human_verified":
            gating["not_human_verified"] += 1
            continue
        if not (row.get("final_text_normalized") or row.get("final_text") or "").strip():
            gating["missing_final_text"] += 1
            continue
        eligible.append(row)

    gating["eligible_records"] = len(eligible)
    return eligible, gating


def resolve_reference_text(row: dict) -> str:
    return (row.get("final_text_normalized") or row.get("final_text") or "").strip()


def resolve_draft_text(row: dict) -> str:
    return (row.get("draft_text_normalized") or row.get("draft_text_raw") or "").strip()


def transcribe_via_service(service_base_url: str, audio_path: Path, record_id: str) -> str:
    request = urllib.request.Request(
        (
            f"{service_base_url.rstrip('/')}/api/asr/transcribe?"
            f"{urllib.parse.urlencode({'filename': audio_path.name, 'record_id': record_id})}"
        ),
        data=audio_path.read_bytes(),
        headers={"Content-Type": "audio/wav"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=180) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return (payload.get("transcript_text") or "").strip()


def evaluate_rows(
    rows: list[dict],
    *,
    hypothesis_source: str,
    service_base_url: str | None,
) -> tuple[list[dict], dict[str, float | int | None]]:
    sample_rows: list[dict] = []
    total_reference_tokens = 0
    total_edits = 0
    sentence_errors = 0

    for row in rows:
        reference_text = resolve_reference_text(row)
        if not reference_text:
            raise ValueError(f"missing final reference text: {row['record_id']}")

        if hypothesis_source == "draft":
            hypothesis_text = resolve_draft_text(row)
        else:
            audio_path = ROOT / row["audio_path_16k_mono"]
            if not service_base_url:
                raise ValueError("service_base_url is required when hypothesis_source=service")
            hypothesis_text = transcribe_via_service(service_base_url, audio_path, row["record_id"])

        reference_tokens = tokenize_text(reference_text)
        hypothesis_tokens = tokenize_text(hypothesis_text)
        if not reference_tokens:
            raise ValueError(f"reference tokenization produced empty output: {row['record_id']}")

        edit_distance = levenshtein_distance(reference_tokens, hypothesis_tokens)
        sample_wer = edit_distance / len(reference_tokens)
        sentence_error = int(edit_distance > 0)

        total_reference_tokens += len(reference_tokens)
        total_edits += edit_distance
        sentence_errors += sentence_error

        sample_rows.append(
            {
                "record_id": row["record_id"],
                "dataset": row.get("dataset"),
                "canonical_role": row.get("canonical_role"),
                "segment_id": row.get("segment_id"),
                "reviewer": row.get("reviewer"),
                "reviewed_at": row.get("reviewed_at"),
                "audio_path_16k_mono": row.get("audio_path_16k_mono"),
                "reference_text": reference_text,
                "hypothesis_text": hypothesis_text,
                "reference_tokens": len(reference_tokens),
                "hypothesis_tokens": len(hypothesis_tokens),
                "edit_distance": edit_distance,
                "sample_wer": round(sample_wer, 6),
                "sentence_error": bool(sentence_error),
            }
        )

    sample_count = len(sample_rows)
    overall = {
        "sample_count": sample_count,
        "reference_token_total": total_reference_tokens,
        "edit_distance_total": total_edits,
        "wer": round(total_edits / total_reference_tokens, 6) if total_reference_tokens else None,
        "ser": round(sentence_errors / sample_count, 6) if sample_count else None,
    }
    return sample_rows, overall


def render_markdown_report(
    *,
    generated_at: str,
    transcripts_path: Path,
    hypothesis_source: str,
    gating: dict[str, int],
    metrics: dict[str, float | int | None],
    sample_rows: list[dict],
) -> str:
    lines = [
        "# ASR Baseline Report",
        "",
        "## Scope",
        "",
        f"- Generated at: `{generated_at}`",
        f"- Transcript workflow: `{display_path(transcripts_path)}`",
        f"- Hypothesis source: `{hypothesis_source}`",
        f"- Eligible records: `{gating['eligible_records']}`",
        f"- Gate: `workflow_status=verified && locked_for_eval=true && text_status=human_verified`",
        "",
        "## Gating Summary",
        "",
        "| Item | Count |",
        "| --- | ---: |",
        f"| total_rows | {gating['total_rows']} |",
        f"| eligible_records | {gating['eligible_records']} |",
        f"| not_verified | {gating['not_verified']} |",
        f"| not_locked_for_eval | {gating['not_locked_for_eval']} |",
        f"| not_human_verified | {gating['not_human_verified']} |",
        f"| missing_final_text | {gating['missing_final_text']} |",
        "",
    ]

    if not sample_rows:
        lines.extend(
            [
                "## Status",
                "",
                "Blocked: no transcript rows currently satisfy the formal ASR evaluation gate.",
                "",
                "## Next Action",
                "",
                "- Finish manual review on a small subset.",
                "- Mark approved rows with `locked_for_eval=true`.",
                "- Re-run `scripts/eval_asr_baseline.py` to generate the first formal WER/SER baseline.",
                "",
            ]
        )
        return "\n".join(lines)

    lines.extend(
        [
            "## Metrics",
            "",
            "| Metric | Value |",
            "| --- | ---: |",
            f"| sample_count | {metrics['sample_count']} |",
            f"| reference_token_total | {metrics['reference_token_total']} |",
            f"| edit_distance_total | {metrics['edit_distance_total']} |",
            f"| WER | {metrics['wer']:.4f} |" if metrics["wer"] is not None else "| WER | n/a |",
            f"| SER | {metrics['ser']:.4f} |" if metrics["ser"] is not None else "| SER | n/a |",
            "",
            "## Sample Breakdown",
            "",
            "| Record ID | Dataset | Role | Reviewer | Ref tokens | Edits | Sample WER | Sentence error |",
            "| --- | --- | --- | --- | ---: | ---: | ---: | --- |",
        ]
    )
    for sample in sample_rows:
        lines.append(
            f"| {sample['record_id']} | {sample['dataset']} | {sample['canonical_role']} | "
            f"{sample['reviewer'] or '-'} | {sample['reference_tokens']} | "
            f"{sample['edit_distance']} | {sample['sample_wer']:.4f} | "
            f"{'yes' if sample['sentence_error'] else 'no'} |"
        )

    top_failures = sorted(sample_rows, key=lambda row: row["sample_wer"], reverse=True)[:5]
    lines.extend(
        [
            "",
            "## Failure Examples",
            "",
        ]
    )
    for sample in top_failures:
        if sample["edit_distance"] == 0:
            continue
        lines.extend(
            [
                f"### {sample['record_id']}",
                "",
                f"- Reviewer: `{sample['reviewer'] or '-'}`",
                f"- Reviewed at: `{sample['reviewed_at'] or '-'}`",
                f"- Audio: `{sample['audio_path_16k_mono']}`",
                f"- Sample WER: `{sample['sample_wer']:.4f}`",
                f"- Reference: `{sample['reference_text']}`",
                f"- Hypothesis: `{sample['hypothesis_text']}`",
                "",
            ]
        )

    lines.extend(
        [
            "## Current Notes",
            "",
            "- This report only includes human-verified and evaluation-locked transcript rows.",
            "- `confidence_mean` is not used in WER/SER because the current provider path does not expose token-level confidence.",
            "- Re-run the report after each ASR model or postprocess change to keep the baseline comparable.",
            "",
        ]
    )
    return "\n".join(lines)


def build_summary(
    *,
    generated_at: str,
    transcripts_path: Path,
    report_path: Path,
    details_path: Path,
    hypothesis_source: str,
    gating: dict[str, int],
    metrics: dict[str, float | int | None],
    sample_rows: list[dict],
) -> dict:
    return {
        "generated_at": generated_at,
        "status": "complete" if sample_rows else "blocked",
        "transcripts": display_path(transcripts_path),
        "report": display_path(report_path),
        "details_json": display_path(details_path),
        "hypothesis_source": hypothesis_source,
        "gating": gating,
        "metrics": metrics,
        "failure_examples": [
            {
                "record_id": row["record_id"],
                "sample_wer": row["sample_wer"],
                "reviewer": row["reviewer"],
            }
            for row in sorted(sample_rows, key=lambda item: item["sample_wer"], reverse=True)
            if row["edit_distance"] > 0
        ][:5],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--transcripts", type=Path, default=DEFAULT_TRANSCRIPTS)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--details-json", type=Path, default=DEFAULT_DETAILS)
    parser.add_argument("--hypothesis-source", choices=["draft", "service"], default="draft")
    parser.add_argument("--service-base-url", default=None)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    rows = load_jsonl(args.transcripts)
    eligible_rows, gating = select_eligible_rows(rows)
    generated_at = now_iso()

    if eligible_rows:
        sample_rows, metrics = evaluate_rows(
            eligible_rows,
            hypothesis_source=args.hypothesis_source,
            service_base_url=args.service_base_url,
        )
    else:
        sample_rows = []
        metrics = {
            "sample_count": 0,
            "reference_token_total": 0,
            "edit_distance_total": 0,
            "wer": None,
            "ser": None,
        }

    report_text = render_markdown_report(
        generated_at=generated_at,
        transcripts_path=args.transcripts,
        hypothesis_source=args.hypothesis_source,
        gating=gating,
        metrics=metrics,
        sample_rows=sample_rows,
    )
    summary = build_summary(
        generated_at=generated_at,
        transcripts_path=args.transcripts,
        report_path=args.report,
        details_path=args.details_json,
        hypothesis_source=args.hypothesis_source,
        gating=gating,
        metrics=metrics,
        sample_rows=sample_rows,
    )
    details_payload = {
        **summary,
        "samples": sample_rows,
    }

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.details_json.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(report_text + "\n", encoding="utf-8")
    args.details_json.write_text(json.dumps(details_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
