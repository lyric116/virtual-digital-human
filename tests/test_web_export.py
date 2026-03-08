from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_export_harness.js"
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


def test_web_export_produces_session_payload_with_messages_stages_and_events():
    payload = run_harness()

    assert payload["beforeCreate"]["exportState"] == "idle"
    assert payload["afterConnect"]["connectionStatus"] == "connected"
    assert payload["afterExport"]["exportState"] == "exported"
    assert payload["afterExport"]["exportedMessageCount"] == 4
    assert payload["afterExport"]["exportedStageCount"] == 3
    assert payload["afterExport"]["exportedEventCount"] == 5

    exported_payload = payload["exportedPayload"]
    assert exported_payload["session_id"] == payload["afterExport"]["sessionId"]
    assert exported_payload["stage"] == "intervene"
    assert exported_payload["messages"][0]["role"] == "user"
    assert exported_payload["messages"][1]["role"] == "assistant"
    assert exported_payload["stage_history"][0]["stage"] == "engage"
    assert exported_payload["stage_history"][0]["trace_id"] == exported_payload["trace_id"]
    assert exported_payload["stage_history"][1]["stage"] == "assess"
    assert exported_payload["stage_history"][2]["stage"] == "intervene"
    assert exported_payload["events"][0]["event_type"] == "session.created"
    assert "dialogue.reply" in [event["event_type"] for event in exported_payload["events"]]


def test_web_export_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    gateway_readme = GATEWAY_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")

    assert "scripts/verify_web_export.py" in web_readme
    assert "GET /api/session/{session_id}/export" in gateway_readme
    assert "scripts/verify_web_export.py" in root_readme
