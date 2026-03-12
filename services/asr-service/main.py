from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from array import array
import base64
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Protocol
import urllib.error
import urllib.request
from uuid import uuid4
import wave

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ASR_SERVICE_HOST = "0.0.0.0"
DEFAULT_ASR_SERVICE_PORT = 8020
WAVE_MIME_TYPES = {"audio/wav", "audio/x-wav", "audio/wave"}
DEFAULT_HOTWORD_MAP_PATH = ROOT / "services" / "asr-service" / "hotwords.json"
DEFAULT_DASHSCOPE_QWEN3_NATIVE_URL = (
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
)
DEFAULT_DASHSCOPE_COMPATIBLE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
CJK_PUNCTUATION = "，。！？；："
LATIN_TERMINAL_PUNCTUATION = ".!?"


def normalize_mime_type(value: str | None) -> str:
    if not value:
        return "application/octet-stream"
    normalized = value.split(";", 1)[0].strip().lower()
    return normalized or "application/octet-stream"


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()

        if "=" in line:
            key, value = line.split("=", 1)
        elif ":" in line:
            key, value = line.split(":", 1)
        else:
            continue

        key = key.strip()
        values[key] = value.strip().strip("'").strip('"')
    return values


def bootstrap_runtime_env() -> None:
    merged = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env")}
    for key, value in merged.items():
        current = os.environ.get(key)
        if current is None or not current.strip():
            os.environ[key] = value


def parse_bool_env(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def normalize_base_url_for_model(model: str, base_url: str | None) -> str | None:
    if not model.startswith("qwen3-asr-flash"):
        return base_url

    if not base_url:
        return DEFAULT_DASHSCOPE_QWEN3_NATIVE_URL
    if "/api/v1/services/audio/asr/transcription" in base_url:
        return DEFAULT_DASHSCOPE_QWEN3_NATIVE_URL
    return base_url


def resolve_dashscope_native_generation_url(base_url: str | None) -> str:
    if not base_url:
        return DEFAULT_DASHSCOPE_QWEN3_NATIVE_URL
    if "compatible-mode" in base_url:
        return DEFAULT_DASHSCOPE_QWEN3_NATIVE_URL
    if "/api/v1/services/audio/asr/transcription" in base_url:
        return DEFAULT_DASHSCOPE_QWEN3_NATIVE_URL
    return base_url


def to_data_uri(path: Path) -> str:
    suffix = path.suffix.lower()
    mime_map = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".aac": "audio/aac",
        ".opus": "audio/ogg",
        ".webm": "audio/webm",
    }
    mime = mime_map.get(suffix, "application/octet-stream")
    payload = base64.b64encode(path.read_bytes()).decode()
    return f"data:{mime};base64,{payload}"


def extract_completion_text(completion: object) -> str:
    choices = getattr(completion, "choices", None)
    if not choices:
        if isinstance(completion, dict):
            choices = completion.get("choices")
        else:
            return ""

    if not choices:
        return ""

    message = getattr(choices[0], "message", None)
    if message is None and isinstance(choices[0], dict):
        message = choices[0].get("message")

    content = getattr(message, "content", None)
    if content is None and isinstance(message, dict):
        content = message.get("content")

    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if text:
                    parts.append(text)
        return "".join(parts).strip()
    return ""


def extract_dashscope_message(payload: dict[str, Any]) -> tuple[str, str | None]:
    output = payload.get("output")
    if not isinstance(output, dict):
        return "", None
    choices = output.get("choices")
    if not isinstance(choices, list) or not choices:
        return "", None
    message = choices[0].get("message")
    if not isinstance(message, dict):
        return "", None

    detected_language: str | None = None
    annotations = message.get("annotations")
    if isinstance(annotations, list):
        for annotation in annotations:
            if not isinstance(annotation, dict):
                continue
            language = annotation.get("language")
            if isinstance(language, str) and language.strip():
                detected_language = language.strip()
                break

    content = message.get("content")
    if isinstance(content, str):
        return content.strip(), detected_language
    if isinstance(content, list):
        text_parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                text_parts.append(item)
                continue
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())
        return "".join(text_parts).strip(), detected_language
    return "", detected_language


