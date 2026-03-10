#!/usr/bin/env python3
"""Verify that the latency report can be generated and contains stable summary fields."""

from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.eval_latency_report import REPORT_JSON, REPORT_MD, generate_report  # noqa: E402


def main() -> None:
    report = generate_report()
    if report["run_count"] < 6:
        raise RuntimeError(f"expected at least 6 runs, got {report['run_count']}")
    if report["interactive_run_count"] < 5:
        raise RuntimeError("expected at least five interactive runs")
    if report["enterprise_run_count"] < 1:
        raise RuntimeError("expected at least one enterprise offline run")
    if report["stage_summary"]["dialogue_ms"]["count"] < 6:
        raise RuntimeError("dialogue stage summary did not capture all runs")
    if report["stage_summary"]["tts_ms"]["count"] < 6:
        raise RuntimeError("tts stage summary did not capture all runs")
    if report["stage_summary"]["asr_ms"]["count"] < 1:
        raise RuntimeError("asr stage summary did not include the enterprise sample")
    if not REPORT_MD.exists() or not REPORT_JSON.exists():
        raise RuntimeError("latency report artifacts were not written")

    summary = {
        "run_count": report["run_count"],
        "dialogue_mean_ms": report["stage_summary"]["dialogue_ms"]["mean_ms"],
        "tts_mean_ms": report["stage_summary"]["tts_ms"]["mean_ms"],
        "total_p90_ms": report["stage_summary"]["total_ms"]["p90_ms"],
    }
    sys.stdout.write(f"latency report verified: {json.dumps(summary, ensure_ascii=False)}\n")


if __name__ == "__main__":
    main()
