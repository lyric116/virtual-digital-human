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
    assert '<script src="./config.js"></script>' in content
    assert '<script src="./app.js"></script>' in content
    assert 'id="session-start-button"' in content
    assert 'class="capture-action-stack"' in content
    assert 'class="capture-control-grid"' in content
    assert 'class="button-row capture-submit-row"' in content
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
    assert 'id="emotion-panel-status"' in content
    assert 'id="text-signal-value"' in content
    assert 'id="text-signal-confidence"' in content
    assert 'id="text-signal-detail"' in content
    assert 'id="audio-signal-value"' in content
    assert 'id="audio-signal-confidence"' in content
    assert 'id="audio-signal-detail"' in content
    assert 'id="video-signal-value"' in content
    assert 'id="video-signal-confidence"' in content
    assert 'id="video-signal-detail"' in content
    assert 'id="fusion-emotion-value"' in content
    assert 'id="fusion-risk-value"' in content
    assert 'id="fusion-confidence-value"' in content
    assert 'id="fusion-conflict-value"' in content
    assert 'id="fusion-detail-value"' in content
    assert 'id="emotion-source-origin-value"' in content
    assert 'id="emotion-source-dataset-value"' in content
    assert 'id="emotion-source-record-value"' in content
    assert 'id="emotion-source-note-value"' in content
    assert 'id="chat-timeline-list"' in content
    assert 'id="timeline-assistant-text"' not in content
    assert 'id="timeline-stage-text"' not in content
    assert 'id="session-id-value"' in content
    assert 'id="session-status-value"' in content
    assert 'class="session-runtime-meta" aria-hidden="true"' in content
    assert 'id="last-user-trace-value"' in content
    assert 'id="last-reply-trace-value"' in content
    assert 'id="connection-status-value"' in content
    assert 'id="connection-log"' in content
    assert 'id="session-export-button"' in content
    assert 'id="session-export-status"' in content
    css_content = CSS_FILE.read_text(encoding="utf-8")
    assert ".panel {\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n  min-width: 0;\n" in css_content
    assert ".avatar-action-row {\n  grid-column: span 1;\n  align-self: end;\n}" in css_content
    assert ".avatar-action-row button {\n  height: 48px;\n  min-width: 128px;\n  padding: 0 22px;\n  line-height: 1;\n  white-space: nowrap;\n  background: var(--accent);\n}" in css_content
    assert ".emotion-panel {\n  grid-column: span 2;\n}" in css_content
    assert ".timeline {\n  max-height: 520px;\n  overflow-y: auto;\n}" in css_content
    assert ".session-runtime-meta {\n  display: none;\n}" in css_content
    assert "overflow-wrap: anywhere;" in css_content
    assert "Emotion Care Console" in content
    assert "Capture Panel" in content
    assert "Session Control" in content
