from pathlib import Path
import json


ROOT = Path(__file__).resolve().parents[1]
DEMO_DIR = ROOT / "data" / "demo"
README = ROOT / "README.md"
DEMO_README = DEMO_DIR / "README.md"


def test_demo_assets_exist():
    for path in [
        DEMO_README,
        DEMO_DIR / "text_session_script.json",
        DEMO_DIR / "audio_sample.md",
        DEMO_DIR / "video_frame_sample.md",
        DEMO_DIR / "session_export_sample.json",
    ]:
        assert path.exists(), f"missing demo asset: {path}"


def test_demo_assets_are_documented():
    root_readme = README.read_text(encoding="utf-8")
    demo_readme = DEMO_README.read_text(encoding="utf-8")

    assert "data/demo/README.md" in root_readme
    assert "text_session_script.json" in demo_readme
    assert "audio_sample.md" in demo_readme
    assert "video_frame_sample.md" in demo_readme
    assert "session_export_sample.json" in demo_readme


def test_demo_json_assets_are_parseable_and_have_expected_keys():
    text_script = json.loads((DEMO_DIR / "text_session_script.json").read_text(encoding="utf-8"))
    session_export = json.loads((DEMO_DIR / "session_export_sample.json").read_text(encoding="utf-8"))

    assert "turns" in text_script
    assert text_script["turns"]
    assert "session_id" in session_export
    assert "messages" in session_export
    assert "events" in session_export
