from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_session_replay_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
ROOT_README = ROOT / "README.md"
DEMO_EXPORT = ROOT / "data" / "demo" / "session_replay_export.json"


def run_harness() -> dict:
    result = subprocess.run(
        ["node", str(HARNESS), "--export-path", str(DEMO_EXPORT)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_session_replay_reconstructs_saved_export():
    payload = run_harness()

    assert payload["beforeReplay"]["replayState"] == "idle"
    assert "睡不好" in payload["afterTranscript"]["transcriptFinal"]
    assert payload["afterReply"]["assistantReply"].startswith("谢谢你说出来")
    assert payload["duringPlayback"]["avatarSpeechState"] == "playing"
    assert payload["duringPlayback"]["avatarMouthState"] != "closed"
    assert payload["afterReplay"]["replayState"] == "completed"
    assert payload["afterReplay"]["connectionStatus"] == "replay"
    assert payload["afterReplay"]["fusionRisk"] == "medium"
    assert "Assistant" in payload["afterReplay"]["timelineText"]
    assert "User" in payload["afterReplay"]["timelineText"]
    assert "Stage |" not in payload["afterReplay"]["timelineText"]


def test_replay_export_fixture_keeps_affect_and_knowledge_events_complete():
    export_payload = json.loads(DEMO_EXPORT.read_text(encoding="utf-8"))
    event_types = [event["event_type"] for event in export_payload["events"]]

    assert "affect.snapshot" in event_types
    assert "knowledge.retrieved" in event_types

    affect_event = next(event for event in export_payload["events"] if event["event_type"] == "affect.snapshot")
    knowledge_event = next(
        event for event in export_payload["events"] if event["event_type"] == "knowledge.retrieved"
    )

    assert affect_event["payload"]["fusion_result"]["risk_level"] == "medium"
    assert affect_event["payload"]["source_context"]["dataset"] == "demo_replay"
    assert knowledge_event["payload"]["source_ids"] == ["breathing_box_4444"]
    assert knowledge_event["payload"]["grounded_refs"] == ["breathing_box_4444"]


def test_web_session_replay_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    root_readme = ROOT_README.read_text(encoding="utf-8")

    assert "scripts/verify_web_session_replay.py" in web_readme
    assert "scripts/verify_web_session_replay.py" in root_readme
    assert "Replay Export" in web_readme
