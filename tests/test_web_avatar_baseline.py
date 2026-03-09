from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_tts_playback_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
ROOT_README = ROOT / "README.md"
AVATAR_DOC = ROOT / "docs" / "07-tts-avatar.md"


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
            "--tts-base-url",
            "http://127.0.0.1:8040",
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_avatar_baseline_switches_between_idle_and_speaking():
    payload = run_harness()

    assert payload["beforeCreate"]["avatarVisualState"] == "idle"
    assert payload["beforeCreate"]["avatarCharacterState"] == "idle"
    assert "等待" in payload["beforeCreate"]["avatarCharacterDetail"]
    assert payload["afterPlaybackStart"]["avatarVisualState"] == "speaking"
    assert payload["afterPlaybackStart"]["avatarCharacterState"] == "speaking"
    assert "说话" in payload["afterPlaybackStart"]["avatarCharacterDetail"]
    assert payload["afterPlaybackEnd"]["avatarVisualState"] == "idle"
    assert payload["afterPlaybackEnd"]["avatarCharacterState"] == "idle"


def test_avatar_baseline_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    root_readme = ROOT_README.read_text(encoding="utf-8")
    avatar_doc = AVATAR_DOC.read_text(encoding="utf-8")

    assert "scripts/verify_web_avatar_baseline.py" in web_readme
    assert "scripts/verify_web_avatar_baseline.py" in root_readme
    assert "步骤 32" in avatar_doc
