from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_recording_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
README = ROOT / "README.md"


def run_harness(mode: str) -> dict:
    result = subprocess.run(
        ["node", str(HARNESS), "--mode", mode],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_recording_allow_flow_updates_permission_and_recording_states():
    payload = run_harness("allow")

    assert payload["beforeRequest"]["micPermissionState"] == "idle"
    assert payload["afterPermission"]["micPermissionState"] == "granted"
    assert payload["afterPermission"]["startDisabled"] is False
    assert payload["duringRecording"]["recordingState"] == "recording"
    assert payload["duringRecording"]["inputPill"] == "当前输入：文字 + 语音"
    assert "已收集" in payload["duringRecording"]["recordingDetail"]
    assert payload["afterStop"]["recordingState"] == "stopped"
    assert payload["afterStop"]["stopDisabled"] is True
    assert "录音已停止" in payload["afterStop"]["recordingDetail"]


def test_web_recording_deny_flow_surfaces_clear_permission_message():
    payload = run_harness("deny")

    assert payload["beforeRequest"]["micPermissionState"] == "idle"
    assert payload["afterDeny"]["micPermissionState"] == "denied"
    assert payload["afterDeny"]["recordingState"] == "idle"
    assert payload["afterDeny"]["startDisabled"] is True
    assert "权限被拒绝" in payload["afterDeny"]["permissionStatus"]


def test_recording_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")

    assert "scripts/verify_web_recording_controls.py" in web_readme
    assert "scripts/verify_web_recording_controls.py" in root_readme
