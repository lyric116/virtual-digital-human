from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
import re
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[2]


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
        os.environ.setdefault(key, value)


@dataclass
class AffectServiceSettings:
    affect_service_host: str
    affect_service_port: int
    affect_service_base_url: str
    affect_cors_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "AffectServiceSettings":
        host = os.getenv("AFFECT_SERVICE_HOST", "0.0.0.0")
        port = int(os.getenv("AFFECT_SERVICE_PORT", "8060"))
        base_url = os.getenv("AFFECT_SERVICE_BASE_URL")
        if not base_url:
            public_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
            base_url = f"http://{public_host}:{port}"

        return cls(
            affect_service_host=host,
            affect_service_port=port,
            affect_service_base_url=base_url.rstrip("/"),
            affect_cors_origins=tuple(
                value.strip()
                for value in os.getenv(
                    "AFFECT_CORS_ORIGINS",
                    "http://127.0.0.1:4173,http://localhost:4173",
                ).split(",")
                if value.strip()
            ),
        )


class AffectSourceContext(BaseModel):
    origin: str
    dataset: str
    record_id: str
    note: str | None = None


class AffectLaneResult(BaseModel):
    status: Literal["ready", "pending", "offline"]
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)
    detail: str


class AffectFusionResult(BaseModel):
    emotion_state: str
    risk_level: Literal["low", "medium", "high"]
    confidence: float = Field(ge=0.0, le=1.0)
    conflict: bool
    conflict_reason: str | None = None
    detail: str


class AffectAnalyzeRequest(BaseModel):
    session_id: str
    trace_id: str | None = None
    current_stage: Literal["idle", "engage", "assess", "intervene", "reassess", "handoff"] = "idle"
    text_input: str | None = None
    last_source_kind: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    capture_state: dict[str, Any] = Field(default_factory=dict)
    source_context: AffectSourceContext | None = None


class AffectAnalyzeResponse(BaseModel):
    session_id: str
    trace_id: str | None = None
    current_stage: str
    generated_at: datetime
    source_context: AffectSourceContext
    text_result: AffectLaneResult
    audio_result: AffectLaneResult
    video_result: AffectLaneResult
    fusion_result: AffectFusionResult


HIGH_RISK_KEYWORDS = (
    "不想活",
    "想死",
    "自杀",
    "伤害自己",
    "结束生命",
)
ANXIOUS_KEYWORDS = (
    "睡不好",
    "睡不着",
    "焦虑",
    "压力",
    "紧张",
    "停不下来",
    "失眠",
    "stress",
    "stressé",
    "stressant",
    "angoisse",
    "anxieux",
    "pression",
    "insomnie",
)
LOW_MOOD_KEYWORDS = (
    "低落",
    "难过",
    "沮丧",
    "没有意义",
    "没意思",
    "提不起劲",
    "不想说话",
    "好累",
    "撑不住",
    "triste",
    "fatigué",
    "fatigue",
    "déprim",
)
GUARDED_MASKING_KEYWORDS = (
    "我没事",
    "没什么",
    "还好",
    "不用担心",
    "没关系",
    "不用了",
    "算了",
    "ça va",
    "pas de souci",
    "t'inquiète",
)
ACKNOWLEDGEMENT_ONLY_TOKENS = {
    "ok",
    "okay",
    "oui",
    "ouais",
    "d'accord",
    "dac",
    "bonjour",
    "nickel",
    "hmm",
    "hm",
    "euh",
}


def normalize_text(value: str | None) -> str:
    return (value or "").strip().lower()


def extract_text_tokens(value: str) -> list[str]:
    return re.findall(r"[a-zà-ÿ0-9']+|[\u4e00-\u9fff]+", value.lower())


def is_brief_acknowledgement(value: str) -> bool:
    tokens = extract_text_tokens(value)
    if not tokens or len(tokens) > 5:
        return False
    return all(token in ACKNOWLEDGEMENT_ONLY_TOKENS for token in tokens)


def build_default_source_context(payload: AffectAnalyzeRequest) -> AffectSourceContext:
    if payload.source_context is not None:
        return payload.source_context

    metadata_source = payload.metadata.get("source") if isinstance(payload.metadata, dict) else None
    origin = str(metadata_source or "live_web_session")
    dataset = str(payload.metadata.get("dataset") or "live_web") if isinstance(payload.metadata, dict) else "live_web"
    record_id = str(payload.metadata.get("record_id") or f"session/{payload.session_id}") if isinstance(payload.metadata, dict) else f"session/{payload.session_id}"
    note = payload.metadata.get("sample_note") if isinstance(payload.metadata, dict) else None
    if note is not None:
        note = str(note)
    else:
        note = "enterprise sample pending binding"
    return AffectSourceContext(origin=origin, dataset=dataset, record_id=record_id, note=note)


