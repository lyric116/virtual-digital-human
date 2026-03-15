from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_mock_reply_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
ORCHESTRATOR_README = ROOT / "apps" / "orchestrator" / "README.md"
README = ROOT / "README.md"


def run_harness(mode: str) -> dict:
    result = subprocess.run(
        [
            "node",
            str(HARNESS),
            "--mode",
            mode,
            "--api-base-url",
            "http://127.0.0.1:8000",
            "--ws-url",
            "ws://127.0.0.1:8000/ws",
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_mock_reply_happy_path_updates_stage_and_reply_slots():
    payload = run_harness("mock")

    assert payload["beforeCreate"]["dialogueReplyState"] == "idle"
    assert payload["afterConnect"]["connectionStatus"] == "connected"
    assert payload["afterReply"]["textSubmitState"] == "sent"
    assert payload["afterReply"]["dialogueReplyState"] == "received"
    assert payload["afterReply"]["stage"] == "assess"
    assert payload["afterReply"]["fusionRisk"] == "medium"
    assert "睡不稳" in payload["afterReply"]["assistantReply"]
    assert "assess" in payload["afterReply"]["timelineStage"]


def test_web_mock_reply_invalid_payload_is_intercepted():
    payload = run_harness("mock-invalid")

    assert payload["afterReply"]["dialogueReplyState"] == "invalid"
    assert payload["afterReply"]["stage"] == "engage"
    assert payload["afterReply"]["assistantReply"] == "等待新的回应..."
    assert "dialogue reply rejected" in payload["afterReply"]["connectionLog"]


def test_mock_reply_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    orchestrator_readme = ORCHESTRATOR_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")

    assert "scripts/verify_web_mock_reply.py" in web_readme
    assert "POST /internal/dialogue/respond" in orchestrator_readme
    assert "scripts/verify_web_mock_reply.py" in root_readme
