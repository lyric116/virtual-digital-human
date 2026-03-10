from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_session_start_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
README = ROOT / "README.md"


def run_harness(mode: str) -> dict:
    result = subprocess.run(
        ["node", str(HARNESS), "--mode", mode, "--api-base-url", "http://127.0.0.1:8000"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_session_start_happy_path_creates_fresh_session_state():
    payload = run_harness("mock-success")

    assert payload["firstPage"]["beforeCreate"]["sessionId"] == "未创建"
    assert payload["firstPage"]["afterCreate"]["sessionId"] == "sess_mock_001"
    assert payload["firstPage"]["afterCreate"]["status"] == "created"
    assert payload["firstPage"]["afterCreate"]["stage"] == "engage"

    assert payload["secondPage"]["beforeCreate"]["sessionId"] == "未创建"
    assert payload["secondPage"]["afterCreate"]["sessionId"] == "sess_mock_002"
    assert payload["secondPage"]["afterCreate"]["sessionId"] != payload["firstPage"]["afterCreate"]["sessionId"]
    assert payload["secondPage"]["afterCreate"]["requestState"] == "ready"
    assert payload["requestPayloads"][0]["input_modes"] == ["text", "audio", "video"]


def test_web_session_start_failure_path_surfaces_error_and_recovers_button_state():
    payload = run_harness("mock-error")
    error_page = payload["errorPage"]

    assert error_page["beforeCreate"]["sessionId"] == "未创建"
    assert error_page["afterCreate"]["sessionId"] == "未创建"
    assert error_page["afterCreate"]["requestState"] == "error"
    assert error_page["afterCreate"]["startButtonDisabled"] is False
    assert "Gateway unavailable" in error_page["afterCreate"]["feedback"]
    assert payload["requestPayloads"][0]["input_modes"] == ["text", "audio", "video"]


def test_web_readme_and_root_readme_document_live_session_bootstrap():
    web_readme = WEB_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")

    assert "Start Session" in web_readme
    assert "WEB_PUBLIC_API_BASE_URL" in web_readme
    assert "scripts/verify_web_session_start.py" in web_readme
    assert "scripts/verify_web_session_start.py" in root_readme