@dataclass
class ASRSettings:
    service_host: str
    service_port: int
    provider: str
    base_url: str | None
    api_key: str | None
    model: str
    language_hint: str | None
    timeout_seconds: float
    postprocess_enabled: bool
    silence_window_ms: int
    silence_min_duration_ms: int
    silence_threshold_ratio: float
    hotword_map_path: str

    @classmethod
    def from_env(cls) -> "ASRSettings":
        provider = os.getenv("ASR_PROVIDER", "dashscope")
        model = os.getenv("ASR_MODEL", "qwen3-asr-flash")
        base_url = os.getenv("ASR_BASE_URL")
        api_key = os.getenv("ASR_API_KEY")
        return cls(
            service_host=os.getenv("ASR_SERVICE_HOST", DEFAULT_ASR_SERVICE_HOST),
            service_port=int(os.getenv("ASR_SERVICE_PORT", str(DEFAULT_ASR_SERVICE_PORT))),
            provider=provider,
            base_url=normalize_base_url_for_model(model, base_url),
            api_key=api_key,
            model=model,
            language_hint=os.getenv("ASR_LANGUAGE_HINT", "auto"),
            timeout_seconds=float(os.getenv("ASR_TIMEOUT_SECONDS", "60")),
            postprocess_enabled=parse_bool_env(os.getenv("ASR_POSTPROCESS_ENABLED"), True),
            silence_window_ms=int(os.getenv("ASR_SILENCE_WINDOW_MS", "200")),
            silence_min_duration_ms=int(os.getenv("ASR_SILENCE_MIN_DURATION_MS", "350")),
            silence_threshold_ratio=float(os.getenv("ASR_SILENCE_THRESHOLD_RATIO", "0.015")),
            hotword_map_path=os.getenv("ASR_HOTWORD_MAP_PATH", str(DEFAULT_HOTWORD_MAP_PATH)),
        )


class AudioMetadata(BaseModel):
    filename: str
    content_type: str
    byte_size: int = Field(ge=0)
    sample_rate_hz: int | None = Field(default=None, ge=1)
    channels: int | None = Field(default=None, ge=1)
    sample_width_bytes: int | None = Field(default=None, ge=1)
    frame_count: int | None = Field(default=None, ge=0)
    duration_ms: int | None = Field(default=None, ge=0)


class ASRTranscriptionResponse(BaseModel):
    request_id: str
    record_id: str | None = None
    provider: str
    model: str
    transcript_text: str
    transcript_language: str | None = None
    duration_ms: int | None = Field(default=None, ge=0)
    confidence_mean: float | None = None
    confidence_available: bool = False
    transcript_segments: list[dict[str, Any]] = Field(default_factory=list)
    audio: AudioMetadata
    generated_at: datetime


class ASREngineResult(BaseModel):
    transcript_text: str
    transcript_language: str | None = None
    confidence_mean: float | None = None
    confidence_available: bool = False
    transcript_segments: list[dict[str, Any]] = Field(default_factory=list)


@dataclass
class TranscriptPostprocessResult:
    transcript_text: str
    transcript_segments: list[dict[str, Any]]
    silence_spans: list[dict[str, int]]


class ASREngine(Protocol):
    def transcribe_file(
        self,
        audio_path: Path,
        *,
        record_id: str | None,
        audio_metadata: AudioMetadata,
    ) -> ASREngineResult:
        ...


