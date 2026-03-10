from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_tts_playback_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
ROOT_README = ROOT / "README.md"
AVATAR_DOC = ROOT / "docs" / "07-tts-avatar.md"


def run_harness(*, stage: str, emotion: str, risk_level: str) -> dict:
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
            "--dialogue-stage",
            stage,
            "--dialogue-emotion",
            emotion,
            "--dialogue-risk-level",
            risk_level,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_expression_presets_change_with_stage_and_risk():
    assess_payload = run_harness(stage="assess", emotion="anxious", risk_level="medium")
    intervene_payload = run_harness(stage="intervene", emotion="anxious", risk_level="medium")
    handoff_payload = run_harness(stage="handoff", emotion="distressed", risk_level="high")

    assert assess_payload["afterReply"]["avatarExpressionPreset"] == "focused_assess"
    assert intervene_payload["afterReply"]["avatarExpressionPreset"] == "steady_support"
    assert handoff_payload["afterReply"]["avatarExpressionPreset"] == "guarded_handoff"
    assert assess_payload["afterReply"]["avatarExpressionDetail"] != intervene_payload["afterReply"]["avatarExpressionDetail"]
    assert "高风险" in handoff_payload["afterReply"]["avatarExpressionDetail"]
    assert handoff_payload["afterReply"]["avatarExpressionLabel"] == "guarded_handoff"


def test_expression_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    root_readme = ROOT_README.read_text(encoding="utf-8")
    avatar_doc = AVATAR_DOC.read_text(encoding="utf-8")

    assert "scripts/verify_web_avatar_expression_presets.py" in web_readme
    assert "scripts/verify_web_avatar_expression_presets.py" in root_readme
    assert "步骤 35" in avatar_doc
