#!/usr/bin/env python3
"""Generate 16kHz mono WAV files for ASR input and backfill manifest/transcript paths."""

from __future__ import annotations

import argparse
import json
import wave
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "data" / "manifests" / "val_manifest.jsonl"
DEFAULT_TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"
DEFAULT_OUTPUT_ROOT = ROOT / "data" / "derived" / "audio_16k_mono"
RAW_AUDIO_PREFIX = Path("data/val/Audio_files")


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


def read_pcm_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        sample_rate = wf.getframerate()
        compression = wf.getcomptype()
        frames = wf.readframes(wf.getnframes())

    if compression != "NONE":
        raise ValueError(f"unsupported compression {compression} for {path}")
    if sample_width != 2:
        raise ValueError(f"unsupported sample width {sample_width} for {path}")

    audio = np.frombuffer(frames, dtype="<i2").astype(np.float32)
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, sample_rate


def resample_linear(audio: np.ndarray, src_rate: int, target_rate: int) -> np.ndarray:
    if src_rate == target_rate:
        return audio
    if audio.size == 0:
        return np.zeros(0, dtype=np.float32)

    target_size = max(int(round(audio.shape[0] * target_rate / src_rate)), 1)
    src_positions = np.arange(audio.shape[0], dtype=np.float64)
    dst_positions = np.arange(target_size, dtype=np.float64) * (src_rate / target_rate)
    dst_positions = np.clip(dst_positions, 0, audio.shape[0] - 1)
    return np.interp(dst_positions, src_positions, audio).astype(np.float32)


def write_pcm_wav(path: Path, audio: np.ndarray, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(np.round(audio), -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(clipped.tobytes())


def derive_output_path(audio_path: str, output_root: Path) -> Path:
    relative = Path(audio_path).relative_to(RAW_AUDIO_PREFIX)
    return output_root / relative


def output_relpath(path: Path) -> str:
    return str(path.relative_to(ROOT))


def prepare_audio(record: dict, output_root: Path, force: bool) -> str:
    src = ROOT / record["audio_path"]
    dst = derive_output_path(record["audio_path"], output_root)

    if force or not dst.exists():
        audio, src_rate = read_pcm_wav(src)
        mono_16k = resample_linear(audio, src_rate, 16000)
        write_pcm_wav(dst, mono_16k, 16000)

    return output_relpath(dst)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--transcripts", type=Path, default=DEFAULT_TRANSCRIPTS)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dataset", choices=["noxi", "recola"], default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    manifest_rows = load_jsonl(args.manifest)
    transcript_rows = load_jsonl(args.transcripts)
    transcript_by_id = {row["record_id"]: row for row in transcript_rows}

    selected = [
        row for row in manifest_rows if (args.dataset is None or row["dataset"] == args.dataset) and row["has_audio"]
    ]
    if args.limit is not None:
        selected = selected[: args.limit]
    selected_ids = {row["record_id"] for row in selected}

    converted = 0
    skipped = 0

    for row in manifest_rows:
        if row["record_id"] not in selected_ids:
            continue

        relpath = prepare_audio(row, args.output_root, args.force)
        if row.get("audio_path_16k_mono") == relpath and not args.force:
            skipped += 1
        else:
            converted += 1
        row["audio_path_16k_mono"] = relpath

        transcript_row = transcript_by_id.get(row["record_id"])
        if transcript_row is not None:
            transcript_row["audio_path_16k_mono"] = relpath

    write_jsonl(args.manifest, manifest_rows)
    write_jsonl(args.transcripts, transcript_rows)

    summary = {
        "processed_records": len(selected),
        "converted_or_updated": converted,
        "already_present": skipped,
        "output_root": output_relpath(args.output_root),
    }
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