def analyze_text_lane(payload: AffectAnalyzeRequest) -> AffectLaneResult:
    text = normalize_text(payload.text_input)
    if not text:
        return AffectLaneResult(
            status="pending",
            label="pending",
            confidence=0.0,
            evidence=[],
            detail="尚未收到文本或最终转写，文本路保持占位。",
        )

    if any(keyword in text for keyword in HIGH_RISK_KEYWORDS):
        return AffectLaneResult(
            status="ready",
            label="distressed",
            confidence=0.96,
            evidence=["keyword:self_harm_expression"],
            detail="文本中出现明显高风险表达，文本路直接拉高风险。",
        )

    anxious_hits = [keyword for keyword in ANXIOUS_KEYWORDS if keyword in text]
    if anxious_hits:
        return AffectLaneResult(
            status="ready",
            label="anxious",
            confidence=0.78,
            evidence=[f"keyword:{hit}" for hit in anxious_hits[:3]],
            detail="文本路检测到睡眠、压力或紧张相关关键词。",
        )

    low_mood_hits = [keyword for keyword in LOW_MOOD_KEYWORDS if keyword in text]
    if low_mood_hits:
        return AffectLaneResult(
            status="ready",
            label="low_mood",
            confidence=0.73,
            evidence=[f"keyword:{hit}" for hit in low_mood_hits[:3]],
            detail="文本路检测到低落、疲惫或明显负性情绪表达。",
        )

    guarded_hits = [keyword for keyword in GUARDED_MASKING_KEYWORDS if keyword in text]
    if guarded_hits:
        return AffectLaneResult(
            status="ready",
            label="guarded",
            confidence=0.64,
            evidence=[f"keyword:{hit}" for hit in guarded_hits[:3]],
            detail="文本路出现回避或掩饰式表达，后续应优先结合其他模态澄清。",
        )

    if is_brief_acknowledgement(text):
        return AffectLaneResult(
            status="ready",
            label="guarded",
            confidence=0.59,
            evidence=["pattern:brief_acknowledgement_only"],
            detail="文本过短且主要由确认式回应组成，文本路暂标为保守型回应。",
        )

    return AffectLaneResult(
        status="ready",
        label="neutral",
        confidence=0.64,
        evidence=["text:general_statement"],
        detail="当前文本没有触发明显高风险或焦虑关键词。",
    )


def analyze_audio_lane(payload: AffectAnalyzeRequest) -> AffectLaneResult:
    capture_state = payload.capture_state or {}
    recording_state = str(capture_state.get("recording_state") or "idle")
    audio_upload_state = str(capture_state.get("audio_upload_state") or "idle")
    uploaded_chunk_count = int(capture_state.get("uploaded_chunk_count") or 0)
    source_kind = str(payload.last_source_kind or "")

    if source_kind == "audio" or audio_upload_state in {"completed", "awaiting_realtime", "processing_final"}:
        return AffectLaneResult(
            status="ready",
            label="speech_observed",
            confidence=0.66,
            evidence=[f"audio_upload_state:{audio_upload_state}", f"uploaded_chunks:{uploaded_chunk_count}"],
            detail="音频路已收到真实录音上传，但当前仍使用轻量占位分析。",
        )
    if recording_state == "recording" or uploaded_chunk_count > 0:
        return AffectLaneResult(
            status="ready",
            label="low_energy_proxy",
            confidence=0.54,
            evidence=[f"recording_state:{recording_state}", f"uploaded_chunks:{uploaded_chunk_count}"],
            detail="音频路检测到实时录音活动，先以低成本代理特征占位。",
        )
    return AffectLaneResult(
        status="pending",
        label="pending",
        confidence=0.0,
        evidence=[],
        detail="音频路尚未收到可分析的录音或转写结果。",
    )


def analyze_video_lane(payload: AffectAnalyzeRequest) -> AffectLaneResult:
    capture_state = payload.capture_state or {}
    camera_state = str(capture_state.get("camera_state") or "idle")
    uploaded_video_frame_count = int(capture_state.get("uploaded_video_frame_count") or 0)

    if camera_state == "previewing" and uploaded_video_frame_count > 0:
        return AffectLaneResult(
            status="ready",
            label="face_present_proxy",
            confidence=0.61,
            evidence=[f"camera_state:{camera_state}", f"uploaded_frames:{uploaded_video_frame_count}"],
            detail="视频路已收到浏览器抽帧，后续可在同一挂点替换成人脸和注视分析。",
        )
    if camera_state == "previewing":
        return AffectLaneResult(
            status="ready",
            label="camera_live",
            confidence=0.42,
            evidence=[f"camera_state:{camera_state}"],
            detail="摄像头已开启但尚未积累足够帧，视频路先保留在线占位。",
        )
    if camera_state in {"stopped", "denied", "error"}:
        return AffectLaneResult(
            status="offline",
            label="camera_offline",
            confidence=0.18,
            evidence=[f"camera_state:{camera_state}"],
            detail="视频路当前离线，不参与强判断。",
        )
    return AffectLaneResult(
        status="pending",
        label="pending",
        confidence=0.0,
        evidence=[],
        detail="视频路尚未收到有效摄像头状态。",
    )


