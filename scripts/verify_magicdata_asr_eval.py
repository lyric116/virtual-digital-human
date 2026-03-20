#!/usr/bin/env python3
"""Prepare and evaluate the local MAGICDATA Chinese ASR core subset."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
PREPARE_SCRIPT = ROOT / "scripts" / "prepare_magicdata_eval.py"
EVAL_SCRIPT = ROOT / "scripts" / "eval_asr_baseline.py"
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"
FULL_TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts-local" / "magicdata_eval_all.jsonl"
CORE_TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts-local" / "magicdata_eval_core.jsonl"
PREPARE_SUMMARY_PATH = ROOT / "data" / "derived" / "eval-local" / "magicdata_import_summary.json"
REPORT_PATH = ROOT / "data" / "derived" / "eval-local" / "magicdata_asr_baseline_report.md"
DETAILS_PATH = ROOT / "data" / "derived" / "eval-local" / "magicdata_asr_baseline_details.json"
DEFAULT_CORE_PER_GROUP = 12
SAFE_LABEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--core-per-group", type=int, default=DEFAULT_CORE_PER_GROUP)
    parser.add_argument("--label", default=None)
    return parser


def resolve_output_paths(label: str | None) -> dict[str, Path]:
    if not label:
        return {
            "full_transcripts": FULL_TRANSCRIPTS,
            "core_transcripts": CORE_TRANSCRIPTS,
            "prepare_summary": PREPARE_SUMMARY_PATH,
            "report": REPORT_PATH,
            "details": DETAILS_PATH,
        }
    normalized = label.strip()
    if not SAFE_LABEL_RE.fullmatch(normalized):
        raise ValueError("label must match ^[A-Za-z0-9][A-Za-z0-9._-]*$")
    return {
        "full_transcripts": FULL_TRANSCRIPTS.with_name(f"magicdata_eval_all_{normalized}.jsonl"),
        "core_transcripts": CORE_TRANSCRIPTS.with_name(f"magicdata_eval_core_{normalized}.jsonl"),
        "prepare_summary": PREPARE_SUMMARY_PATH.with_name(f"magicdata_import_summary_{normalized}.json"),
        "report": REPORT_PATH.with_name(f"magicdata_asr_baseline_report_{normalized}.md"),
        "details": DETAILS_PATH.with_name(f"magicdata_asr_baseline_details_{normalized}.json"),
    }


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
    parser = build_parser()
    args = parser.parse_args()

    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    if not env.get("ASR_API_KEY"):
        raise RuntimeError("missing ASR credential: set ASR_API_KEY")

    output_paths = resolve_output_paths(args.label)
    prepare_result = run_command(
        [
            sys.executable,
            str(PREPARE_SCRIPT),
            "--full-output",
            str(output_paths["full_transcripts"]),
            "--core-output",
            str(output_paths["core_transcripts"]),
            "--summary-output",
            str(output_paths["prepare_summary"]),
            "--core-per-group",
            str(args.core_per_group),
        ],
        env,
    )

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
                str(output_paths["core_transcripts"]),
                "--report",
                str(output_paths["report"]),
                "--details-json",
                str(output_paths["details"]),
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

    details = json.loads(output_paths["details"].read_text(encoding="utf-8"))
    output = {
        "prepare_stdout": json.loads(prepare_result.stdout),
        "core_per_group": args.core_per_group,
        "label": args.label,
        "service_base_url": service_base_url,
        "core_transcripts": str(output_paths["core_transcripts"].relative_to(ROOT)),
        "details_json": str(output_paths["details"].relative_to(ROOT)),
        "report": str(output_paths["report"].relative_to(ROOT)),
        "metrics": details["metrics"],
        "gating": details["gating"],
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
