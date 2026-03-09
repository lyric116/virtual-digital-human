#!/usr/bin/env python3
"""Prepare local-only MAGICDATA Chinese ASR evaluation catalogs."""

from __future__ import annotations

import argparse
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import tarfile
import wave


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW_ROOT = ROOT / "data" / "external" / "asr" / "magicdata-zh" / "raw"
DEFAULT_EXTRACTED_ROOT = ROOT / "data" / "external" / "asr" / "magicdata-zh" / "extracted"
DEFAULT_FULL_OUTPUT = ROOT / "data" / "derived" / "transcripts-local" / "magicdata_eval_all.jsonl"
DEFAULT_CORE_OUTPUT = ROOT / "data" / "derived" / "transcripts-local" / "magicdata_eval_core.jsonl"
DEFAULT_SUMMARY_OUTPUT = ROOT / "data" / "derived" / "eval-local" / "magicdata_import_summary.json"
REQUIRED_ARCHIVES = ("dev_set.tar.gz", "test_set.tar.gz", "metadata.tar.gz")
REQUIRED_EXTRACTED_FILES = ("dev/TRANS.txt", "test/TRANS.txt", "SPKINFO.txt")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_tsv(path: Path) -> list[dict[str, str]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines:
        return []
    headers = lines[0].split("\t")
    rows: list[dict[str, str]] = []
    for raw in lines[1:]:
        if not raw.strip():
            continue
        values = raw.split("\t")
        row = {header: values[index].strip() if index < len(values) else "" for index, header in enumerate(headers)}
        rows.append(row)
    return rows


def normalize_gender(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in {"female", "f"}:
        return "female"
    if normalized in {"male", "m"}:
        return "male"
    return "unknown"


def safe_extract_archive(archive_path: Path, destination: Path) -> None:
    destination_resolved = destination.resolve()
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive.getmembers():
            member_path = (destination / member.name).resolve()
            if not member_path.is_relative_to(destination_resolved):
                raise ValueError(f"unsafe tar member path: {member.name}")
        archive.extractall(destination)


def ensure_extracted(raw_root: Path, extracted_root: Path) -> None:
    if all((extracted_root / relative_path).exists() for relative_path in REQUIRED_EXTRACTED_FILES):
        return

    extracted_root.mkdir(parents=True, exist_ok=True)
    for archive_name in REQUIRED_ARCHIVES:
        archive_path = raw_root / archive_name
        if not archive_path.exists():
            raise FileNotFoundError(f"missing MAGICDATA archive: {archive_path}")
        safe_extract_archive(archive_path, extracted_root)


def load_speaker_info(path: Path) -> dict[str, dict[str, str]]:
    speaker_info: dict[str, dict[str, str]] = {}
    for row in parse_tsv(path):
        speaker_id = row["SPKID"]
        speaker_info[speaker_id] = {
            "speaker_id": speaker_id,
            "speaker_age": row.get("Age", ""),
            "speaker_gender": normalize_gender(row.get("Gender", "")),
            "speaker_dialect": row.get("Dialect", "").strip().lower(),
        }
    return speaker_info


def inspect_wave(path: Path) -> dict[str, int]:
    with wave.open(str(path), "rb") as handle:
        frame_count = handle.getnframes()
        sample_rate_hz = handle.getframerate()
        channels = handle.getnchannels()
        sample_width_bytes = handle.getsampwidth()
    duration_ms = int(round(frame_count / sample_rate_hz * 1000)) if sample_rate_hz else 0
    return {
        "sample_rate_hz": sample_rate_hz,
        "channels": channels,
        "sample_width_bytes": sample_width_bytes,
        "frame_count": frame_count,
        "duration_ms": duration_ms,
    }


def build_reference_rows(extracted_root: Path) -> list[dict]:
    speaker_info = load_speaker_info(extracted_root / "SPKINFO.txt")
    imported_at = now_iso()
    rows: list[dict] = []

    for split in ("dev", "test"):
        transcript_path = extracted_root / split / "TRANS.txt"
        for row in parse_tsv(transcript_path):
            utterance_filename = row["UtteranceID"]
            speaker_id = row["SpeakerID"]
            transcription = row["Transcription"].strip()
            utterance_stem = Path(utterance_filename).stem
            audio_path = extracted_root / split / speaker_id / utterance_filename
            if not audio_path.exists():
                raise FileNotFoundError(f"audio missing for {utterance_filename}: {audio_path}")

            metadata = speaker_info.get(
                speaker_id,
                {
                    "speaker_id": speaker_id,
                    "speaker_age": "",
                    "speaker_gender": "unknown",
                    "speaker_dialect": "",
                },
            )
            rows.append(
                {
                    "record_id": f"magicdata_zh/{split}/{speaker_id}/{utterance_stem}",
                    "dataset": "magicdata_zh",
                    "split": split,
                    "session_id": speaker_id,
                    "canonical_role": "speaker_a",
                    "segment_id": utterance_stem,
                    "speaker_id": speaker_id,
                    "speaker_age": metadata["speaker_age"],
                    "speaker_gender": metadata["speaker_gender"],
                    "speaker_dialect": metadata["speaker_dialect"],
                    "audio_path": display_path(audio_path),
                    "audio_path_16k_mono": display_path(audio_path),
                    "manifest_version": "magicdata-zh-1.0",
                    "workflow_status": "verified",
                    "next_action": "select_eval_subset",
                    "asr_draft_status": "not_started",
                    "asr_engine": None,
                    "asr_engine_version": None,
                    "asr_generated_at": None,
                    "draft_text_raw": "",
                    "draft_text_normalized": "",
                    "draft_confidence_mean": None,
                    "draft_confidence_min": None,
                    "draft_confidence_max": None,
                    "draft_segments": [],
                    "review_status": "completed",
                    "review_decision": "approved",
                    "reviewer": "dataset_reference:magicdata-zh",
                    "reviewed_at": imported_at,
                    "final_text": transcription,
                    "final_text_normalized": transcription,
                    "text_status": "human_verified",
                    "transcript_source": "magicdata_official_transcript",
                    "language": "zh-CN",
                    "quality_flags": [],
                    "needs_second_review": False,
                    "locked_for_eval": False,
                    "transcript_version": 1,
                    "review_history": [
                        {
                            "action": "import_dataset_reference",
                            "at": imported_at,
                            "reviewer": "dataset_reference:magicdata-zh",
                            "source": f"{split}/TRANS.txt",
                        }
                    ],
                    "notes": "local-only external Chinese ASR reference set",
                }
            )

    rows.sort(
        key=lambda item: (
            item["split"],
            item["speaker_gender"],
            item["speaker_dialect"],
            item["speaker_id"],
            item["segment_id"],
        )
    )
    return rows


def select_core_subset(rows: list[dict], per_group: int) -> list[dict]:
    grouped: dict[tuple[str, str], dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        grouped[(row["split"], row["speaker_gender"])][row["speaker_id"]].append(row)

    selected: list[dict] = []
    seen_record_ids: set[str] = set()
    group_keys = sorted(grouped.keys())
    for group_key in group_keys:
        speaker_rows = grouped[group_key]
        speaker_ids = sorted(
            speaker_rows,
            key=lambda speaker_id: (
                speaker_rows[speaker_id][0]["speaker_dialect"],
                speaker_id,
            ),
        )
        for speaker_id in speaker_ids:
            speaker_rows[speaker_id].sort(key=lambda row: row["segment_id"])

        group_selected = 0
        while group_selected < per_group and any(speaker_rows[speaker_id] for speaker_id in speaker_ids):
            for speaker_id in speaker_ids:
                if group_selected >= per_group:
                    break
                if not speaker_rows[speaker_id]:
                    continue
                row = speaker_rows[speaker_id].pop(0)
                if row["record_id"] in seen_record_ids:
                    continue
                selected.append(row)
                seen_record_ids.add(row["record_id"])
                group_selected += 1

    selected.sort(
        key=lambda item: (
            item["split"],
            item["speaker_gender"],
            item["speaker_dialect"],
            item["speaker_id"],
            item["segment_id"],
        )
    )
    return selected


def freeze_core_rows(rows: list[dict], selected_ids: set[str]) -> list[dict]:
    frozen_rows: list[dict] = []
    for row in rows:
        if row["record_id"] not in selected_ids:
            continue
        frozen = deepcopy(row)
        frozen["locked_for_eval"] = True
        frozen["next_action"] = "done"
        frozen["notes"] = f"{row['notes']}; frozen_magicdata_core_subset"
        frozen_rows.append(frozen)
    return frozen_rows


def build_summary(
    *,
    extracted_root: Path,
    full_rows: list[dict],
    core_rows: list[dict],
) -> dict:
    counts_by_split: dict[str, int] = defaultdict(int)
    counts_by_split_gender: dict[str, int] = defaultdict(int)
    counts_by_dialect: dict[str, int] = defaultdict(int)
    core_counts_by_split_gender: dict[str, int] = defaultdict(int)

    for row in full_rows:
        counts_by_split[row["split"]] += 1
        counts_by_split_gender[f"{row['split']}::{row['speaker_gender']}"] += 1
        counts_by_dialect[row["speaker_dialect"] or "unknown"] += 1
    for row in core_rows:
        core_counts_by_split_gender[f"{row['split']}::{row['speaker_gender']}"] += 1

    dev_sample = next(row for row in full_rows if row["split"] == "dev")
    test_sample = next(row for row in full_rows if row["split"] == "test")
    dev_example = inspect_wave(ROOT / dev_sample["audio_path"])
    test_example = inspect_wave(ROOT / test_sample["audio_path"])

    return {
        "generated_at": now_iso(),
        "dataset": "magicdata_zh",
        "license_scope": "local_only_noncommercial",
        "full_reference_records": len(full_rows),
        "core_eval_records": len(core_rows),
        "counts_by_split": dict(sorted(counts_by_split.items())),
        "counts_by_split_gender": dict(sorted(counts_by_split_gender.items())),
        "core_counts_by_split_gender": dict(sorted(core_counts_by_split_gender.items())),
        "top_dialects": sorted(
            ({"dialect": dialect, "count": count} for dialect, count in counts_by_dialect.items()),
            key=lambda item: (-item["count"], item["dialect"]),
        )[:10],
        "audio_format_examples": {
            "dev": dev_example,
            "test": test_example,
        },
        "outputs": {
            "full_transcripts": display_path(DEFAULT_FULL_OUTPUT),
            "core_transcripts": display_path(DEFAULT_CORE_OUTPUT),
            "summary_json": display_path(DEFAULT_SUMMARY_OUTPUT),
        },
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-root", type=Path, default=DEFAULT_RAW_ROOT)
    parser.add_argument("--extracted-root", type=Path, default=DEFAULT_EXTRACTED_ROOT)
    parser.add_argument("--full-output", type=Path, default=DEFAULT_FULL_OUTPUT)
    parser.add_argument("--core-output", type=Path, default=DEFAULT_CORE_OUTPUT)
    parser.add_argument("--summary-output", type=Path, default=DEFAULT_SUMMARY_OUTPUT)
    parser.add_argument("--core-per-group", type=int, default=6)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    ensure_extracted(args.raw_root, args.extracted_root)
    full_rows = build_reference_rows(args.extracted_root)
    core_base_rows = select_core_subset(full_rows, per_group=args.core_per_group)
    core_rows = freeze_core_rows(full_rows, {row["record_id"] for row in core_base_rows})

    write_jsonl(args.full_output, full_rows)
    write_jsonl(args.core_output, core_rows)
    summary = build_summary(extracted_root=args.extracted_root, full_rows=full_rows, core_rows=core_rows)
    summary["outputs"] = {
        "full_transcripts": display_path(args.full_output),
        "core_transcripts": display_path(args.core_output),
        "summary_json": display_path(args.summary_output),
    }
    write_json(args.summary_output, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
