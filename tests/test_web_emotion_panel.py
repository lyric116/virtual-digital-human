from __future__ import annotations

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "web_emotion_panel_harness.js"
WEB_README = ROOT / "apps" / "web" / "README.md"
AFFECT_README = ROOT / "services" / "affect-service" / "README.md"
README = ROOT / "README.md"


def run_harness(mode: str) -> dict:
    result = subprocess.run(
        [
            "node",
            str(HARNESS),
            "--mode",
            mode,
            "--api-base-url",
            "http://127.0.0.1:8000",
            "--affect-base-url",
            "http://127.0.0.1:8060",
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_web_emotion_panel_renders_lane_results_and_source_fields():
    payload = run_harness("mock-live")
    after = payload["afterAffect"]

    assert after["emotionPanelState"] == "ready"
    assert after["textSignal"] == "anxious"
    assert after["audioSignal"] == "speech_observed"
    assert after["videoSignal"] == "camera_offline"
    assert after["fusionEmotion"] == "anxious_monitoring"
    assert after["fusionRisk"] == "medium"
    assert after["sourceOrigin"] == "web-shell"
    assert after["sourceDataset"] == "live_web"
    assert after["sourceRecord"] == "session/sess_emotion_001"
    assert after["affectRequestCount"] >= 1


def test_web_emotion_panel_can_render_enterprise_sample_placeholders():
    payload = run_harness("enterprise-sample")
    after = payload["afterAffect"]

    assert after["sourceOrigin"] == "enterprise_validation_manifest"
    assert after["sourceDataset"] == "noxi"
    assert after["sourceRecord"] == "noxi/001_2016-03-17_Paris/speaker_a/1"
    assert "enterprise sample" in after["sourceNote"]


def test_web_emotion_panel_can_render_distinct_audio_lane_labels():
    high_payload = run_harness("audio-high-energy")
    low_payload = run_harness("audio-low-energy")

    high_after = high_payload["afterAffect"]
    low_after = low_payload["afterAffect"]

    assert high_after["audioSignal"] == "steady_high_energy_proxy"
    assert low_after["audioSignal"] == "slow_low_energy_proxy"
    assert high_after["audioSignal"] != low_after["audioSignal"]


def test_web_emotion_panel_docs_are_present():
    web_readme = WEB_README.read_text(encoding="utf-8")
    affect_readme = AFFECT_README.read_text(encoding="utf-8")
    root_readme = README.read_text(encoding="utf-8")

    assert "scripts/verify_web_emotion_panel.py" in web_readme
    assert "POST /internal/affect/analyze" in affect_readme
    assert "scripts/verify_web_emotion_panel.py" in root_readme
