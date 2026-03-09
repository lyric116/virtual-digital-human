#!/usr/bin/env python3
"""Prepare and evaluate the local MAGICDATA Chinese ASR core subset."""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
PREPARE_SCRIPT = ROOT / "scripts" / "prepare_magicdata_eval.py"
EVAL_SCRIPT = ROOT / "scripts" / "eval_asr_baseline.py"
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"
CORE_TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts-local" / "magicdata_eval_core.jsonl"
REPORT_PATH = ROOT / "data" / "derived" / "eval-local" / "magicdata_asr_baseline_report.md"
DETAILS_PATH = ROOT / "data" / "derived" / "eval-local" / "magicdata_asr_baseline_details.json"


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


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_health(base_url: str) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(60):
        try:
            with opener.open(f"{base_url}/health", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("asr service health check did not become ready")


def run_command(command: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        check=True,
        text=True,
        capture_output=True,
    )


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    if not env.get("ASR_API_KEY"):
        raise RuntimeError("missing ASR credential: set ASR_API_KEY")

    prepare_result = run_command([sys.executable, str(PREPARE_SCRIPT)], env)

    service_port = reserve_local_port()
    service_env = dict(env)
    service_env["PYTHONPATH"] = str(ASR_MAIN.parent)
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
        run_command(
            [
                sys.executable,
                str(EVAL_SCRIPT),
                "--transcripts",
                str(CORE_TRANSCRIPTS),
                "--report",
                str(REPORT_PATH),
                "--details-json",
                str(DETAILS_PATH),
                "--hypothesis-source",
                "service",
                "--service-base-url",
                service_base_url,
            ],
            env,
        )
    finally:
        server.terminate()
        server.wait(timeout=5)

    details = json.loads(DETAILS_PATH.read_text(encoding="utf-8"))
    output = {
        "prepare_stdout": json.loads(prepare_result.stdout),
        "service_base_url": service_base_url,
        "details_json": str(DETAILS_PATH.relative_to(ROOT)),
        "report": str(REPORT_PATH.relative_to(ROOT)),
        "metrics": details["metrics"],
        "gating": details["gating"],
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