def analyze_fusion(
    payload: AffectAnalyzeRequest,
    *,
    text_result: AffectLaneResult,
    audio_result: AffectLaneResult,
    video_result: AffectLaneResult,
) -> AffectFusionResult:
    text = normalize_text(payload.text_input)
    audio_active = audio_result.status == "ready"
    video_active = video_result.status == "ready"

    if text_result.label == "distressed":
        return AffectFusionResult(
            emotion_state="high_risk_distress",
            risk_level="high",
            confidence=0.95,
            conflict=False,
            conflict_reason=None,
            detail="文本路已触发高风险规则，融合结果直接进入高风险。",
        )

    if text_result.label == "guarded" and (audio_active or video_active):
        reasons: list[str] = ["text-guarded"]
        if audio_active:
            reasons.append(f"audio-{audio_result.label}")
        if video_active:
            reasons.append(f"video-{video_result.label}")
        return AffectFusionResult(
            emotion_state="needs_clarification",
            risk_level="medium",
            confidence=0.68,
            conflict=True,
            conflict_reason="; ".join(reasons),
            detail="文本路偏保守或回避，但其他模态已有活动，占位融合先标记为冲突待澄清。",
        )

    if text_result.label == "anxious":
        confidence = 0.74 if (audio_active or video_active) else 0.69
        evidence_detail = "文本焦虑线索已出现，并有其他模态在线。" if (audio_active or video_active) else "文本焦虑线索已出现，其他模态仍在占位。"
        return AffectFusionResult(
            emotion_state="anxious_monitoring",
            risk_level="medium",
            confidence=confidence,
            conflict=False,
            conflict_reason=None,
            detail=evidence_detail,
        )

    if text_result.label == "low_mood":
        confidence = 0.76 if (audio_active or video_active) else 0.71
        evidence_detail = "文本低落线索已出现，并有其他模态在线。" if (audio_active or video_active) else "文本低落线索已出现，其他模态仍在占位。"
        return AffectFusionResult(
            emotion_state="low_mood_monitoring",
            risk_level="medium",
            confidence=confidence,
            conflict=False,
            conflict_reason=None,
            detail=evidence_detail,
        )

    if text_result.label == "guarded":
        return AffectFusionResult(
            emotion_state="guarded_monitoring",
            risk_level="low",
            confidence=0.56,
            conflict=False,
            conflict_reason=None,
            detail="文本较短或偏回避，系统会优先继续澄清而不直接下结论。",
        )

    if audio_active or video_active:
        return AffectFusionResult(
            emotion_state="observe_more",
            risk_level="low",
            confidence=0.52,
            conflict=False,
            conflict_reason=None,
            detail="已有音频或视频活动，但文本路尚未提供明确情绪结论。",
        )

    return AffectFusionResult(
        emotion_state="pending_multimodal",
        risk_level="low",
        confidence=0.24,
        conflict=False,
        conflict_reason=None,
        detail="三路结果仍以占位为主，等待后续步骤接入真实分析。",
    )


def generate_affect_snapshot(
    settings: AffectServiceSettings,
    payload: AffectAnalyzeRequest,
) -> AffectAnalyzeResponse:
    del settings
    text_result = analyze_text_lane(payload)
    audio_result = analyze_audio_lane(payload)
    video_result = analyze_video_lane(payload)
    fusion_result = analyze_fusion(
        payload,
        text_result=text_result,
        audio_result=audio_result,
        video_result=video_result,
    )

    return AffectAnalyzeResponse(
        session_id=payload.session_id,
        trace_id=payload.trace_id,
        current_stage=payload.current_stage,
        generated_at=datetime.now(timezone.utc),
        source_context=build_default_source_context(payload),
        text_result=text_result,
        audio_result=audio_result,
        video_result=video_result,
        fusion_result=fusion_result,
    )


def translate_affect_exception(error: Exception) -> HTTPException:
    if isinstance(error, RuntimeError):
        return HTTPException(status_code=503, detail=str(error))
    return HTTPException(status_code=502, detail=f"{type(error).__name__}: {error}")


def create_app() -> FastAPI:
    bootstrap_runtime_env()
    settings = AffectServiceSettings.from_env()
    app = FastAPI(title="affect-service", version="0.1.0")

    if settings.affect_cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.affect_cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
        )

    @app.get("/health")
    async def health() -> dict[str, object]:
        return {
            "status": "ok",
            "service": "affect-service",
            "port": settings.affect_service_port,
        }

    @app.post("/internal/affect/analyze", response_model=AffectAnalyzeResponse)
    async def analyze(payload: AffectAnalyzeRequest) -> AffectAnalyzeResponse:
        try:
            return generate_affect_snapshot(settings, payload)
        except HTTPException:
            raise
        except Exception as error:  # pragma: no cover - translated in tests
            raise translate_affect_exception(error) from error

    return app


app = create_app()
