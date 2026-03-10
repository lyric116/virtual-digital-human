#!/usr/bin/env python3
"""Verify avatar expression presets change across stage/risk combinations."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_tts_playback_harness.js"


def run_harness(*, stage: str, emotion: str, risk_level: str) -> dict:
    result = subprocess.run(
        [
            "node",
            str(HARNESS),
            "--mode",
            "mock",
            "--api-base-url",
            "http://127.0.0.1:8000",
            "--ws-url",
            "ws://127.0.0.1:8000/ws",
            "--tts-base-url",
            "http://127.0.0.1:8040",
            "--dialogue-stage",
            stage,
            "--dialogue-emotion",
            emotion,
            "--dialogue-risk-level",
            risk_level,
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "web avatar expression harness failed: "
            f"stdout={result.stdout.strip()} stderr={result.stderr.strip()}"
        )
    return json.loads(result.stdout)


def main() -> None:
    assess_payload = run_harness(stage="assess", emotion="anxious", risk_level="medium")
    intervene_payload = run_harness(stage="intervene", emotion="anxious", risk_level="medium")
    handoff_payload = run_harness(stage="handoff", emotion="distressed", risk_level="high")

    assess_after = assess_payload["afterReply"]
    intervene_after = intervene_payload["afterReply"]
    handoff_after = handoff_payload["afterReply"]

    if assess_after["avatarExpressionPreset"] != "focused_assess":
        raise RuntimeError("assess stage did not map to focused_assess")
    if intervene_after["avatarExpressionPreset"] != "steady_support":
        raise RuntimeError("intervene stage did not map to steady_support")
    if handoff_after["avatarExpressionPreset"] != "guarded_handoff":
        raise RuntimeError("high-risk handoff stage did not map to guarded_handoff")
    if assess_after["avatarExpressionDetail"] == intervene_after["avatarExpressionDetail"]:
        raise RuntimeError("different stages produced the same expression detail")
    if "高风险" not in handoff_after["avatarExpressionDetail"]:
        raise RuntimeError("high-risk handoff detail lost the safety signal")

    print(
        json.dumps(
            {
                "assess_preset": assess_after["avatarExpressionPreset"],
                "intervene_preset": intervene_after["avatarExpressionPreset"],
                "handoff_preset": handoff_after["avatarExpressionPreset"],
                "handoff_detail": handoff_after["avatarExpressionDetail"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
