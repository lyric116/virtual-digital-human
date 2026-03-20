#!/usr/bin/env python3
"""Run the stable ASR regression suite, including local MAGICDATA evaluation when present."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
MAGICDATA_RAW_ROOT = ROOT / "data" / "external" / "asr" / "magicdata-zh" / "raw"
MAGICDATA_DETAILS = ROOT / "data" / "derived" / "eval-local" / "magicdata_asr_baseline_details.json"
DEFAULT_MAGICDATA_CORE_PER_GROUP = 12


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


def magicdata_available() -> bool:
    required = ["dev_set.tar.gz", "test_set.tar.gz", "metadata.tar.gz"]
    return all((MAGICDATA_RAW_ROOT / name).exists() for name in required)


def run_command(label: str, command: list[str], env: dict[str, str]) -> dict:
    result = subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        check=True,
        text=True,
        capture_output=True,
    )
    return {
        "label": label,
        "command": command,
        "stdout": result.stdout.strip(),
    }


def enforce_magicdata_thresholds(details_path: Path, *, max_wer: float, max_ser: float) -> dict:
    details = json.loads(details_path.read_text(encoding="utf-8"))
    metrics = details["metrics"]
    wer = metrics["wer"]
    ser = metrics["ser"]
    if wer is None or ser is None:
        raise RuntimeError("missing MAGICDATA metrics")
    if wer > max_wer:
        raise RuntimeError(f"MAGICDATA WER regression: {wer} > {max_wer}")
    if ser > max_ser:
        raise RuntimeError(f"MAGICDATA SER regression: {ser} > {max_ser}")
    return metrics


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-magicdata-wer", type=float, default=0.10)
    parser.add_argument("--max-magicdata-ser", type=float, default=0.40)
    parser.add_argument("--magicdata-core-per-group", type=int, default=DEFAULT_MAGICDATA_CORE_PER_GROUP)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    steps: list[dict] = []

    steps.append(
        run_command(
            "verify_asr_service",
            [sys.executable, str(ROOT / "scripts" / "verify_asr_service.py")],
            env,
        )
    )
    steps.append(
        run_command(
            "verify_asr_postprocess",
            [sys.executable, str(ROOT / "scripts" / "verify_asr_postprocess.py")],
            env,
        )
    )
    steps.append(
        run_command(
            "verify_asr_baseline_eval",
            [sys.executable, str(ROOT / "scripts" / "verify_asr_baseline_eval.py")],
            env,
        )
    )

    magicdata_metrics = None
    if magicdata_available():
        magicdata_command = [sys.executable, str(ROOT / "scripts" / "verify_magicdata_asr_eval.py")]
        if args.magicdata_core_per_group != DEFAULT_MAGICDATA_CORE_PER_GROUP:
            magicdata_command.extend(
                [
                    "--core-per-group",
                    str(args.magicdata_core_per_group),
                    "--label",
                    f"regression_core{args.magicdata_core_per_group}",
                ]
            )
        steps.append(
            run_command(
                "verify_magicdata_asr_eval",
                magicdata_command,
                env,
            )
        )
        details_path = MAGICDATA_DETAILS
        if args.magicdata_core_per_group != DEFAULT_MAGICDATA_CORE_PER_GROUP:
            details_path = MAGICDATA_DETAILS.with_name(
                f"magicdata_asr_baseline_details_regression_core{args.magicdata_core_per_group}.json"
            )
        magicdata_metrics = enforce_magicdata_thresholds(
            details_path,
            max_wer=args.max_magicdata_wer,
            max_ser=args.max_magicdata_ser,
        )

    print(
        json.dumps(
            {
                "status": "ok",
                "magicdata_available": magicdata_available(),
                "magicdata_metrics": magicdata_metrics,
                "steps": [{"label": step["label"]} for step in steps],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