class OpenAICompatibleASREngine:
    def __init__(self, settings: ASRSettings):
        self.settings = settings

    def transcribe_dashscope_native(
        self,
        audio_path: Path,
        *,
        record_id: str | None,
    ) -> ASREngineResult:
        request_payload = {
            "model": self.settings.model,
            "input": {
                "messages": [
                    {"role": "system", "content": [{"text": ""}]},
                    {"role": "user", "content": [{"audio": to_data_uri(audio_path)}]},
                ]
            },
            "parameters": {
                "asr_options": {
                    "enable_itn": False,
                }
            },
        }
        request = urllib.request.Request(
            resolve_dashscope_native_generation_url(self.settings.base_url),
            data=json.dumps(request_payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.settings.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=self.settings.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
        transcript_text, transcript_language = extract_dashscope_message(payload)
        return ASREngineResult(
            transcript_text=transcript_text,
            transcript_language=transcript_language
            or (
                self.settings.language_hint
                if self.settings.language_hint and self.settings.language_hint != "auto"
                else None
            ),
            confidence_mean=None,
            confidence_available=False,
            transcript_segments=[],
        )

    def transcribe_qwen3_compatible(
        self,
        audio_path: Path,
    ) -> ASREngineResult:
        from openai import OpenAI

        client = OpenAI(
            api_key=self.settings.api_key,
            base_url=DEFAULT_DASHSCOPE_COMPATIBLE_URL,
            timeout=self.settings.timeout_seconds,
            max_retries=1,
        )
        completion = client.chat.completions.create(
            model=self.settings.model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_audio",
                            "input_audio": {
                                "data": to_data_uri(audio_path),
                            },
                        }
                    ],
                }
            ],
            stream=False,
            extra_body={
                "asr_options": {
                    "enable_itn": False,
                }
            },
        )
        text = extract_completion_text(completion)
        return ASREngineResult(
            transcript_text=text,
            transcript_language=self.settings.language_hint
            if self.settings.language_hint and self.settings.language_hint != "auto"
            else None,
            confidence_mean=None,
            confidence_available=False,
            transcript_segments=[],
        )

    def transcribe_file(
        self,
        audio_path: Path,
        *,
        record_id: str | None,
        audio_metadata: AudioMetadata,
    ) -> ASREngineResult:
        if self.settings.model.startswith("qwen3-asr-flash"):
            native_errors: list[str] = []
            try:
                return self.transcribe_dashscope_native(audio_path, record_id=record_id)
            except Exception as exc:
                native_errors.append(f"{type(exc).__name__}: {exc}")

            try:
                return self.transcribe_qwen3_compatible(audio_path)
            except Exception as exc:
                native_errors.append(f"{type(exc).__name__}: {exc}")

            raise RuntimeError(" ; ".join(native_errors))

        from openai import OpenAI

        client = OpenAI(
            api_key=self.settings.api_key,
            base_url=self.settings.base_url,
            timeout=self.settings.timeout_seconds,
        )

        with audio_path.open("rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model=self.settings.model,
                file=audio_file,
                response_format="json",
                language=None
                if not self.settings.language_hint or self.settings.language_hint == "auto"
                else self.settings.language_hint,
            )

        text = getattr(transcription, "text", None)
        if text is None and isinstance(transcription, dict):
            text = transcription.get("text")

        return ASREngineResult(
            transcript_text=(text or "").strip(),
            transcript_language=self.settings.language_hint
            if self.settings.language_hint and self.settings.language_hint != "auto"
            else None,
            confidence_mean=None,
            confidence_available=False,
            transcript_segments=[],
        )


def is_cjk_dominant(text: str) -> bool:
    cjk_count = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
    latin_count = sum(1 for char in text if char.isascii() and char.isalpha())
    return cjk_count > latin_count


def normalize_transcript_spacing(text: str) -> str:
    collapsed = re.sub(r"\s+", " ", text).strip()
    collapsed = re.sub(r"\s+([,.;:!?])", r"\1", collapsed)
    collapsed = re.sub(r"([,.;:!?])(?!\s|$)", r"\1 ", collapsed)
    collapsed = re.sub(r"\s+", " ", collapsed).strip()
    collapsed = re.sub(r"\s+([，。！？；：])", r"\1", collapsed)
    return collapsed


def load_hotword_map(path: str) -> dict[str, dict[str, str]]:
    hotword_path = Path(path)
    if not hotword_path.exists():
        return {}
    try:
        payload = json.loads(hotword_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}

    normalized: dict[str, dict[str, str]] = {}
    for language_key, raw_mapping in payload.items():
        if not isinstance(raw_mapping, dict):
            continue
        language_mapping: dict[str, str] = {}
        for source, target in raw_mapping.items():
            if not isinstance(source, str) or not isinstance(target, str):
                continue
            if source.strip() and target.strip():
                language_mapping[source.strip()] = target.strip()
        if language_mapping:
            normalized[str(language_key).strip().lower()] = language_mapping
    return normalized


def resolve_hotword_language_keys(language: str | None, text: str) -> list[str]:
    keys = ["default"]
    if language:
        normalized = language.lower()
        keys.append(normalized)
        if "-" in normalized:
            keys.append(normalized.split("-", 1)[0])
    elif is_cjk_dominant(text):
        keys.append("zh")
    return list(dict.fromkeys(keys))


def apply_hotword_replacements(
    text: str,
    *,
    language: str | None,
    hotword_map: dict[str, dict[str, str]],
) -> str:
    updated = text
    for language_key in resolve_hotword_language_keys(language, text):
        mapping = hotword_map.get(language_key, {})
        for source, target in mapping.items():
            if any("\u4e00" <= char <= "\u9fff" for char in source):
                updated = updated.replace(source, target)
                continue
            pattern = re.compile(rf"(?<!\w){re.escape(source)}(?!\w)", re.IGNORECASE)
            updated = pattern.sub(target, updated)
    return updated


