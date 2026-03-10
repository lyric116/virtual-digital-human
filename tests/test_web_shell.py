from html.parser import HTMLParser
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "apps" / "web"
HTML_FILE = WEB_DIR / "index.html"
CSS_FILE = WEB_DIR / "styles.css"
JS_FILE = WEB_DIR / "app.js"
FAVICON_FILE = WEB_DIR / "favicon.svg"
WEB_README = WEB_DIR / "README.md"


class PanelParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.panel_ids: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        panel_id = attr_map.get("data-panel")
        if panel_id:
            self.panel_ids.append(panel_id)


def test_web_shell_assets_exist():
    for path in [HTML_FILE, CSS_FILE, JS_FILE, FAVICON_FILE, WEB_README]:
        assert path.exists(), f"missing web asset: {path}"


def test_web_shell_contains_all_six_panels():
    parser = PanelParser()
    parser.feed(HTML_FILE.read_text(encoding="utf-8"))

    assert parser.panel_ids == [
        "capture",
        "avatar",
        "transcript",
        "emotion",
        "chat",
        "control",
    ]


def test_web_shell_js_is_valid_and_page_markup_is_ready():
    subprocess.run(["node", "--check", str(JS_FILE)], check=True, cwd=ROOT)
    content = HTML_FILE.read_text(encoding="utf-8")

    assert '<link rel="stylesheet" href="./styles.css"' in content
    assert '<link rel="icon" href="./favicon.svg" type="image/svg+xml"' in content
    assert '<script src="./app.js"></script>' in content
    assert 'id="session-start-button"' in content
    assert 'id="camera-request-button"' in content
    assert 'id="camera-start-button"' in content
    assert 'id="camera-stop-button"' in content
    assert 'id="camera-preview-video"' in content
    assert 'id="camera-permission-status"' in content
    assert 'id="camera-preview-state-value"' in content
    assert 'id="camera-preview-detail-value"' in content
    assert 'id="video-upload-state-value"' in content
    assert 'id="video-upload-detail-value"' in content
    assert 'id="text-input-field"' in content
    assert 'id="mic-request-button"' in content
    assert 'id="mic-start-button"' in content
    assert 'id="mic-stop-button"' in content
    assert 'id="mic-permission-status"' in content
    assert 'id="mic-recording-state-value"' in content
    assert 'id="mic-recording-detail-value"' in content
    assert 'id="audio-upload-state-value"' in content
    assert 'id="audio-upload-detail-value"' in content
    assert 'id="text-submit-button"' in content
    assert 'id="transcript-user-final-text"' in content
    assert 'id="transcript-assistant-reply-text"' in content
    assert 'id="avatar-latest-reply-text"' in content
    assert 'id="avatar-option-companion"' in content
    assert 'id="avatar-option-coach"' in content
    assert 'id="avatar-baseline-card"' in content
    assert 'id="avatar-label-value"' in content
    assert 'id="avatar-meta-value"' in content
    assert 'id="avatar-character-state-value"' in content
    assert 'id="avatar-character-detail-value"' in content
    assert 'id="avatar-stage-note-value"' in content
    assert 'id="avatar-mouth-shape"' in content
    assert 'id="avatar-mouth-state-value"' in content
    assert 'id="avatar-mouth-detail-value"' in content
    assert 'id="avatar-speech-state-value"' in content
    assert 'id="avatar-speech-detail-value"' in content
    assert 'id="avatar-voice-value"' in content
    assert 'id="avatar-duration-value"' in content
    assert 'id="avatar-expression-preset-value"' in content
    assert 'id="avatar-expression-detail-value"' in content
    assert 'id="avatar-replay-button"' in content
    assert 'id="avatar-audio-player"' in content
    assert 'id="fusion-risk-value"' in content
    assert 'id="timeline-assistant-text"' in content
    assert 'id="chat-timeline-list"' in content
    assert 'id="session-id-value"' in content
    assert 'id="session-status-value"' in content
    assert 'id="last-user-trace-value"' in content
    assert 'id="last-reply-trace-value"' in content
    assert 'id="connection-status-value"' in content
    assert 'id="connection-log"' in content
    assert 'id="session-export-button"' in content
    assert 'id="session-export-status"' in content
    assert "Emotion Care Console" in content
    assert "Capture Panel" in content
    assert "Session Control" in content
