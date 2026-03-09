from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_tts_playback_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
ROOT_README = ROOT / "README.md"
AVATAR_DOC = ROOT / "docs" / "07-tts-avatar.md"

SHORT_REPLY = "慢一点说。"
LONG_REPLY = "谢谢你愿意说出来。我们先慢一点，把今晚最难受的部分说清楚，再看看脑子停不下来的感觉通常在什么时间最明显。"


def run_harness(reply_text: str) -> dict:
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
            "--tts-base-url",
            "http://127.0.0.1:8040",
            "--reply-text",
            reply_text,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_avatar_mouth_drive_changes_during_short_and_long_playback():
    short_payload = run_harness(SHORT_REPLY)
    long_payload = run_harness(LONG_REPLY)

    assert short_payload["afterPlaybackStart"]["avatarMouthState"] in {"small", "wide", "round"}
    assert short_payload["afterPlaybackEnd"]["avatarMouthState"] == "closed"
    assert short_payload["afterPlaybackEnd"]["avatarMouthTransitionCount"] >= 2

    assert long_payload["afterPlaybackStart"]["avatarMouthState"] in {"small", "wide", "round"}
    assert long_payload["afterPlaybackEnd"]["avatarMouthState"] == "closed"
    assert long_payload["afterPlaybackEnd"]["avatarMouthTransitionCount"] > short_payload["afterPlaybackEnd"]["avatarMouthTransitionCount"]


def test_avatar_mouth_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    root_readme = ROOT_README.read_text(encoding="utf-8")
    avatar_doc = AVATAR_DOC.read_text(encoding="utf-8")

    assert "scripts/verify_web_avatar_mouth_drive.py" in web_readme
    assert "scripts/verify_web_avatar_mouth_drive.py" in root_readme
    assert "步骤 33" in avatar_doc
