from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_audio_final_transcript_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"
README = ROOT / "README.md"


def run_harness() -> dict:
    result = subprocess.run(
        ["node", str(HARNESS), "--mode", "mock"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_audio_final_transcript_flow_updates_transcript_and_reply():
    payload = run_harness()

    assert payload["afterConnect"]["connectionStatus"] == "connected"
    assert payload["duringRecording"]["recordingState"] == "recording"
    assert payload["afterStop"]["recordingState"] == "stopped"
    assert payload["afterReply"]["audioUploadState"] == "completed"
    assert payload["afterReply"]["userFinalText"].startswith("Bonjour")
    assert payload["afterReply"]["assistantReplyText"].startswith("谢谢你愿意先开口")
    assert payload["afterReply"]["dialogueReplyState"] == "received"
    assert payload["afterReply"]["timelineStageText"] == "engage → assess"


def test_web_audio_final_transcript_flow_keeps_chunk_uploads_and_finalize_call():
    payload = run_harness()

    assert len(payload["uploadCalls"]) >= 2
    assert payload["uploadCalls"][-1]["isFinal"] is True
    assert len(payload["finalizeCalls"]) == 1
    assert payload["finalizeCalls"][0]["contentType"] == "audio/wav"
    assert payload["afterReply"]["lastMessageId"] == "msg_mock_audio_001"


def test_audio_finalize_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    gateway_readme = GATEWAY_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")

    assert "最终转写" in web_readme
    assert "POST /api/session/{session_id}/audio/finalize" in gateway_readme
    assert "scripts/verify_web_audio_final_transcript.py" in root_readme
