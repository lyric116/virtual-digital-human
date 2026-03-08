#!/usr/bin/env python3
"""Build manifest, transcript workflow templates, and QC reports from enterprise validation data."""

from __future__ import annotations

import json
import wave
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data"
VAL_ROOT = DATA_ROOT / "val"
MANIFEST_DIR = DATA_ROOT / "manifests"
DERIVED_TRANSCRIPTS_DIR = DATA_ROOT / "derived" / "transcripts"
QC_REPORT_PATH = DATA_ROOT / "derived" / "qc_report.md"

MANIFEST_PATH = MANIFEST_DIR / "val_manifest.jsonl"
TRANSCRIPT_TEMPLATE_PATH = DERIVED_TRANSCRIPTS_DIR / "val_transcripts_template.jsonl"

TRANSCRIPT_DEFAULTS = {
    "workflow_status": "pending_asr",
    "next_action": "run_asr_draft",
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
    "review_status": "not_started",
    "review_decision": None,
    "reviewer": None,
    "reviewed_at": None,
    "final_text": "",
    "final_text_normalized": "",
    "text_status": "missing",
    "transcript_source": None,
    "language": "zh-CN",
    "quality_flags": [],
    "needs_second_review": False,
    "locked_for_eval": False,
    "transcript_version": 1,
    "review_history": [],
    "notes": "",
}


ROLE_CONFIG = {
    "noxi": {
        "session_root": VAL_ROOT / "Audio_files" / "NoXI",
        "audio_root": VAL_ROOT / "Audio_files" / "NoXI",
        "video_root": VAL_ROOT / "Video_files" / "NoXI",
        "emotion_root": VAL_ROOT / "Emotion" / "NoXI",
        "face_root": VAL_ROOT / "3D_FV_files" / "NoXI",
        "av_roles": {
            "Expert_video": ("speaker_a", "expert"),
            "Novice_video": ("speaker_b", "novice"),
        },
        "label_roles": {
            "speaker_a": "P1",
            "speaker_b": "P2",
        },
    },
    "recola": {
        "session_root": VAL_ROOT / "Audio_files" / "RECOLA",
        "audio_root": VAL_ROOT / "Audio_files" / "RECOLA",
        "video_root": VAL_ROOT / "Video_files" / "RECOLA",
        "emotion_root": VAL_ROOT / "Emotion" / "RECOLA",
        "face_root": VAL_ROOT / "3D_FV_files" / "RECOLA",
        "av_roles": {
            "P41": ("speaker_a", None),
            "P42": ("speaker_b", None),
        },
        "label_roles": {
            "speaker_a": "P1",
            "speaker_b": "P2",
        },
    },
}


def is_hidden(path: Path) -> bool:
    return path.name.startswith("._") or path.name == ".DS_Store"


def visible_dirs(path: Path) -> list[Path]:
    return sorted([p for p in path.iterdir() if p.is_dir() and not is_hidden(p)], key=lambda p: p.name)


def numeric_stem(path: Path) -> tuple[int, str]:
    stem = path.stem.replace("_full", "")
    try:
        return (int(stem), path.name)
    except ValueError:
        return (10**9, path.name)


def visible_files(path: Path, suffix: str) -> list[Path]:
    return sorted(
        [p for p in path.iterdir() if p.is_file() and not is_hidden(p) and p.suffix == suffix],
        key=numeric_stem,
    )


def audio_meta(path: Path) -> tuple[int | None, int | None]:
    if not path.exists():
        return (None, None)
    with wave.open(str(path), "rb") as wf:
        return (wf.getframerate(), wf.getnchannels())


def emotion_rows(path: Path) -> int | None:
    if not path.exists():
        return None
    with path.open(newline="") as handle:
        return max(sum(1 for _ in handle) - 1, 0)


def face_steps(path: Path) -> int | None:
    if not path.exists():
        return None
    arr = np.load(path, mmap_mode="r")
    return int(arr.shape[0])


def note_list_to_text(notes: Iterable[str]) -> str:
    return "; ".join([n for n in notes if n])


