#!/usr/bin/env python3
"""Verify the step-37 emotion panel renders text/audio/video/fusion placeholders."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_emotion_panel_harness.js"


def run_harness(mode: str) -> dict:
    result = subprocess.run(
        [
            "node",
            str(HARNESS),
            "--mode",
            mode,
            "--api-base-url",
            "http://127.0.0.1:8000",
            "--affect-base-url",
            "http://127.0.0.1:8060",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "web emotion panel harness failed: "
            f"stdout={result.stdout.strip()} stderr={result.stderr.strip()}"
        )
    return json.loads(result.stdout)


def main() -> None:
    live_payload = run_harness("mock-live")
    enterprise_payload = run_harness("enterprise-sample")

    live_after = live_payload["afterAffect"]
    enterprise_after = enterprise_payload["afterAffect"]

    if live_after["emotionPanelState"] != "ready":
        raise RuntimeError("emotion panel did not reach ready state")
    if live_after["textSignal"] != "anxious":
        raise RuntimeError("text lane did not render anxious placeholder result")
    if live_after["audioSignal"] != "speech_observed":
        raise RuntimeError("audio lane did not render placeholder signal")
    if live_after["videoSignal"] != "camera_offline":
        raise RuntimeError("video lane did not render placeholder signal")
    if live_after["fusionRisk"] != "medium":
        raise RuntimeError("fusion risk did not render expected placeholder value")
    if live_after["affectRequestCount"] < 1:
        raise RuntimeError("frontend did not call affect-service")
    if enterprise_after["sourceDataset"] != "noxi":
        raise RuntimeError("enterprise dataset placeholder was not rendered")
    if "speaker_a/1" not in enterprise_after["sourceRecord"]:
        raise RuntimeError("enterprise record id placeholder was not rendered")

    print(
        json.dumps(
            {
                "live": live_after,
                "enterprise": enterprise_after,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
