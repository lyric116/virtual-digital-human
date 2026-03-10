#!/usr/bin/env python3
"""Verify the 10-turn stability regression report."""

from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.eval_ten_turn_stability import REPORT_JSON, REPORT_MD, evaluate_stability  # noqa: E402


def main() -> None:
    report = evaluate_stability()
    if report["user_turn_count"] != 10:
        raise RuntimeError(f"expected 10 user turns, got {report['user_turn_count']}")
    if report["assistant_turn_count"] != 10:
        raise RuntimeError(f"expected 10 assistant turns, got {report['assistant_turn_count']}")
    if report["event_counts"].get("dialogue.reply", 0) < 10:
        raise RuntimeError("dialogue.reply count is below ten")
    if report["event_counts"].get("knowledge.retrieved", 0) < 10:
        raise RuntimeError("knowledge.retrieved count is below ten")
    if report["event_counts"].get("dialogue.summary.updated", 0) < 3:
        raise RuntimeError("dialogue.summary.updated count is below three")
    if report["enterprise_regression"]["conflict"]:
        raise RuntimeError("enterprise multimodal regression unexpectedly became conflict")
    if not REPORT_MD.exists() or not REPORT_JSON.exists():
        raise RuntimeError("stability report artifacts were not written")

    summary = {
        "session_id": report["session_id"],
        "final_stage": report["final_stage"],
        "dialogue_reply_count": report["event_counts"]["dialogue.reply"],
        "summary_event_count": report["event_counts"]["dialogue.summary.updated"],
        "enterprise_risk_level": report["enterprise_regression"]["risk_level"],
    }
    sys.stdout.write(f"ten-turn stability verified: {json.dumps(summary, ensure_ascii=False)}\n")


if __name__ == "__main__":
    main()
