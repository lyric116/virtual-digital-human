from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_realtime_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
GATEWAY_README = ROOT / "apps" / "api-gateway" / "README.md"


def run_harness(*, close_scenario: str = "normal") -> dict:
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
            "--close-scenario",
            close_scenario,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_realtime_happy_path_reaches_connected_state_and_heartbeat():
    payload = run_harness()

    assert payload["beforeCreate"]["connectionStatus"] == "idle"
    assert payload["afterConnect"]["requestState"] == "ready"
    assert payload["afterConnect"]["connectionStatus"] == "connected"
    assert payload["afterConnect"]["bodyConnectionState"] == "connected"
    assert payload["afterConnect"]["lastHeartbeat"] != "未开始"
    assert "heartbeat acknowledged" in payload["afterConnect"]["connectionLog"]


def test_web_realtime_recovers_after_forced_drop():
    payload = run_harness()

    assert payload["afterReconnect"]["connectionStatus"] == "connected"
    assert payload["afterReconnect"]["bodyConnectionState"] == "connected"
    assert payload["afterReconnect"]["lastHeartbeat"] != "未开始"
    assert "reconnect attempt" in payload["afterReconnect"]["connectionLog"]
    assert "socket connected" in payload["afterReconnect"]["connectionLog"]


def test_web_realtime_missing_session_probe_returns_terminal_websocket_close():
    payload = run_harness()

    assert payload["missingSessionProbe"]["opened"] is True
    assert payload["missingSessionProbe"]["failedAtHandshake"] is False
    assert payload["missingSessionProbe"]["closeCode"] == 4404
    assert payload["missingSessionProbe"]["closeReason"] == "session_not_found"
    assert payload["missingSessionProbe"]["timedOut"] is False


def test_web_realtime_stops_after_terminal_missing_session_close():
    payload = run_harness(close_scenario="terminal_missing_session")

    assert payload["afterTerminalClose"]["connectionStatus"] == "closed"
    assert payload["afterTerminalClose"]["bodyConnectionState"] == "closed"
    assert "terminal realtime close: session_not_found" in payload["afterTerminalClose"]["connectionLog"]
    assert "reconnect attempt 2 scheduled" not in payload["afterTerminalClose"]["connectionLog"]


def test_realtime_readmes_document_websocket_flow():
    web_readme = WEB_README.read_text(encoding="utf-8")
    gateway_readme = GATEWAY_README.read_text(encoding="utf-8")

    assert "scripts/verify_web_realtime_connection.py" in web_readme
    assert "WebSocket" in web_readme
    assert "/ws/session/{session_id}" in gateway_readme
    assert "session.heartbeat" in gateway_readme