def load_jsonl_by_record_id(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}

    entries: dict[str, dict] = {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            payload = json.loads(line)
            record_id = payload.get("record_id")
            if record_id:
                entries[record_id] = payload
    return entries


def infer_transcript_state(payload: dict) -> tuple[str, str, str]:
    final_text = (payload.get("final_text_normalized") or payload.get("final_text") or "").strip()
    draft_text = (payload.get("draft_text_normalized") or payload.get("draft_text_raw") or "").strip()
    review_status = payload.get("review_status")
    review_decision = payload.get("review_decision")

    if payload.get("locked_for_eval") and final_text:
        return ("verified", "done", "human_verified")
    if review_status == "completed" and review_decision == "approved" and final_text:
        return ("verified", "done", "human_verified")
    if review_status in {"in_progress", "queued"}:
        return ("pending_review", "manual_review", "asr_generated" if draft_text else "missing")
    if review_status == "completed" and review_decision in {"needs_revision", "rejected"}:
        return ("pending_review", "manual_review", "asr_generated" if draft_text else "missing")
    if draft_text:
        return ("draft_ready", "manual_review", "asr_generated")
    return ("pending_asr", "run_asr_draft", "missing")


def build_records() -> list[dict]:
    records: list[dict] = []
    existing_manifest = load_jsonl_by_record_id(MANIFEST_PATH)

    for dataset, cfg in ROLE_CONFIG.items():
        for session_dir in visible_dirs(cfg["session_root"]):
            for av_role_dir in visible_dirs(session_dir):
                if av_role_dir.name not in cfg["av_roles"]:
                    continue

                canonical_role, semantic_role = cfg["av_roles"][av_role_dir.name]
                label_role = cfg["label_roles"][canonical_role]

                for audio_path in visible_files(av_role_dir, ".wav"):
                    segment_id = audio_path.stem
                    video_path = cfg["video_root"] / session_dir.relative_to(cfg["audio_root"]) / av_role_dir.name / f"{segment_id}.mp4"
                    emotion_path = cfg["emotion_root"] / session_dir.relative_to(cfg["audio_root"]) / label_role / f"{segment_id}.csv"
                    face_path = cfg["face_root"] / session_dir.relative_to(cfg["audio_root"]) / av_role_dir.name / f"{segment_id}.npy"
                    face_full_path = cfg["face_root"] / session_dir.relative_to(cfg["audio_root"]) / av_role_dir.name / f"{segment_id}_full.npy"

                    has_video = video_path.exists()
                    has_emotion = emotion_path.exists()
                    has_face3d = face_path.exists()
                    sr, channels = audio_meta(audio_path)
                    e_rows = emotion_rows(emotion_path) if has_emotion else None
                    f_steps = face_steps(face_path) if has_face3d else None

                    if has_emotion and has_face3d and e_rows == f_steps:
                        alignment_status = "aligned"
                    elif has_emotion and has_face3d:
                        alignment_status = "mismatch"
                    else:
                        alignment_status = "unverified"

                    if has_emotion:
                        role_mapping_status = "assumed"
                        source_label_role = label_role
                        label_status = "complete"
                    else:
                        role_mapping_status = "unlinked"
                        source_label_role = None
                        label_status = "missing"

                    notes = []
                    if not has_video:
                        notes.append("missing video")
                    if not has_emotion:
                        notes.append("missing emotion label")
                    if not has_face3d:
                        notes.append("missing 3d feature")
                    if has_emotion and has_face3d and e_rows != f_steps:
                        notes.append(f"emotion rows {e_rows} != face3d steps {f_steps}")

                    records.append(
                        {
                            "record_id": f"{dataset}/{session_dir.name}/{canonical_role}/{segment_id}",
                            "split": "val",
                            "dataset": dataset,
                            "session_id": session_dir.name,
                            "segment_id": segment_id,
                            "source_av_role": av_role_dir.name,
                            "source_label_role": source_label_role,
                            "canonical_role": canonical_role,
                            "semantic_role": semantic_role,
                            "role_mapping_status": role_mapping_status,
                            "audio_path": str(audio_path.relative_to(ROOT)),
                            "video_path": str(video_path.relative_to(ROOT)) if has_video else None,
                            "emotion_path": str(emotion_path.relative_to(ROOT)) if has_emotion else None,
                            "face3d_path": str(face_path.relative_to(ROOT)) if has_face3d else None,
                            "face3d_full_path": str(face_full_path.relative_to(ROOT)) if face_full_path.exists() else None,
                            "has_audio": True,
                            "has_video": has_video,
                            "has_emotion": has_emotion,
                            "has_face3d": has_face3d,
                            "text_status": "missing",
                            "transcript_path": str(TRANSCRIPT_TEMPLATE_PATH.relative_to(ROOT)),
                            "label_status": label_status,
                            "notes": note_list_to_text(notes),
                            "audio_sample_rate_hz_src": sr,
                            "audio_channels_src": channels,
                            "audio_path_16k_mono": existing_manifest.get(
                                f"{dataset}/{session_dir.name}/{canonical_role}/{segment_id}", {}
                            ).get("audio_path_16k_mono"),
                            "emotion_num_rows": e_rows,
                            "face3d_num_steps": f_steps,
                            "alignment_status": alignment_status,
                            "dataset_role_group": av_role_dir.name,
                            "manifest_version": "0.1.0",
                        }
                    )

    return sorted(records, key=lambda r: (r["dataset"], r["session_id"], r["canonical_role"], int(r["segment_id"])))


def write_manifest(records: list[dict]) -> None:
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    with MANIFEST_PATH.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_transcript_template(records: list[dict]) -> list[dict]:
    DERIVED_TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    existing_entries = load_jsonl_by_record_id(TRANSCRIPT_TEMPLATE_PATH)
    transcript_entries: list[dict] = []

    with TRANSCRIPT_TEMPLATE_PATH.open("w", encoding="utf-8") as handle:
        for record in records:
            payload = {
                "record_id": record["record_id"],
                "dataset": record["dataset"],
                "session_id": record["session_id"],
                "canonical_role": record["canonical_role"],
                "segment_id": record["segment_id"],
                "audio_path": record["audio_path"],
                "audio_path_16k_mono": record["audio_path_16k_mono"],
                "manifest_version": record["manifest_version"],
            }

            existing = existing_entries.get(record["record_id"], {})
            for field, default in TRANSCRIPT_DEFAULTS.items():
                payload[field] = existing.get(field, default)

            workflow_status, next_action, text_status = infer_transcript_state(payload)
            payload["workflow_status"] = workflow_status
            payload["next_action"] = next_action
            payload["text_status"] = text_status

            handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
            transcript_entries.append(payload)

    return transcript_entries


def hidden_file_count() -> int:
    count = 0
    for path in VAL_ROOT.rglob("*"):
        if path.is_file() and is_hidden(path):
            count += 1
    return count


def write_qc_report(records: list[dict], transcript_entries: list[dict]) -> None:
    QC_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    dataset_counter = Counter(record["dataset"] for record in records)
    role_counter = Counter((record["dataset"], record["canonical_role"]) for record in records)
    mapping_counter = Counter(record["role_mapping_status"] for record in records)
    alignment_counter = Counter(record["alignment_status"] for record in records)
    transcript_status_counter = Counter(entry["workflow_status"] for entry in transcript_entries)

    coverage_by_group: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    transcript_by_group: dict[tuple[str, str], Counter] = defaultdict(Counter)
    missing_by_group: dict[tuple[str, str], list[str]] = defaultdict(list)
    mismatch_by_group: dict[tuple[str, str], list[str]] = defaultdict(list)
    mismatch_deltas: dict[tuple[str, str], list[int]] = defaultdict(list)

    complete_multimodal = sum(
        1
        for record in records
        if record["has_audio"] and record["has_video"] and record["has_emotion"] and record["has_face3d"]
    )
    missing_emotion = sum(1 for record in records if not record["has_emotion"])
    missing_face3d = sum(1 for record in records if not record["has_face3d"])
    mismatch_alignment = sum(1 for record in records if record["alignment_status"] == "mismatch")

    missing_emotion_examples = [record["record_id"] for record in records if not record["has_emotion"]][:10]
    mismatch_examples = [record["record_id"] for record in records if record["alignment_status"] == "mismatch"][:10]

    for record in records:
        group = (record["dataset"], record["canonical_role"])
        stats = coverage_by_group[group]
        stats["records"] += 1
        if record["has_audio"] and record["has_video"] and record["has_emotion"] and record["has_face3d"]:
            stats["complete_multimodal"] += 1
        if not record["has_emotion"]:
            stats["missing_emotion"] += 1
            missing_by_group[group].append(record["record_id"])
        if not record["has_video"]:
            stats["missing_video"] += 1
        if not record["has_face3d"]:
            stats["missing_face3d"] += 1
        if record["alignment_status"] == "mismatch":
            stats["alignment_mismatch"] += 1
            mismatch_by_group[group].append(record["record_id"])
            if record["emotion_num_rows"] is not None and record["face3d_num_steps"] is not None:
                mismatch_deltas[group].append(record["face3d_num_steps"] - record["emotion_num_rows"])
        if record["alignment_status"] == "unverified":
            stats["alignment_unverified"] += 1

    for entry in transcript_entries:
        transcript_by_group[(entry["dataset"], entry["canonical_role"])][entry["workflow_status"]] += 1

    lines = [
        "# QC Report",
        "",
        f"Generated at: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## 1. Scope",
        "",
        f"- Manifest path: `{MANIFEST_PATH.relative_to(ROOT)}`",
        f"- Transcript template path: `{TRANSCRIPT_TEMPLATE_PATH.relative_to(ROOT)}`",
        f"- Total records: `{len(records)}`",
        "",
        "## 2. Dataset Summary",
        "",
        "| Dataset | Records |",
        "| --- | ---: |",
    ]

    for dataset, count in sorted(dataset_counter.items()):
        lines.append(f"| {dataset} | {count} |")

    lines.extend(
        [
            "",
            "## 3. Role Summary",
            "",
            "| Dataset | Canonical role | Records |",
            "| --- | --- | ---: |",
        ]
    )
    for (dataset, role), count in sorted(role_counter.items()):
        lines.append(f"| {dataset} | {role} | {count} |")

    lines.extend(
        [
            "",
            "## 4. Coverage Summary",
            "",
            f"- Complete AV + emotion + 3D samples: `{complete_multimodal}`",
            f"- Records missing emotion labels: `{missing_emotion}`",
            f"- Records missing 3D features: `{missing_face3d}`",
            f"- Alignment mismatches: `{mismatch_alignment}`",
            f"- Hidden files filtered from source tree: `{hidden_file_count()}`",
            "",
            "## 5. Coverage By Dataset And Role",
            "",
            "| Dataset | Canonical role | Records | Complete multimodal | Missing emotion | Missing video | Missing 3D | Alignment mismatch | Alignment unverified |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )

    for group in sorted(coverage_by_group):
        stats = coverage_by_group[group]
        lines.append(
            f"| {group[0]} | {group[1]} | {stats['records']} | {stats['complete_multimodal']} | "
            f"{stats['missing_emotion']} | {stats['missing_video']} | {stats['missing_face3d']} | "
            f"{stats['alignment_mismatch']} | {stats['alignment_unverified']} |"
        )

    lines.extend(
        [
            "",
            "## 6. Transcript Workflow Status",
            "",
            "| Workflow status | Count |",
            "| --- | ---: |",
        ]
    )
    for status, count in sorted(transcript_status_counter.items()):
        lines.append(f"| {status} | {count} |")

    lines.extend(
        [
            "",
            "### Transcript Workflow By Dataset And Role",
            "",
            "| Dataset | Canonical role | pending_asr | draft_ready | pending_review | verified |",
            "| --- | --- | ---: | ---: | ---: | ---: |",
        ]
    )
    for group in sorted(transcript_by_group):
        counter = transcript_by_group[group]
        lines.append(
            f"| {group[0]} | {group[1]} | {counter['pending_asr']} | {counter['draft_ready']} | "
            f"{counter['pending_review']} | {counter['verified']} |"
        )

    lines.extend(
        [
            "",
            "## 7. Mapping Status",
            "",
            "| Status | Count |",
            "| --- | ---: |",
        ]
    )
    for status, count in sorted(mapping_counter.items()):
        lines.append(f"| {status} | {count} |")

    lines.extend(
        [
            "",
            "## 8. Alignment Status",
            "",
            "| Status | Count |",
            "| --- | ---: |",
        ]
    )
    for status, count in sorted(alignment_counter.items()):
        lines.append(f"| {status} | {count} |")

    lines.extend(
        [
            "",
            "## 9. Problem Breakdown",
            "",
            "### Missing Emotion By Dataset And Role",
            "",
            "| Dataset | Canonical role | Count | Example records |",
            "| --- | --- | ---: | --- |",
        ]
    )
    if missing_by_group:
        for group in sorted(missing_by_group):
            examples = ", ".join(f"`{item}`" for item in missing_by_group[group][:5])
            lines.append(f"| {group[0]} | {group[1]} | {len(missing_by_group[group])} | {examples} |")
    else:
        lines.append("| - | - | 0 | - |")

    lines.extend(
        [
            "",
            "### Alignment Mismatch By Dataset And Role",
            "",
            "| Dataset | Canonical role | Count | Delta summary | Example records |",
            "| --- | --- | ---: | --- | --- |",
        ]
    )
    if mismatch_by_group:
        for group in sorted(mismatch_by_group):
            delta_summary = ",".join(str(v) for v in sorted(set(mismatch_deltas[group]))) or "-"
            examples = ", ".join(f"`{item}`" for item in mismatch_by_group[group][:5])
            lines.append(
                f"| {group[0]} | {group[1]} | {len(mismatch_by_group[group])} | {delta_summary} | {examples} |"
            )
    else:
        lines.append("| - | - | 0 | - | - |")

    lines.extend(
        [
            "",
            "## 10. Known Issues",
            "",
            "- RECOLA currently contains AV and 3D samples without matching emotion CSV for some segment IDs.",
            "- Emotion CSV data rows and 3D time steps commonly differ by one step and must be normalized before fusion training.",
            "- Transcript workflow is initialized but remains pending ASR draft generation and manual review before formal ASR evaluation.",
            "",
            "### Missing Emotion Examples",
            "",
        ]
    )

    if missing_emotion_examples:
        for example in missing_emotion_examples:
            lines.append(f"- `{example}`")
    else:
        lines.append("- None")

    lines.extend(["", "### Alignment Mismatch Examples", ""])
    if mismatch_examples:
        for example in mismatch_examples:
            lines.append(f"- `{example}`")
    else:
        lines.append("- None")

    lines.extend(
        [
            "",
            "## 11. Manual Follow-up",
            "",
            "- Confirm whether NoXI `P1/P2` exactly match `Expert_video/Novice_video` for all sessions.",
            "- Confirm whether RECOLA segment 10 is intentionally unlabeled or missing during export.",
            "- Decide a single preprocessing rule for the common `750/751` off-by-one alignment case.",
            "- Start filling `data/derived/transcripts/val_transcripts_template.jsonl` with ASR draft outputs, then move records into manual review and final verification states.",
        ]
    )

    QC_REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    records = build_records()
    write_manifest(records)
    transcript_entries = write_transcript_template(records)
    write_qc_report(records, transcript_entries)

    summary = {
        "records": len(records),
        "manifest": str(MANIFEST_PATH.relative_to(ROOT)),
        "transcript_template": str(TRANSCRIPT_TEMPLATE_PATH.relative_to(ROOT)),
        "qc_report": str(QC_REPORT_PATH.relative_to(ROOT)),
    }
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