def inspect_wave_samples(path: Path, audio_metadata: AudioMetadata) -> tuple[list[float], int] | None:
    if path.suffix.lower() != ".wav" and audio_metadata.content_type not in WAVE_MIME_TYPES:
        return None
    if not audio_metadata.sample_rate_hz or not audio_metadata.channels or not audio_metadata.sample_width_bytes:
        return None
    if audio_metadata.sample_width_bytes not in {1, 2, 4}:
        return None

    typecode_map = {1: "B", 2: "h", 4: "i"}
    with wave.open(str(path), "rb") as handle:
        raw_frames = handle.readframes(handle.getnframes())

    samples = array(typecode_map[audio_metadata.sample_width_bytes])
    samples.frombytes(raw_frames)
    if audio_metadata.sample_width_bytes > 1 and os.sys.byteorder != "little":
        samples.byteswap()

    frame_values: list[float] = []
    channels = audio_metadata.channels
    if audio_metadata.sample_width_bytes == 1:
        centered = [abs(sample - 128) for sample in samples]
        for index in range(0, len(centered), channels):
            chunk = centered[index : index + channels]
            if chunk:
                frame_values.append(sum(chunk) / len(chunk))
        max_amplitude = 127
    else:
        for index in range(0, len(samples), channels):
            chunk = samples[index : index + channels]
            if chunk:
                frame_values.append(sum(abs(sample) for sample in chunk) / len(chunk))
        max_amplitude = float(2 ** (audio_metadata.sample_width_bytes * 8 - 1) - 1)
    return frame_values, int(max_amplitude)


def detect_silence_spans(
    path: Path,
    audio_metadata: AudioMetadata,
    settings: ASRSettings,
) -> list[dict[str, int]]:
    sample_bundle = inspect_wave_samples(path, audio_metadata)
    if sample_bundle is None or not audio_metadata.sample_rate_hz:
        return []

    frame_values, max_amplitude = sample_bundle
    if not frame_values or max_amplitude <= 0:
        return []

    window_frames = max(1, int(audio_metadata.sample_rate_hz * settings.silence_window_ms / 1000))
    silence_threshold = max_amplitude * settings.silence_threshold_ratio
    silence_spans: list[dict[str, int]] = []
    current_start_frame: int | None = None

    for window_start in range(0, len(frame_values), window_frames):
        window = frame_values[window_start : window_start + window_frames]
        if not window:
            continue
        average_amplitude = sum(window) / len(window)
        is_silent = average_amplitude <= silence_threshold
        if is_silent and current_start_frame is None:
            current_start_frame = window_start
        elif not is_silent and current_start_frame is not None:
            start_ms = int(round(current_start_frame / audio_metadata.sample_rate_hz * 1000))
            end_ms = int(round(window_start / audio_metadata.sample_rate_hz * 1000))
            duration_ms = end_ms - start_ms
            if duration_ms >= settings.silence_min_duration_ms:
                silence_spans.append(
                    {"start_ms": start_ms, "end_ms": end_ms, "duration_ms": duration_ms}
                )
            current_start_frame = None

    if current_start_frame is not None:
        start_ms = int(round(current_start_frame / audio_metadata.sample_rate_hz * 1000))
        end_ms = int(round(len(frame_values) / audio_metadata.sample_rate_hz * 1000))
        duration_ms = end_ms - start_ms
        if duration_ms >= settings.silence_min_duration_ms:
            silence_spans.append({"start_ms": start_ms, "end_ms": end_ms, "duration_ms": duration_ms})

    return silence_spans


def choose_segment_count(text: str, silence_spans: list[dict[str, int]]) -> int:
    words = [item for item in text.split(" ") if item]
    if not words:
        return 1
    if len(words) < 10:
        return 1
    return max(1, min(len(silence_spans) + 1, 4))


def split_text_into_segments(text: str, segment_count: int) -> list[str]:
    words = [item for item in text.split(" ") if item]
    if segment_count <= 1 or len(words) < segment_count:
        return [text]

    segments: list[str] = []
    start = 0
    total_words = len(words)
    for index in range(segment_count):
        remaining_segments = segment_count - index
        remaining_words = total_words - start
        segment_size = max(1, round(remaining_words / remaining_segments))
        end = total_words if index == segment_count - 1 else min(total_words, start + segment_size)
        segment_words = words[start:end]
        if segment_words:
            segments.append(" ".join(segment_words))
        start = end
    return segments or [text]


