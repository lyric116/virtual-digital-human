#!/usr/bin/env python3
"""Select ASR draft batches and import external ASR results into the transcript workflow."""

from __future__ import annotations

import argparse
import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"
DEFAULT_BATCH_DIR = ROOT / "data" / "derived" / "transcripts" / "batches"


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


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    alias_map = {
        "key": "OPENAI_API_KEY",
        "api_key": "OPENAI_API_KEY",
        "openai_api_key": "OPENAI_API_KEY",
        "baseurl": "OPENAI_BASE_URL",
        "base_url": "OPENAI_BASE_URL",
        "openai_base_url": "OPENAI_BASE_URL",
        "model": "OPENAI_MODEL",
        "openai_model": "OPENAI_MODEL",
    }

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()

        if "=" in line:
            key, value = line.split("=", 1)
        elif ":" in line:
            key, value = line.split(":", 1)
        else:
            continue

        key = alias_map.get(key.strip().lower(), key.strip())
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def resolve_api_credentials() -> tuple[str | None, str | None]:
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DASHSCOPE_BASE_URL")
    return api_key, base_url


def normalize_base_url_for_model(model: str, base_url: str | None) -> str | None:
    if not model.startswith("qwen3-asr-flash"):
        return base_url

    compatible_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    if not base_url:
        return compatible_url
    if "/api/v1/services/audio/asr/transcription" in base_url:
        return compatible_url
    return base_url


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def infer_state(row: dict) -> tuple[str, str, str]:
    final_text = (row.get("final_text_normalized") or row.get("final_text") or "").strip()
    draft_text = (row.get("draft_text_normalized") or row.get("draft_text_raw") or "").strip()
    review_status = row.get("review_status")
    review_decision = row.get("review_decision")

    if row.get("locked_for_eval") and final_text:
        return ("verified", "done", "human_verified")
    if review_decision == "approved" and final_text:
        return ("verified", "done", "human_verified")
    if review_status in {"queued", "in_progress"} and draft_text:
        return ("pending_review", "manual_review", "asr_generated")
    if draft_text:
        return ("draft_ready", "manual_review", "asr_generated")
    return ("pending_asr", "run_asr_draft", "missing")


def apply_results_to_rows(
    rows: list[dict],
    results: list[dict],
    *,
    force: bool,
    engine: str | None,
    engine_version: str | None,
    transcript_source: str,
) -> dict:
    by_id = {row["record_id"]: row for row in rows}

    updated = 0
    skipped = 0
    missing = 0

    for result in results:
        record_id = result["record_id"]
        row = by_id.get(record_id)
        if row is None:
            missing += 1
            continue

        if row.get("workflow_status") == "verified" and not force:
            skipped += 1
            continue

        raw_text = (result.get("draft_text_raw") or "").strip()
        if not raw_text:
            skipped += 1
            continue

        row["asr_draft_status"] = "completed"
        row["asr_engine"] = result.get("asr_engine") or engine
        row["asr_engine_version"] = result.get("asr_engine_version") or engine_version
        row["asr_generated_at"] = result.get("asr_generated_at") or datetime.now(timezone.utc).isoformat()
        row["draft_text_raw"] = raw_text
        row["draft_text_normalized"] = (result.get("draft_text_normalized") or raw_text).strip()
        row["draft_confidence_mean"] = result.get("draft_confidence_mean")
        row["draft_confidence_min"] = result.get("draft_confidence_min")
        row["draft_confidence_max"] = result.get("draft_confidence_max")
        row["draft_segments"] = result.get("draft_segments") or []
        row["transcript_source"] = result.get("transcript_source") or transcript_source

        workflow_status, next_action, text_status = infer_state(row)
        row["workflow_status"] = workflow_status
        row["next_action"] = next_action
        row["text_status"] = text_status
        updated += 1

    return {
        "results_rows": len(results),
        "updated": updated,
        "skipped": skipped,
        "missing_record_id": missing,
    }


def to_data_uri(path: Path) -> str:
    suffix = path.suffix.lower()
    mime_map = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".aac": "audio/aac",
        ".opus": "audio/ogg",
        ".webm": "audio/webm",
    }
    mime = mime_map.get(suffix, "application/octet-stream")
    payload = base64.b64encode(path.read_bytes()).decode()
    return f"data:{mime};base64,{payload}"


def extract_completion_text(completion: object) -> str:
    choices = getattr(completion, "choices", None)
    if not choices:
        if isinstance(completion, dict):
            choices = completion.get("choices")
        else:
            return ""

    if not choices:
        return ""

    message = getattr(choices[0], "message", None)
    if message is None and isinstance(choices[0], dict):
        message = choices[0].get("message")

    content = getattr(message, "content", None)
    if content is None and isinstance(message, dict):
        content = message.get("content")

    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if text:
                    parts.append(text)
        return "".join(parts).strip()
    return ""


