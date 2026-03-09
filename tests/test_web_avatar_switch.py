from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_tts_playback_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
ROOT_README = ROOT / "README.md"
AVATAR_DOC = ROOT / "docs" / "07-tts-avatar.md"


def run_harness(avatar_id: str) -> dict:
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
            "--avatar-id",
            avatar_id,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_avatar_switch_changes_profile_and_voice():
    companion = run_harness("companion_female_01")
    coach = run_harness("coach_male_01")

    assert companion["beforeCreate"]["activeAvatarId"] == "companion_female_01"
    assert coach["beforeCreate"]["activeAvatarId"] == "coach_male_01"
    assert companion["afterReply"]["effectiveAvatarProfile"] == "companion"
    assert coach["afterReply"]["effectiveAvatarProfile"] == "coach"
    assert companion["afterReply"]["avatarLabel"] != coach["afterReply"]["avatarLabel"]
    assert companion["afterReply"]["avatarMeta"] != coach["afterReply"]["avatarMeta"]
    assert companion["afterPlaybackStart"]["avatarVoice"] == "zh-CN-XiaoxiaoNeural"
    assert coach["afterPlaybackStart"]["avatarVoice"] == "zh-CN-YunxiNeural"
    assert companion["afterReply"]["avatarStageNote"] != coach["afterReply"]["avatarStageNote"]


def test_avatar_switch_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    root_readme = ROOT_README.read_text(encoding="utf-8")
    avatar_doc = AVATAR_DOC.read_text(encoding="utf-8")

    assert "scripts/verify_web_avatar_switch.py" in web_readme
    assert "scripts/verify_web_avatar_switch.py" in root_readme
    assert "步骤 34" in avatar_doc
