#!/usr/bin/env python3
"""Verify the offline avatar-driver path against one real enterprise 3D feature sample."""

from __future__ import annotations

import json
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
SERVICE_MAIN = ROOT / "services" / "avatar-driver-service" / "main.py"
MANIFEST_PATH = ROOT / "data" / "manifests" / "val_manifest.jsonl"
REPORT_DIR = ROOT / "data" / "derived" / "avatar_driver"
REPORT_PATH = REPORT_DIR / "offline_validation_report.md"
DETAILS_PATH = REPORT_DIR / "offline_validation_report.json"


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_health(url: str) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(30):
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("avatar-driver-service health check did not become ready")


def post_json(url: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            return


def select_manifest_record() -> dict:
    for raw_line in MANIFEST_PATH.read_text(encoding="utf-8").splitlines():
        record = json.loads(raw_line)
        if record.get("has_face3d") and record.get("has_emotion"):
            return record
    raise RuntimeError("no manifest record with face3d and emotion paths was found")


def write_report(payload: dict) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    DETAILS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    report = f"""# Avatar Driver Offline Validation Report

## Sample

- `record_id`: `{payload['record_id']}`
- `avatar_id`: `{payload['avatar_id']}`
- `face3d_path`: `{payload['source_face3d_path']}`
- `emotion_path`: `{payload['source_emotion_path']}`

## Alignment

- `frame_count`: `{payload['frame_count']}`
- `feature_dim`: `{payload['feature_dim']}`
- `emotion_row_count`: `{payload['emotion_row_count']}`
- `alignment_status`: `{payload['alignment_status']}`
- `mismatch_steps`: `{payload['mismatch_steps']}`

## Driver Summary

- `sampled_frames`: `{len(payload['driver_frames'])}`
- `jaw_open_mean`: `{payload['driver_summary']['jaw_open_mean']:.4f}`
- `expression_energy_mean`: `{payload['driver_summary']['expression_energy_mean']:.4f}`
- `dominant_emotion`: `{payload['driver_summary']['dominant_emotion']}`
- `mean_valence`: `{payload['driver_summary']['mean_valence']}`
- `mean_arousal`: `{payload['driver_summary']['mean_arousal']}`
"""
    REPORT_PATH.write_text(report, encoding="utf-8")


def main() -> None:
    record = select_manifest_record()
    port = reserve_local_port()
    base_url = f"http://127.0.0.1:{port}"
    service = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(SERVICE_MAIN.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        wait_for_health(f"{base_url}/health")
        payload = post_json(
            f"{base_url}/internal/avatar/offline-drive",
            {
                "record_id": record["record_id"],
                "avatar_id": "companion_female_01",
                "face3d_path": record["face3d_path"],
                "emotion_path": record["emotion_path"],
                "sample_stride": 75,
                "max_output_frames": 12,
            },
        )
        if payload["frame_count"] <= 0:
            raise RuntimeError("driver service returned no frames")
        if payload["feature_dim"] <= 0:
            raise RuntimeError("driver service returned invalid feature_dim")
        if not payload["driver_frames"]:
            raise RuntimeError("driver service returned no sampled driver frames")
        if payload["alignment_status"] not in {"aligned", "mismatch"}:
            raise RuntimeError("expected aligned or mismatch status for sample with emotion csv")

        write_report(payload)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    finally:
        stop_process(service)


if __name__ == "__main__":
    main()
