#!/usr/bin/env python3
"""Verify microphone permission and local recording controls through the frontend harness."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_recording_harness.js"


def run_harness(mode: str) -> dict:
    result = subprocess.run(
        ["node", str(HARNESS), "--mode", mode],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def main() -> None:
    allow = run_harness("allow")
    deny = run_harness("deny")

    if allow["afterPermission"]["micPermissionState"] != "granted":
        raise RuntimeError("allow flow did not reach granted microphone state")
    if allow["duringRecording"]["recordingState"] != "recording":
        raise RuntimeError("allow flow did not reach recording state")
    if allow["afterStop"]["recordingState"] != "stopped":
        raise RuntimeError("allow flow did not reach stopped state")
    if "录音已停止" not in allow["afterStop"]["recordingDetail"]:
        raise RuntimeError("allow flow did not surface a stop summary")

    if deny["afterDeny"]["micPermissionState"] != "denied":
        raise RuntimeError("deny flow did not reach denied microphone state")
    if "权限被拒绝" not in deny["afterDeny"]["permissionStatus"]:
        raise RuntimeError("deny flow did not surface a clear permission message")

    print(json.dumps({"allow": allow, "deny": deny}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