def append_terminal_punctuation(text: str, *, cjk: bool) -> str:
    normalized = text.strip()
    if not normalized:
        return normalized
    terminal_chars = CJK_PUNCTUATION if cjk else LATIN_TERMINAL_PUNCTUATION
    if normalized[-1] in terminal_chars:
        return normalized
    return f"{normalized}{'。' if cjk else '.'}"


def restore_punctuation(
    text: str,
    *,
    silence_spans: list[dict[str, int]],
    language: str | None,
) -> tuple[str, list[dict[str, Any]]]:
    normalized = normalize_transcript_spacing(text)
    if not normalized:
        return "", []

    if re.search(r"[,.!?;:，。！？；：]", normalized):
        cjk = is_cjk_dominant(normalized) if language in {None, "auto"} else language.lower().startswith("zh")
        punctuated = append_terminal_punctuation(normalized, cjk=cjk)
        return punctuated, [{"segment_index": 1, "text": punctuated}]

    cjk = is_cjk_dominant(normalized) if language in {None, "auto"} else language.lower().startswith("zh")
    segment_count = choose_segment_count(normalized, silence_spans)
    segment_texts = split_text_into_segments(normalized, segment_count)
    rendered_segments: list[dict[str, Any]] = []
    punctuated_parts: list[str] = []
    for index, segment_text in enumerate(segment_texts):
        boundary_punctuation = "。"
        if not cjk:
            boundary_punctuation = "."
        if index < len(segment_texts) - 1:
            pause_duration_ms = silence_spans[index]["duration_ms"] if index < len(silence_spans) else 0
            boundary_punctuation = "，" if cjk else ","
            if pause_duration_ms >= 900:
                boundary_punctuation = "。" if cjk else "."
        rendered_text = f"{segment_text.strip()}{boundary_punctuation}".strip()
        punctuated_parts.append(rendered_text)
        rendered_segments.append(
            {
                "segment_index": index + 1,
                "text": rendered_text,
                "pause_after_ms": silence_spans[index]["duration_ms"] if index < len(silence_spans) else None,
            }
        )
    punctuated = " ".join(punctuated_parts) if not cjk else "".join(punctuated_parts)
    punctuated = normalize_transcript_spacing(punctuated)
    punctuated = append_terminal_punctuation(punctuated, cjk=cjk)
    return punctuated, rendered_segments


def postprocess_transcript(
    settings: ASRSettings,
    *,
    text: str,
    transcript_language: str | None,
    audio_path: Path,
    audio_metadata: AudioMetadata,
) -> TranscriptPostprocessResult:
    normalized = normalize_transcript_spacing(text)
    if not settings.postprocess_enabled:
        return TranscriptPostprocessResult(
            transcript_text=normalized,
            transcript_segments=[],
            silence_spans=[],
        )

    hotword_map = load_hotword_map(settings.hotword_map_path)
    hotword_normalized = apply_hotword_replacements(
        normalized,
        language=transcript_language,
        hotword_map=hotword_map,
    )
    silence_spans = detect_silence_spans(audio_path, audio_metadata, settings)
    punctuated_text, transcript_segments = restore_punctuation(
        hotword_normalized,
        silence_spans=silence_spans,
        language=transcript_language,
    )
    return TranscriptPostprocessResult(
        transcript_text=punctuated_text,
        transcript_segments=transcript_segments,
        silence_spans=silence_spans,
    )


def inspect_audio_file(path: Path, filename: str, content_type: str) -> AudioMetadata:
    normalized_content_type = normalize_mime_type(content_type)
    byte_size = path.stat().st_size
    if normalized_content_type not in WAVE_MIME_TYPES and path.suffix.lower() != ".wav":
        return AudioMetadata(
            filename=filename,
            content_type=normalized_content_type,
            byte_size=byte_size,
        )

    with wave.open(str(path), "rb") as handle:
        sample_rate_hz = handle.getframerate()
        channels = handle.getnchannels()
        sample_width_bytes = handle.getsampwidth()
        frame_count = handle.getnframes()

    duration_ms = int(round(frame_count / sample_rate_hz * 1000)) if sample_rate_hz else None
    return AudioMetadata(
        filename=filename,
        content_type=normalized_content_type,
        byte_size=byte_size,
        sample_rate_hz=sample_rate_hz,
        channels=channels,
        sample_width_bytes=sample_width_bytes,
        frame_count=frame_count,
        duration_ms=duration_ms,
    )


