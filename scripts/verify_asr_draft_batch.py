#!/usr/bin/env python3
"""Verify batch draft write-back through the standalone ASR service."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"
WRITE_DRAFTS = ROOT / "scripts" / "write_asr_drafts.py"
TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
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
        values[key.strip()] = value.strip().strip("'").strip('"')
    return values


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


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


def run_checked(args: list[str], *, env: dict[str, str]) -> str:
    completed = subprocess.run(
        args,
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    return completed.stdout.strip()


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    for key in ["ASR_API_KEY", "ASR_BASE_URL", "ASR_MODEL"]:
        if not env.get(key):
            raise RuntimeError(f"missing required ASR variable: {key}")

    with tempfile.TemporaryDirectory(prefix="vdh_asr_batch_verify_") as temp_dir:
        temp_root = Path(temp_dir)
        temp_transcripts = temp_root / "val_transcripts_template.jsonl"
        temp_batch_dir = temp_root / "batches"
        temp_batch = temp_batch_dir / "verify_batch.jsonl"
        temp_results = temp_batch_dir / "verify_batch_service_results.jsonl"

        shutil.copyfile(TRANSCRIPTS, temp_transcripts)

        runner_env = dict(env)
        run_checked(
            [
                sys.executable,
                str(WRITE_DRAFTS),
                "select-batch",
                "--transcripts",
                str(temp_transcripts),
                "--batch-dir",
                str(temp_batch_dir),
                "--batch-id",
                "verify_batch",
                "--limit",
                "4",
                "--balanced-by-group",
                "--per-group",
                "1",
            ],
            env=runner_env,
        )

        batch_rows = load_jsonl(temp_batch)
        if len(batch_rows) != 4:
            raise RuntimeError(f"expected 4 selected rows, got {len(batch_rows)}")

        original_rows = {row["record_id"]: row for row in load_jsonl(temp_transcripts)}
        service_port = reserve_local_port()
        service_base_url = f"http://127.0.0.1:{service_port}"

        service_env = dict(env)
        service_env["PYTHONPATH"] = str(ASR_MAIN.parent)
        service_env["ASR_SERVICE_PORT"] = str(service_port)

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
            run_checked(
                [
                    sys.executable,
                    str(WRITE_DRAFTS),
                    "transcribe-service",
                    "--transcripts",
                    str(temp_transcripts),
                    "--batch",
                    str(temp_batch),
                    "--service-base-url",
                    service_base_url,
                    "--output",
                    str(temp_results),
                ],
                env=runner_env,
            )
        finally:
            server.terminate()
            server.wait(timeout=5)

        updated_rows = {row["record_id"]: row for row in load_jsonl(temp_transcripts)}
        transitioned = 0
        for batch_row in batch_rows:
            row = updated_rows[batch_row["record_id"]]
            if row["workflow_status"] != "draft_ready":
                raise RuntimeError(f"row did not enter draft_ready: {batch_row['record_id']}")
            if row["next_action"] != "manual_review":
                raise RuntimeError(f"row did not request manual review: {batch_row['record_id']}")
            if not row["draft_text_raw"].strip():
                raise RuntimeError(f"row has empty draft_text_raw: {batch_row['record_id']}")
            if not row["asr_engine"]:
                raise RuntimeError(f"row missing asr_engine: {batch_row['record_id']}")
            transitioned += 1

        untouched_pending = 0
        for record_id, original in original_rows.items():
            if record_id in {row["record_id"] for row in batch_rows}:
                continue
            updated = updated_rows[record_id]
            if original["workflow_status"] == updated["workflow_status"] == "pending_asr":
                untouched_pending += 1

        print(
            json.dumps(
                {
                    "service_base_url": service_base_url,
                    "processed_records": len(batch_rows),
                    "transitioned_to_draft_ready": transitioned,
                    "untouched_pending_asr_rows": untouched_pending,
                    "results_output": str(temp_results.relative_to(temp_root)),
                },
                ensure_ascii=False,
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
