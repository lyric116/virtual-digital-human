from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_text_submit_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"
README = ROOT / "README.md"


def run_harness() -> dict:
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
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_text_submit_reaches_sent_state_and_clears_input():
    payload = run_harness()

    assert payload["beforeCreate"]["textSubmitState"] == "idle"
    assert payload["afterConnect"]["connectionStatus"] == "connected"
    assert payload["afterSubmit"]["textSubmitState"] == "sent"
    assert payload["afterSubmit"]["status"] == "active"
    assert payload["afterSubmit"]["lastMessageId"] == "msg_mock_text_001"
    assert payload["afterSubmit"]["draftText"] == ""


def test_web_text_submit_acknowledgement_message_is_visible():
    payload = run_harness()

    assert "发送成功" in payload["afterSubmit"]["textSubmitStatus"]
    assert payload["afterSubmit"]["lastMessageTime"] != "not started"
    assert "message accepted" in payload["afterSubmit"]["connectionLog"]


def test_text_submit_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    gateway_readme = GATEWAY_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")

    assert "Send Text" in web_readme
    assert "scripts/verify_web_text_submit.py" in web_readme
    assert "POST /api/session/{session_id}/text" in gateway_readme
    assert "scripts/verify_web_text_submit.py" in root_readme
