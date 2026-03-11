from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import math
import os
from pathlib import Path
import struct
from typing import Literal
from urllib.parse import quote
from uuid import uuid4
import wave

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TTS_STORAGE_ROOT = "data/derived/tts_audio"
EDGE_TTS_VOICE_ALIASES = {
    "companion_female_01": "zh-CN-XiaoxiaoNeural",
    "coach_male_01": "zh-CN-YunxiNeural",
}


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

        values[key.strip()] = value.strip().strip("'").strip('"')
    return values


def bootstrap_runtime_env() -> None:
    merged = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env")}
    for key, value in merged.items():
        current = os.environ.get(key)
        if current is None or not current.strip():
            os.environ[key] = value


@dataclass
class TTSServiceSettings:
    tts_service_host: str
    tts_service_port: int
    tts_service_base_url: str
    tts_provider: str
    tts_base_url: str
    tts_api_key: str
    tts_model: str
    tts_voice_a: str
    tts_voice_b: str
    tts_audio_format: str
    tts_storage_root: str
    tts_cors_origins: tuple[str, ...]
    tts_edge_timeout_seconds: float
    tts_enable_wave_fallback: bool

    @classmethod
    def from_env(cls) -> "TTSServiceSettings":
        host = os.getenv("TTS_SERVICE_HOST", "0.0.0.0")
        port = int(os.getenv("TTS_SERVICE_PORT", "8040"))
        base_url = os.getenv("TTS_SERVICE_BASE_URL")
        if not base_url:
            public_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
            base_url = f"http://{public_host}:{port}"

        return cls(
            tts_service_host=host,
            tts_service_port=port,
            tts_service_base_url=base_url.rstrip("/"),
            tts_provider=os.getenv("TTS_PROVIDER", "edge_tts"),
            tts_base_url=os.getenv("TTS_BASE_URL", ""),
            tts_api_key=os.getenv("TTS_API_KEY", ""),
            tts_model=os.getenv("TTS_MODEL", ""),
            tts_voice_a=os.getenv("TTS_VOICE_A", "companion_female_01"),
            tts_voice_b=os.getenv("TTS_VOICE_B", "coach_male_01"),
            tts_audio_format=os.getenv("TTS_AUDIO_FORMAT", "mp3"),
            tts_storage_root=os.getenv("TTS_STORAGE_ROOT", DEFAULT_TTS_STORAGE_ROOT),
            tts_cors_origins=tuple(
                value.strip()
                for value in os.getenv(
                    "TTS_CORS_ORIGINS",
                    "http://127.0.0.1:4173,http://localhost:4173",
                ).split(",")
                if value.strip()
            ),
            tts_edge_timeout_seconds=float(os.getenv("TTS_EDGE_TIMEOUT_SECONDS", "18")),
            tts_enable_wave_fallback=os.getenv("TTS_ENABLE_WAVE_FALLBACK", "true").strip().lower()
            not in {"0", "false", "no", "off"},
        )


class TTSSynthesizeRequest(BaseModel):
    text: str
    voice_id: str | None = None
    session_id: str | None = None
    trace_id: str | None = None
    message_id: str | None = None
    subtitle: str | None = None

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("text must not be empty")
        return normalized


class TTSSynthesizeResponse(BaseModel):
    tts_id: str
    session_id: str | None = None
    trace_id: str | None = None
    message_id: str | None = None
    voice_id: str
    subtitle: str
    audio_format: Literal["mp3", "wav"]
    audio_url: str
    duration_ms: int = Field(ge=0)
    byte_size: int = Field(ge=0)
    provider_used: Literal["edge_tts", "wave_fallback"]
    fallback_used: bool = False
    fallback_reason: str | None = None
    generated_at: datetime


def resolve_voice_id(settings: TTSServiceSettings, requested_voice_id: str | None) -> str:
    raw_voice = (requested_voice_id or settings.tts_voice_a).strip()
    if not raw_voice:
        raw_voice = settings.tts_voice_a
    return EDGE_TTS_VOICE_ALIASES.get(raw_voice, raw_voice)


def estimate_duration_ms(text: str) -> int:
    character_count = len(text.strip())
    return max(1200, character_count * 220)


async def synthesize_edge_tts(
    *,
    text: str,
    voice_id: str,
    output_path: Path,
) -> int:
    import edge_tts

    output_path.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text=text, voice=voice_id)

    last_boundary_ms = 0
    with output_path.open("wb") as audio_file:
        async for chunk in communicate.stream():
            chunk_type = chunk.get("type")
            if chunk_type == "audio":
                audio_file.write(chunk["data"])
            elif chunk_type == "WordBoundary":
                offset = int(chunk.get("offset", 0) or 0)
                duration = int(chunk.get("duration", 0) or 0)
                last_boundary_ms = max(last_boundary_ms, int((offset + duration) / 10_000))

    if output_path.stat().st_size <= 0:
        raise RuntimeError("edge_tts returned empty audio")
    return last_boundary_ms or estimate_duration_ms(text)


