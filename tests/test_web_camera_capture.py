from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_camera_capture_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"
ROOT_README = ROOT / "README.md"


def run_harness(camera_mode: str) -> dict:
    result = subprocess.run(
        [
            "node",
            str(HARNESS),
            "--mode",
            "mock",
            "--camera-mode",
            camera_mode,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_camera_capture_allow_flow_uploads_frames_and_stops_cleanly():
    payload = run_harness("allow")

    assert payload["afterCreate"]["connectionStatus"] == "connected"
    assert payload["afterPermission"]["cameraPermissionState"] == "granted"
    assert payload["duringPreview"]["cameraState"] == "previewing"
    assert payload["duringPreview"]["videoUploadState"] == "uploading"
    assert payload["duringPreview"]["uploadedVideoFrameCount"] >= 2
    assert payload["afterStop"]["cameraState"] == "stopped"
    assert payload["afterStop"]["videoUploadState"] == "completed"
    assert payload["afterStop"]["inputPill"] == "Input: text"
    assert payload["uploadCalls"][0]["frameSeq"] == 1


def test_web_camera_capture_deny_flow_stays_stable_without_uploads():
    payload = run_harness("deny")

    assert payload["afterCreate"]["connectionStatus"] == "connected"
    assert payload["afterPermission"]["cameraPermissionState"] == "denied"
    assert payload["afterPermission"]["cameraState"] == "idle"
    assert payload["afterPermission"]["videoUploadState"] == "idle"
    assert payload["uploadCalls"] == []


def test_web_camera_capture_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    gateway_readme = GATEWAY_README.read_text(encoding="utf-8")
    root_readme = ROOT_README.read_text(encoding="utf-8")

    assert "摄像头" in web_readme
    assert "POST /api/session/{session_id}/video/frame" in gateway_readme
    assert "scripts/verify_web_camera_capture.py" in root_readme
