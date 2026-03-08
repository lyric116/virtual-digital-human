#!/usr/bin/env python3
"""Verify the standalone ASR service against enterprise validation samples."""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import wave


ROOT = Path(__file__).resolve().parents[1]
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"
BATCH_FILE = ROOT / "data" / "derived" / "transcripts" / "batches" / "review_batch_002.jsonl"
MANIFEST_FILE = ROOT / "data" / "manifests" / "val_manifest.jsonl"


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
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
        canonical_key = alias_map.get(key.strip().lower(), key.strip())
        values[canonical_key] = value.strip().strip("'").strip('"')
    return values


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


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


def wait_for_health(base_url: str) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(30):
        try:
            with opener.open(f"{base_url}/health", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("asr service health check did not become ready")


def post_audio(base_url: str, record: dict) -> dict:
    audio_path = ROOT / record["audio_path_16k_mono"]
    request = urllib.request.Request(
        (
            f"{base_url}/api/asr/transcribe?"
            f"{urllib.parse.urlencode({'filename': audio_path.name, 'record_id': record['record_id']})}"
        ),
        data=audio_path.read_bytes(),
        headers={"Content-Type": "audio/wav"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    if not (
        env.get("ASR_API_KEY")
        or env.get("OPENAI_API_KEY")
        or env.get("DASHSCOPE_API_KEY")
    ):
        raise RuntimeError("missing ASR credential: set ASR_API_KEY, OPENAI_API_KEY, or DASHSCOPE_API_KEY")

    manifest_rows = {row["record_id"]: row for row in load_jsonl(MANIFEST_FILE)}
    sample_rows = load_jsonl(BATCH_FILE)[:3]
    if len(sample_rows) != 3:
        raise RuntimeError("expected at least three sample rows in review_batch_002.jsonl")

    service_env = dict(env)
    service_env["PYTHONPATH"] = str(ASR_MAIN.parent)
    service_port = reserve_local_port()
    service_env["ASR_SERVICE_PORT"] = str(service_port)
    service_base_url = f"http://127.0.0.1:{service_port}"

    server = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(ASR_MAIN.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(service_port),
        ],
        cwd=ROOT,
        env=service_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        wait_for_health(service_base_url)
        results: list[dict] = []
        for sample in sample_rows:
            manifest_row = manifest_rows[sample["record_id"]]
            source_audio = ROOT / manifest_row["audio_path"]
            derived_audio = ROOT / manifest_row["audio_path_16k_mono"]
            response = post_audio(service_base_url, sample)
            if not response.get("transcript_text", "").strip():
                raise RuntimeError(f"empty transcript for {sample['record_id']}")
            if not response.get("duration_ms"):
                raise RuntimeError(f"missing duration_ms for {sample['record_id']}")
            if "confidence_mean" not in response:
                raise RuntimeError(f"missing confidence_mean field for {sample['record_id']}")

            results.append(
                {
                    "record_id": sample["record_id"],
                    "dataset": sample["dataset"],
                    "canonical_role": sample["canonical_role"],
                    "transcript_text": response["transcript_text"],
                    "duration_ms": response["duration_ms"],
                    "confidence_mean": response["confidence_mean"],
                    "confidence_available": response["confidence_available"],
                    "audio_response": response["audio"],
                    "source_audio_format": inspect_wave(source_audio),
                    "derived_audio_format": inspect_wave(derived_audio),
                }
            )
    finally:
        server.terminate()
        server.wait(timeout=5)

    print(json.dumps({"service_base_url": service_base_url, "samples": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
