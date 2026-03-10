from __future__ import annotations

import csv
from dataclasses import dataclass
import os
from pathlib import Path
from statistics import mean
from typing import Literal

from fastapi import FastAPI, HTTPException
import numpy as np
from pydantic import BaseModel, Field, field_validator


ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = (ROOT / "data").resolve()
DEFAULT_AVATAR_DRIVER_HOST = "0.0.0.0"
DEFAULT_AVATAR_DRIVER_PORT = 8050
EMOTION_COLUMNS = (
    "Neutral",
    "Happy",
    "Sad",
    "Surprise",
    "Fear",
    "Disgust",
    "Anger",
    "Contempt",
)


@dataclass
class AvatarDriverSettings:
    host: str
    port: int

    @classmethod
    def from_env(cls) -> "AvatarDriverSettings":
        return cls(
            host=os.getenv("AVATAR_DRIVER_HOST", DEFAULT_AVATAR_DRIVER_HOST),
            port=int(os.getenv("AVATAR_DRIVER_PORT", str(DEFAULT_AVATAR_DRIVER_PORT))),
        )


class OfflineAvatarDriveRequest(BaseModel):
    record_id: str | None = None
    avatar_id: str = "companion_female_01"
    face3d_path: str
    emotion_path: str | None = None
    sample_stride: int = Field(default=75, ge=1, le=300)
    max_output_frames: int = Field(default=12, ge=1, le=60)

    @field_validator("face3d_path")
    @classmethod
    def validate_face3d_path(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("face3d_path must not be empty")
        return normalized


class AvatarDriverFrame(BaseModel):
    frame_index: int = Field(ge=0)
    jaw_open: float = Field(ge=0.0, le=1.0)
    brow_raise: float = Field(ge=0.0, le=1.0)
    mouth_round: float = Field(ge=0.0, le=1.0)
    eye_wide: float = Field(ge=0.0, le=1.0)
    head_tilt: float = Field(ge=-1.0, le=1.0)
    expression_energy: float = Field(ge=0.0, le=1.0)


class AvatarDriverSummary(BaseModel):
    jaw_open_mean: float = Field(ge=0.0, le=1.0)
    expression_energy_mean: float = Field(ge=0.0, le=1.0)
    dominant_emotion: str | None = None
    mean_valence: float | None = None
    mean_arousal: float | None = None


class OfflineAvatarDriveResponse(BaseModel):
    record_id: str | None = None
    avatar_id: str
    source_face3d_path: str
    source_emotion_path: str | None = None
    frame_count: int = Field(ge=1)
    feature_dim: int = Field(ge=1)
    emotion_row_count: int | None = Field(default=None, ge=0)
    alignment_status: Literal["aligned", "mismatch", "unverified"]
    mismatch_steps: int | None = Field(default=None, ge=0)
    driver_frames: list[AvatarDriverFrame]
    driver_summary: AvatarDriverSummary


def resolve_data_path(path_value: str) -> Path:
    candidate = Path(path_value)
    if not candidate.is_absolute():
        candidate = (ROOT / candidate).resolve()
    else:
        candidate = candidate.resolve()
    try:
        candidate.relative_to(DATA_ROOT)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="path must stay under data/") from exc
    if not candidate.exists():
        raise HTTPException(status_code=404, detail=f"file not found: {path_value}")
    return candidate


def normalize_face3d_array(face3d: np.ndarray) -> np.ndarray:
    if face3d.ndim == 3:
        if face3d.shape[1] != 1:
            raise HTTPException(status_code=400, detail="unsupported face3d middle dimension")
        return face3d[:, 0, :]
    if face3d.ndim == 2:
        return face3d
    raise HTTPException(status_code=400, detail="face3d array must be 2D or 3D")


def load_emotion_rows(emotion_path: Path | None) -> tuple[int | None, dict[str, float] | None]:
    if emotion_path is None:
        return None, None

    with emotion_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    if not rows:
        return 0, {
            "mean_valence": 0.0,
            "mean_arousal": 0.0,
            "dominant_emotion": "Neutral",
        }

    emotion_scores = {
        column: mean(float(row.get(column, 0.0) or 0.0) for row in rows)
        for column in EMOTION_COLUMNS
    }
    dominant_emotion = max(emotion_scores.items(), key=lambda item: item[1])[0]
    summary = {
        "mean_valence": mean(float(row.get("valence", 0.0) or 0.0) for row in rows),
        "mean_arousal": mean(float(row.get("arousal", 0.0) or 0.0) for row in rows),
        "dominant_emotion": dominant_emotion,
    }
    return len(rows), summary