def error_payload(
    *,
    error_code: str,
    message: str,
    record_id: str | None = None,
) -> dict[str, Any]:
    return {
        "error_code": error_code,
        "message": message,
        "record_id": record_id,
        "request_id": f"asr_error_{uuid4().hex[:16]}",
        "retryable": False,
    }


def ensure_asr_runtime_configured(settings: ASRSettings) -> None:
    if not settings.api_key or not settings.api_key.strip():
        raise RuntimeError("ASR_API_KEY is not configured")
    if not settings.model or not settings.model.strip():
        raise RuntimeError("ASR_MODEL is not configured")
    if not settings.model.startswith("qwen3-asr-flash") and (
        settings.base_url is None or not settings.base_url.strip()
    ):
        raise RuntimeError("ASR_BASE_URL is not configured")


def create_transcription_record(
    engine: ASREngine,
    settings: ASRSettings,
    *,
    body: bytes,
    filename: str,
    content_type: str,
    record_id: str | None = None,
) -> dict[str, Any] | JSONResponse:
    normalized_content_type = normalize_mime_type(content_type)
    if not body:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=error_payload(
                error_code="audio_body_empty",
                message="audio body must not be empty",
                record_id=record_id,
            ),
        )

    suffix = Path(filename).suffix or ".wav"
    with tempfile.TemporaryDirectory(prefix="vdh_asr_") as temp_dir:
        temp_audio_path = Path(temp_dir) / f"input{suffix}"
        temp_audio_path.write_bytes(body)
        try:
            audio_metadata = inspect_audio_file(
                temp_audio_path,
                filename=filename,
                content_type=normalized_content_type,
            )
        except (wave.Error, EOFError, OSError) as exc:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=error_payload(
                    error_code="audio_file_invalid",
                    message=f"invalid or unreadable audio file: {exc}",
                    record_id=record_id,
                ),
            )

        try:
            engine_result = engine.transcribe_file(
                temp_audio_path,
                record_id=record_id,
                audio_metadata=audio_metadata,
            )
        except Exception as exc:
            return JSONResponse(
                status_code=status.HTTP_502_BAD_GATEWAY,
                content=error_payload(
                    error_code="asr_transcription_failed",
                    message=str(exc),
                    record_id=record_id,
                ),
            )

        postprocessed = postprocess_transcript(
            settings,
            text=engine_result.transcript_text,
            transcript_language=engine_result.transcript_language,
            audio_path=temp_audio_path,
            audio_metadata=audio_metadata,
        )

    if not engine_result.transcript_text.strip():
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=error_payload(
                error_code="asr_empty_transcript",
                message="asr provider returned an empty transcript",
                record_id=record_id,
            ),
        )

    response = ASRTranscriptionResponse(
        request_id=f"asr_req_{uuid4().hex[:24]}",
        record_id=record_id,
        provider=settings.provider,
        model=settings.model,
        transcript_text=postprocessed.transcript_text,
        transcript_language=engine_result.transcript_language,
        duration_ms=audio_metadata.duration_ms,
        confidence_mean=engine_result.confidence_mean,
        confidence_available=engine_result.confidence_available,
        transcript_segments=postprocessed.transcript_segments or engine_result.transcript_segments,
        audio=audio_metadata,
        generated_at=datetime.now(timezone.utc),
    )
    return response.model_dump(mode="json")


def create_app(engine: ASREngine | None = None) -> FastAPI:
    bootstrap_runtime_env()
    settings = ASRSettings.from_env()
    if engine is None:
        ensure_asr_runtime_configured(settings)
    service_engine = engine or OpenAICompatibleASREngine(settings)

    app = FastAPI(title="virtual-huamn-asr-service", version="0.1.0")
    app.state.settings = settings
    app.state.asr_engine = service_engine

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post(
        "/api/asr/transcribe",
        response_model=ASRTranscriptionResponse,
        status_code=status.HTTP_200_OK,
    )
    async def transcribe_audio(
        request: Request,
        filename: str = "input.wav",
        record_id: str | None = None,
    ) -> Any:
        body = await request.body()
        return create_transcription_record(
            request.app.state.asr_engine,
            request.app.state.settings,
            body=body,
            filename=filename,
            content_type=normalize_mime_type(
                request.headers.get("content-type", "application/octet-stream")
            ),
            record_id=record_id,
        )

    return app


app = create_app()
