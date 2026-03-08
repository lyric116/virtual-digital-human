from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_audio_chunk_upload_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"
README = ROOT / "README.md"


def run_harness() -> dict:
    result = subprocess.run(
        ["node", str(HARNESS)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_audio_chunk_upload_flow_stores_multiple_chunks():
    payload = run_harness()

    assert payload["afterConnect"]["connectionStatus"] == "connected"
    assert payload["duringRecording"]["recordingState"] == "recording"
    assert payload["duringRecording"]["audioUploadState"] == "uploading"
    assert payload["duringRecording"]["uploadedChunkCount"] >= 2
    assert payload["afterStop"]["recordingState"] == "stopped"
    assert payload["afterStop"]["audioUploadState"] == "completed"
    assert payload["afterStop"]["uploadedChunkCount"] >= 3
    assert payload["afterStop"]["lastUploadedChunkId"].startswith("media_mock_")


def test_web_audio_chunk_upload_stops_after_recording_ends():
    payload = run_harness()

    assert payload["uploadCallsAtStop"] == len(payload["uploadCalls"])
    assert payload["afterSettled"]["uploadedChunkCount"] == payload["afterStop"]["uploadedChunkCount"]
    assert payload["uploadCalls"][-1]["isFinal"] is True
    assert payload["uploadCalls"][0]["chunkSeq"] == 1
    assert payload["uploadCalls"][1]["chunkSeq"] == 2


def test_audio_chunk_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    gateway_readme = GATEWAY_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")

    assert "音频分片" in web_readme
    assert "POST /api/session/{session_id}/audio/chunk" in gateway_readme
    assert "scripts/verify_audio_chunk_upload.py" in root_readme
