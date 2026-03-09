from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_tts_playback_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
ROOT_README = ROOT / "README.md"
TTS_README = ROOT / "services" / "tts-service" / "README.md"


def run_harness(mode: str) -> dict:
    result = subprocess.run(
        [
            "node",
            str(HARNESS),
            "--mode",
            mode,
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


def test_web_tts_playback_happy_path_updates_subtitle_and_audio_state():
    payload = run_harness("mock")

    assert payload["afterReply"]["dialogueReplyState"] == "received"
    assert "慢一点" in payload["afterReply"]["assistantReply"]
    assert payload["afterReply"]["avatarReply"] == payload["afterReply"]["assistantReply"]
    assert payload["afterPlaybackStart"]["ttsPlaybackState"] == "playing"
    assert payload["afterPlaybackStart"]["avatarSpeechState"] == "playing"
    assert payload["afterPlaybackStart"]["audioSrc"].endswith("tts_mock_001.mp3")
    assert payload["afterPlaybackStart"]["avatarVoice"] == "zh-CN-XiaoxiaoNeural"
    assert payload["afterPlaybackEnd"]["ttsPlaybackState"] == "completed"
    assert payload["afterPlaybackEnd"]["avatarSpeechState"] == "completed"


def test_web_tts_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    root_readme = ROOT_README.read_text(encoding="utf-8")
    tts_readme = TTS_README.read_text(encoding="utf-8")

    assert "scripts/verify_web_tts_playback.py" in web_readme
    assert "scripts/verify_web_tts_playback.py" in root_readme
    assert "TTS_CORS_ORIGINS" in tts_readme
