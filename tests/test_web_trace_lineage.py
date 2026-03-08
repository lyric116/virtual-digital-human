from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_trace_harness.js"
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


def test_web_trace_lineage_surfaces_same_trace_for_session_user_and_reply():
    payload = run_harness()

    assert payload["beforeCreate"]["sessionTrace"] == "not assigned"
    assert payload["afterReply"]["connectionStatus"] == "connected"
    assert payload["afterReply"]["textSubmitState"] == "sent"
    assert payload["afterReply"]["dialogueReplyState"] == "received"
    assert payload["afterReply"]["sessionTrace"] == "trace_mock_trace_001"
    assert payload["afterReply"]["lastUserTrace"] == "trace_mock_trace_001"
    assert payload["afterReply"]["lastReplyTrace"] == "trace_mock_trace_001"


def test_trace_lineage_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    gateway_readme = GATEWAY_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")

    assert "scripts/verify_trace_lineage.py" in web_readme
    assert "trace_id" in gateway_readme
    assert "scripts/verify_trace_lineage.py" in root_readme
