#!/usr/bin/env python3
"""Verify session replay mode using a saved export JSON without live services."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_session_replay_harness.js"
EXPORT_SAMPLE = ROOT / "data" / "demo" / "session_replay_export.json"


def main() -> None:
    result = subprocess.run(
        [
            "node",
            str(HARNESS),
            "--export-path",
            str(EXPORT_SAMPLE),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)

    before_replay = payload["beforeReplay"]
    after_transcript = payload["afterTranscript"]
    after_reply = payload["afterReply"]
    during_playback = payload["duringPlayback"]
    after_replay = payload["afterReplay"]

    assert before_replay["replayState"] == "idle"
    assert "睡不好" in after_transcript["transcriptFinal"]
    assert after_reply["assistantReply"].startswith("谢谢你说出来")
    assert during_playback["avatarSpeechState"] == "playing"
    assert during_playback["avatarMouthState"] != "closed"
    assert after_replay["replayState"] == "completed"
    assert after_replay["connectionStatus"] == "replay"
    assert "Assistant" in after_replay["timelineText"]
    assert "回放完成" in after_replay["exportStatus"]

    summary = {
        "session_id": after_replay["sessionId"],
        "replay_event_count": after_replay["replayEventCount"],
        "assistant_reply": after_replay["assistantReply"],
        "avatar_expression": after_replay["avatarExpression"],
        "fusion_risk": after_replay["fusionRisk"],
    }
    sys.stdout.write(f"session replay verified: {json.dumps(summary, ensure_ascii=False)}\n")


if __name__ == "__main__":
    main()
