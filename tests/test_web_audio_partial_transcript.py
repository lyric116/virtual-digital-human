from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_audio_final_transcript_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"
README = ROOT / "README.md"
SHARED_CONTRACTS = ROOT / "docs" / "shared_contracts.md"


def run_harness() -> dict:
    result = subprocess.run(
        ["node", str(HARNESS), "--mode", "mock"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_audio_partial_transcript_appears_before_stop():
    payload = run_harness()

    assert payload["duringRecording"]["recordingState"] == "recording"
    assert payload["duringRecording"]["partialTranscriptState"] == "streaming"
    assert payload["duringRecording"]["partialTranscriptText"].startswith("Bonjour")
    assert payload["duringRecording"]["userFinalText"] == "等待你的第一条消息..."


def test_web_audio_partial_transcript_preview_call_happens_before_finalize():
    payload = run_harness()

    assert len(payload["previewCalls"]) >= 1
    assert payload["previewCalls"][0]["previewSeq"] == 1
    assert payload["previewCalls"][0]["contentType"] == "audio/wav"
    assert len(payload["finalizeCalls"]) == 1


def test_web_audio_partial_transcript_preview_uses_incremental_delta_blobs():
    payload = run_harness()

    preview_sizes = [call["bodySize"] for call in payload["previewCalls"]]

    assert len(preview_sizes) >= 2
    assert all(size is not None and size > 0 for size in preview_sizes)
    assert preview_sizes[1] <= preview_sizes[0]
    assert all(size <= preview_sizes[0] for size in preview_sizes[1:])
    assert payload["finalizeCalls"][0]["bodySize"] > max(preview_sizes)


def test_audio_preview_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    gateway_readme = GATEWAY_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")
    shared_contracts = SHARED_CONTRACTS.read_text(encoding="utf-8")

    assert "partial transcript" in web_readme
    assert "POST /api/session/{session_id}/audio/preview" in gateway_readme
    assert "scripts/verify_web_audio_partial_transcript.py" in root_readme
    assert "Audio Finalize And Accepted Audio Message" in shared_contracts