def resolve_alignment_status(
    frame_count: int,
    emotion_row_count: int | None,
) -> tuple[Literal["aligned", "mismatch", "unverified"], int | None]:
    if emotion_row_count is None:
        return "unverified", None
    mismatch_steps = abs(frame_count - emotion_row_count)
    if mismatch_steps == 0:
        return "aligned", 0
    return "mismatch", mismatch_steps


def build_driver_frame(vector: np.ndarray, frame_index: int, scale: float) -> AvatarDriverFrame:
    safe_scale = scale if scale > 0 else 1.0

    def normalized_abs(start: int, end: int) -> float:
        segment = vector[start:end]
        if segment.size == 0:
            return 0.0
        return float(np.clip(np.mean(np.abs(segment)) / safe_scale, 0.0, 1.0))

    head_slice = vector[32:44] if vector.shape[0] >= 44 else vector
    head_tilt = float(np.clip(np.mean(head_slice) / safe_scale, -1.0, 1.0))

    return AvatarDriverFrame(
        frame_index=frame_index,
        jaw_open=normalized_abs(0, 8),
        brow_raise=normalized_abs(8, 20),
        mouth_round=normalized_abs(20, 32),
        eye_wide=normalized_abs(44, min(58, vector.shape[0])),
        head_tilt=head_tilt,
        expression_energy=float(np.clip(np.mean(np.abs(vector)) / safe_scale, 0.0, 1.0)),
    )


def build_driver_frames(
    face3d: np.ndarray,
    sample_stride: int,
    max_output_frames: int,
) -> list[AvatarDriverFrame]:
    frame_count = face3d.shape[0]
    sample_indices = list(range(0, frame_count, sample_stride))
    if not sample_indices:
        sample_indices = [0]
    if sample_indices[-1] != frame_count - 1:
        sample_indices.append(frame_count - 1)
    sample_indices = sample_indices[:max_output_frames]

    scale = float(np.percentile(np.abs(face3d), 95)) if face3d.size else 1.0
    return [build_driver_frame(face3d[index], index, scale) for index in sample_indices]


def build_driver_summary(
    driver_frames: list[AvatarDriverFrame],
    emotion_summary: dict[str, float] | None,
) -> AvatarDriverSummary:
    return AvatarDriverSummary(
        jaw_open_mean=float(mean(frame.jaw_open for frame in driver_frames)),
        expression_energy_mean=float(mean(frame.expression_energy for frame in driver_frames)),
        dominant_emotion=emotion_summary["dominant_emotion"] if emotion_summary else None,
        mean_valence=emotion_summary["mean_valence"] if emotion_summary else None,
        mean_arousal=emotion_summary["mean_arousal"] if emotion_summary else None,
    )


def create_app() -> FastAPI:
    settings = AvatarDriverSettings.from_env()
    app = FastAPI(title="virtual-huamn-avatar-driver-service", version="0.1.0")
    app.state.settings = settings

    @app.get("/health")
    def health() -> dict[str, str | int]:
        return {
            "status": "ok",
            "host": settings.host,
            "port": settings.port,
        }

    @app.post("/internal/avatar/offline-drive", response_model=OfflineAvatarDriveResponse)
    def offline_drive(payload: OfflineAvatarDriveRequest) -> OfflineAvatarDriveResponse:
        face3d_path = resolve_data_path(payload.face3d_path)
        emotion_path = resolve_data_path(payload.emotion_path) if payload.emotion_path else None

        face3d = normalize_face3d_array(np.load(face3d_path))
        frame_count = int(face3d.shape[0])
        feature_dim = int(face3d.shape[1])
        emotion_row_count, emotion_summary = load_emotion_rows(emotion_path)
        alignment_status, mismatch_steps = resolve_alignment_status(frame_count, emotion_row_count)
        driver_frames = build_driver_frames(
            face3d=face3d,
            sample_stride=payload.sample_stride,
            max_output_frames=payload.max_output_frames,
        )

        return OfflineAvatarDriveResponse(
            record_id=payload.record_id,
            avatar_id=payload.avatar_id,
            source_face3d_path=str(face3d_path.relative_to(ROOT)),
            source_emotion_path=str(emotion_path.relative_to(ROOT)) if emotion_path else None,
            frame_count=frame_count,
            feature_dim=feature_dim,
            emotion_row_count=emotion_row_count,
            alignment_status=alignment_status,
            mismatch_steps=mismatch_steps,
            driver_frames=driver_frames,
            driver_summary=build_driver_summary(driver_frames, emotion_summary),
        )

    return app


app = create_app()
