from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import base64
import json
import os
from pathlib import Path
import tempfile
from typing import Any, Protocol
from uuid import uuid4
import wave

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ASR_SERVICE_HOST = "0.0.0.0"
DEFAULT_ASR_SERVICE_PORT = 8020
WAVE_MIME_TYPES = {"audio/wav", "audio/x-wav", "audio/wave"}


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    alias_map = {
        "key": "OPENAI_API_KEY",
        "api_key": "OPENAI_API_KEY",
        "openai_api_key": "OPENAI_API_KEY",
        "baseurl": "OPENAI_BASE_URL",
        "base_url": "OPENAI_BASE_URL",
        "openai_base_url": "OPENAI_BASE_URL",
        "model": "OPENAI_MODEL",
        "openai_model": "OPENAI_MODEL",
    }

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

        key = alias_map.get(key.strip().lower(), key.strip())
        values[key] = value.strip().strip("'").strip('"')
    return values


def bootstrap_runtime_env() -> None:
    merged = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env")}
    for key, value in merged.items():
        os.environ.setdefault(key, value)


def normalize_base_url_for_model(model: str, base_url: str | None) -> str | None:
    if not model.startswith("qwen3-asr-flash"):
        return base_url

    compatible_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    if not base_url:
        return compatible_url
    if "/api/v1/services/audio/asr/transcription" in base_url:
        return compatible_url
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

    @classmethod
    def from_env(cls) -> "ASRSettings":
        provider = os.getenv("ASR_PROVIDER", "dashscope")
        model = os.getenv("ASR_MODEL") or os.getenv("OPENAI_MODEL") or "qwen3-asr-flash"
        base_url = (
            os.getenv("ASR_BASE_URL")
            or os.getenv("OPENAI_BASE_URL")
            or os.getenv("DASHSCOPE_BASE_URL")
        )
        api_key = (
            os.getenv("ASR_API_KEY")
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("DASHSCOPE_API_KEY")
        )
        return cls(
            service_host=os.getenv("ASR_SERVICE_HOST", DEFAULT_ASR_SERVICE_HOST),
            service_port=int(os.getenv("ASR_SERVICE_PORT", str(DEFAULT_ASR_SERVICE_PORT))),
            provider=provider,
            base_url=normalize_base_url_for_model(model, base_url),
            api_key=api_key,
            model=model,
            language_hint=os.getenv("ASR_LANGUAGE_HINT", "auto"),
            timeout_seconds=float(os.getenv("ASR_TIMEOUT_SECONDS", "60")),
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

    def transcribe_file(
        self,
        audio_path: Path,
        *,
        record_id: str | None,
        audio_metadata: AudioMetadata,
    ) -> ASREngineResult:
        from openai import OpenAI

        client = OpenAI(
            api_key=self.settings.api_key,
            base_url=self.settings.base_url,
            timeout=self.settings.timeout_seconds,
        )

        if self.settings.model.startswith("qwen3-asr-flash"):
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


def inspect_audio_file(path: Path, filename: str, content_type: str) -> AudioMetadata:
    byte_size = path.stat().st_size
    if content_type not in WAVE_MIME_TYPES and path.suffix.lower() != ".wav":
        return AudioMetadata(
            filename=filename,
            content_type=content_type,
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
        content_type=content_type,
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


def create_transcription_record(
    engine: ASREngine,
    settings: ASRSettings,
    *,
    body: bytes,
    filename: str,
    content_type: str,
    record_id: str | None = None,
) -> dict[str, Any] | JSONResponse:
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
        audio_metadata = inspect_audio_file(temp_audio_path, filename=filename, content_type=content_type)

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
        transcript_text=engine_result.transcript_text.strip(),
        transcript_language=engine_result.transcript_language,
        duration_ms=audio_metadata.duration_ms,
        confidence_mean=engine_result.confidence_mean,
        confidence_available=engine_result.confidence_available,
        transcript_segments=engine_result.transcript_segments,
        audio=audio_metadata,
        generated_at=datetime.now(timezone.utc),
    )
    return response.model_dump(mode="json")


def create_app(engine: ASREngine | None = None) -> FastAPI:
    bootstrap_runtime_env()
    settings = ASRSettings.from_env()
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
            content_type=request.headers.get("content-type", "application/octet-stream"),
            record_id=record_id,
        )

    return app


app = create_app()