def cmd_select_batch(args: argparse.Namespace) -> None:
    rows = load_jsonl(args.transcripts)
    selected: list[dict] = []
    counts_by_group: dict[tuple[str, str], int] = {}

    for row in rows:
        if args.dataset and row["dataset"] != args.dataset:
            continue
        if row.get("workflow_status") != "pending_asr":
            continue
        if not row.get("audio_path_16k_mono"):
            continue
        if args.balanced_by_group:
            group = (row["dataset"], row["canonical_role"])
            current = counts_by_group.get(group, 0)
            if current >= args.per_group:
                continue
            counts_by_group[group] = current + 1

        selected.append(
            {
                "record_id": row["record_id"],
                "dataset": row["dataset"],
                "session_id": row["session_id"],
                "canonical_role": row["canonical_role"],
                "segment_id": row["segment_id"],
                "audio_path_16k_mono": row["audio_path_16k_mono"],
                "next_action": row.get("next_action"),
            }
        )
        if len(selected) >= args.limit:
            break

    output_path = args.output or (args.batch_dir / f"{args.batch_id}.jsonl")
    write_jsonl(output_path, selected)

    print(
        json.dumps(
            {
                "batch_id": args.batch_id,
                "selected_records": len(selected),
                "output": display_path(output_path),
            },
            ensure_ascii=False,
        )
    )


def cmd_import_results(args: argparse.Namespace) -> None:
    rows = load_jsonl(args.transcripts)
    results = load_jsonl(args.results)
    summary = apply_results_to_rows(
        rows,
        results,
        force=args.force,
        engine=args.engine,
        engine_version=args.engine_version,
        transcript_source=args.transcript_source,
    )

    write_jsonl(args.transcripts, rows)
    summary["transcripts"] = display_path(args.transcripts)

    print(json.dumps(summary, ensure_ascii=False))


def cmd_transcribe_openai(args: argparse.Namespace) -> None:
    load_env_file(args.env_file)

    from openai import OpenAI

    batch_rows = load_jsonl(args.batch)
    transcript_rows = load_jsonl(args.transcripts)
    api_key, base_url = resolve_api_credentials()
    base_url = normalize_base_url_for_model(args.model, base_url)
    client = OpenAI(api_key=api_key, base_url=base_url)
    results: list[dict] = []

    for batch_row in batch_rows[: args.limit] if args.limit is not None else batch_rows:
        audio_path = ROOT / batch_row["audio_path_16k_mono"]
        if args.model.startswith("qwen3-asr-flash"):
            completion = client.chat.completions.create(
                model=args.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_audio",
                                "input_audio": {
                                    "data": to_data_uri(audio_path),
                                },
                            }
                        ],
                    }
                ],
                stream=False,
                extra_body={
                    "asr_options": {
                        "enable_itn": False,
                    }
                },
            )
            text = extract_completion_text(completion)
        else:
            with audio_path.open("rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model=args.model,
                    file=audio_file,
                    response_format="json",
                )

            text = getattr(transcription, "text", None)
            if text is None and isinstance(transcription, dict):
                text = transcription.get("text")

        results.append(
            {
                "record_id": batch_row["record_id"],
                "draft_text_raw": (text or "").strip(),
                "draft_text_normalized": (text or "").strip(),
                "draft_segments": [],
                "draft_confidence_mean": None,
                "draft_confidence_min": None,
                "draft_confidence_max": None,
                "asr_engine": args.model,
                "asr_engine_version": None,
                "asr_generated_at": datetime.now(timezone.utc).isoformat(),
                "transcript_source": "openai_audio_transcriptions",
            }
        )

    results_output = args.output or (args.batch.parent / f"{args.batch.stem}_{args.model}_results.jsonl")
    write_jsonl(results_output, results)

    summary = apply_results_to_rows(
        transcript_rows,
        results,
        force=args.force,
        engine=args.model,
        engine_version=None,
        transcript_source="openai_audio_transcriptions",
    )
    write_jsonl(args.transcripts, transcript_rows)
    summary["results_output"] = display_path(results_output)
    summary["transcripts"] = display_path(args.transcripts)

    print(json.dumps(summary, ensure_ascii=False))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    select_parser = sub.add_parser("select-batch")
    select_parser.add_argument("--transcripts", type=Path, default=DEFAULT_TRANSCRIPTS)
    select_parser.add_argument("--batch-dir", type=Path, default=DEFAULT_BATCH_DIR)
    select_parser.add_argument("--batch-id", default="review_batch_001")
    select_parser.add_argument("--dataset", choices=["noxi", "recola"], default=None)
    select_parser.add_argument("--limit", type=int, default=8)
    select_parser.add_argument("--balanced-by-group", action="store_true")
    select_parser.add_argument("--per-group", type=int, default=2)
    select_parser.add_argument("--output", type=Path, default=None)
    select_parser.set_defaults(func=cmd_select_batch)

    import_parser = sub.add_parser("import-results")
    import_parser.add_argument("--transcripts", type=Path, default=DEFAULT_TRANSCRIPTS)
    import_parser.add_argument("--results", type=Path, required=True)
    import_parser.add_argument("--engine", default=None)
    import_parser.add_argument("--engine-version", default=None)
    import_parser.add_argument("--transcript-source", default="asr_batch_import")
    import_parser.add_argument("--force", action="store_true")
    import_parser.set_defaults(func=cmd_import_results)

    openai_parser = sub.add_parser("transcribe-openai")
    openai_parser.add_argument("--transcripts", type=Path, default=DEFAULT_TRANSCRIPTS)
    openai_parser.add_argument("--batch", type=Path, required=True)
    openai_parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    openai_parser.add_argument("--model", default="gpt-4o-transcribe")
    openai_parser.add_argument("--limit", type=int, default=None)
    openai_parser.add_argument("--output", type=Path, default=None)
    openai_parser.add_argument("--force", action="store_true")
    openai_parser.set_defaults(func=cmd_transcribe_openai)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