def synthesize_wave_fallback(
    *,
    text: str,
    output_path: Path,
) -> int:
    sample_rate_hz = 16_000
    duration_ms = estimate_duration_ms(text)
    total_frames = max(sample_rate_hz // 2, int(sample_rate_hz * duration_ms / 1000))
    attack_frames = max(1, sample_rate_hz // 40)
    release_frames = max(1, sample_rate_hz // 25)
    punctuation_marks = {"，", "。", "！", "？", ",", ".", "!", "?"}
    tone_bases = (220.0, 277.18, 329.63, 392.0)
    punctuation_boost = 1.2 + sum(1 for char in text if char in punctuation_marks) * 0.08
    amplitude = 9_000

    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame_bytes = bytearray()
    for frame_index in range(total_frames):
        progress = frame_index / max(total_frames - 1, 1)
        base_index = min(int(progress * len(tone_bases)), len(tone_bases) - 1)
        frequency = tone_bases[base_index] * punctuation_boost
        time_offset = frame_index / sample_rate_hz
        envelope = 1.0
        if frame_index < attack_frames:
            envelope = frame_index / attack_frames
        elif frame_index > total_frames - release_frames:
            envelope = max(0.0, (total_frames - frame_index) / release_frames)
        modulation = 0.55 + 0.45 * math.sin(2 * math.pi * 2.7 * time_offset)
        sample_value = int(
            amplitude
            * envelope
            * modulation
            * math.sin(2 * math.pi * frequency * time_offset)
        )
        frame_bytes.extend(struct.pack("<h", sample_value))

    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate_hz)
        wav_file.writeframes(frame_bytes)

    return duration_ms


async def synthesize_tts_asset(
    settings: TTSServiceSettings,
    request: TTSSynthesizeRequest,
) -> TTSSynthesizeResponse:
    provider = settings.tts_provider.strip().lower()
    voice_id = resolve_voice_id(settings, request.voice_id)
    tts_id = f"tts_{uuid4().hex[:24]}"
    generated_at = datetime.now(timezone.utc)
    fallback_reason: str | None = None
    provider_used: Literal["edge_tts", "wave_fallback"]

    if provider == "wave_fallback":
        audio_format: Literal["mp3", "wav"] = "wav"
        output_path = (ROOT / settings.tts_storage_root / f"{tts_id}.{audio_format}").resolve()
        duration_ms = synthesize_wave_fallback(text=request.text, output_path=output_path)
        provider_used = "wave_fallback"
        fallback_used = True
        fallback_reason = "provider_forced_wave_fallback"
    elif provider == "edge_tts":
        audio_format = "mp3"
        output_path = (ROOT / settings.tts_storage_root / f"{tts_id}.{audio_format}").resolve()
        try:
            duration_ms = await asyncio.wait_for(
                synthesize_edge_tts(
                    text=request.text,
                    voice_id=voice_id,
                    output_path=output_path,
                ),
                timeout=settings.tts_edge_timeout_seconds,
            )
            provider_used = "edge_tts"
            fallback_used = False
        except Exception as exc:
            if not settings.tts_enable_wave_fallback:
                raise RuntimeError(f"edge_tts failed: {exc}") from exc
            if output_path.exists():
                output_path.unlink(missing_ok=True)
            audio_format = "wav"
            output_path = (ROOT / settings.tts_storage_root / f"{tts_id}.{audio_format}").resolve()
            duration_ms = synthesize_wave_fallback(text=request.text, output_path=output_path)
            provider_used = "wave_fallback"
            fallback_used = True
            fallback_reason = exc.__class__.__name__
    else:
        raise RuntimeError(f"unsupported TTS_PROVIDER: {settings.tts_provider}")

    audio_url = f"{settings.tts_service_base_url}/media/tts/{quote(output_path.name)}"
    return TTSSynthesizeResponse(
        tts_id=tts_id,
        session_id=request.session_id,
        trace_id=request.trace_id,
        message_id=request.message_id,
        voice_id=voice_id,
        subtitle=request.subtitle or request.text,
        audio_format=audio_format,
        audio_url=audio_url,
        duration_ms=duration_ms,
        byte_size=output_path.stat().st_size,
        provider_used=provider_used,
        fallback_used=fallback_used,
        fallback_reason=fallback_reason,
        generated_at=generated_at,
    )


def resolve_audio_file_path(settings: TTSServiceSettings, filename: str) -> Path:
    base = (ROOT / settings.tts_storage_root).resolve()
    candidate = (base / filename).resolve()
    try:
        candidate.relative_to(base)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="audio file not found") from exc
    return candidate


def create_app() -> FastAPI:
    bootstrap_runtime_env()
    settings = TTSServiceSettings.from_env()

    app = FastAPI(title="virtual-huamn-tts-service", version="0.1.0")
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.tts_cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/internal/tts/synthesize", response_model=TTSSynthesizeResponse)
    async def synthesize(payload: TTSSynthesizeRequest) -> TTSSynthesizeResponse:
        try:
            return await synthesize_tts_asset(settings, payload)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @app.get("/media/tts/{filename}")
    def get_tts_audio(filename: str) -> FileResponse:
        path = resolve_audio_file_path(settings, filename)
        if not path.exists():
            raise HTTPException(status_code=404, detail="audio file not found")
        media_type = "audio/mpeg" if path.suffix.lower() == ".mp3" else "audio/wav"
        return FileResponse(path, media_type=media_type, filename=path.name)

    return app


app = create_app()
