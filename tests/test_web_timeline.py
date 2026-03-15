from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_timeline_harness.js"
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


def test_web_timeline_renders_three_turns_in_order():
    payload = run_harness()

    assert payload["beforeCreate"]["timelineEntryCount"] == 1
    assert payload["afterThreeTurns"]["timelineEntryCount"] == 6
    assert payload["afterThreeTurns"]["stage"] == "reassess"
    assert payload["afterThreeTurns"]["latestStage"] == "intervene → reassess"
    assert "用户 |" in payload["afterThreeTurns"]["timelineText"]
    assert "陪伴方 |" in payload["afterThreeTurns"]["timelineText"]
    assert "Stage |" not in payload["afterThreeTurns"]["timelineText"]
    assert "engage → assess" not in payload["afterThreeTurns"]["timelineText"]
    assert "assess → intervene" not in payload["afterThreeTurns"]["timelineText"]
    assert "intervene → reassess" not in payload["afterThreeTurns"]["timelineText"]


def test_web_timeline_restores_history_after_refresh():
    payload = run_harness()

    assert payload["afterRefresh"]["historyRestoreState"] == "restored"
    assert payload["afterRefresh"]["connectionStatus"] == "connected"
    assert payload["afterRefresh"]["timelineEntryCount"] == payload["afterThreeTurns"]["timelineEntryCount"]
    assert payload["afterRefresh"]["storedSessionId"] == payload["afterThreeTurns"]["sessionId"]
    assert payload["afterRefresh"]["timelineText"] == payload["afterThreeTurns"]["timelineText"]


def test_web_timeline_replayed_events_do_not_duplicate_visible_entries():
    payload = run_harness()

    assert payload["afterReplayDuplicate"]["timelineEntryCount"] == payload["afterRefresh"]["timelineEntryCount"]
    assert payload["afterReplayDuplicate"]["timelineText"] == payload["afterRefresh"]["timelineText"]
    assert payload["afterReplayDuplicate"]["latestStage"] == payload["afterRefresh"]["latestStage"]


def test_timeline_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    gateway_readme = GATEWAY_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")

    assert "scripts/verify_web_timeline.py" in web_readme
    assert "GET /api/session/{session_id}/state" in gateway_readme
    assert "scripts/verify_web_timeline.py" in root_readme
