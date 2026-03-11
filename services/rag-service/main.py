from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator


ROOT = Path(__file__).resolve().parents[2]
TOKEN_PATTERN = re.compile(r"[\u4e00-\u9fff]+|[a-z0-9']+")
DEFAULT_CARDS_PATH = "data/kb/knowledge_cards.jsonl"
HIGH_RISK_ALLOWED_CATEGORIES = {"handoff_support", "safety_support"}


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
class RAGServiceSettings:
    rag_service_host: str
    rag_service_port: int
    rag_service_base_url: str
    rag_cards_path: Path
    rag_default_top_k: int
    rag_max_top_k: int

    @classmethod
    def from_env(cls) -> "RAGServiceSettings":
        host = os.getenv("RAG_SERVICE_HOST", "0.0.0.0")
        port = int(os.getenv("RAG_SERVICE_PORT", "8070"))
        base_url = os.getenv("RAG_SERVICE_BASE_URL")
        if not base_url:
            public_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
            base_url = f"http://{public_host}:{port}"

        cards_path = Path(os.getenv("RAG_CARDS_PATH", DEFAULT_CARDS_PATH))
        if not cards_path.is_absolute():
            cards_path = ROOT / cards_path

        return cls(
            rag_service_host=host,
            rag_service_port=port,
            rag_service_base_url=base_url.rstrip("/"),
            rag_cards_path=cards_path,
            rag_default_top_k=int(os.getenv("RAG_DEFAULT_TOP_K", "3")),
            rag_max_top_k=int(os.getenv("RAG_MAX_TOP_K", "5")),
        )


class KnowledgeCard(BaseModel):
    id: str
    title: str
    category: str
    summary: str
    stage: list[str]
    risk_level: list[str]
    emotion: list[str]
    tags: list[str]
    contraindications: list[str]
    recommended_phrases: list[str]
    followup_questions: list[str]
    source: str


class RetrievedKnowledgeCard(BaseModel):
    source_id: str
    id: str
    title: str
    category: str
    summary: str
    score: float = Field(ge=0.0)
    stage: list[str]
    risk_level: list[str]
    emotion: list[str]
    recommended_phrases: list[str]
    followup_questions: list[str]
    contraindications: list[str]
    source: str


class RAGRetrieveRequest(BaseModel):
    session_id: str
    trace_id: str | None = None
    query_text: str
    current_stage: Literal["engage", "assess", "intervene", "reassess", "handoff"] | None = None
    risk_level: Literal["low", "medium", "high"] | None = None
    emotion: str | None = None
    top_k: int | None = Field(default=None, ge=1)

    @field_validator("query_text")
    @classmethod
    def normalize_query_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("query_text must not be empty")
        return normalized

    @field_validator("emotion", mode="before")
    @classmethod
    def normalize_emotion(cls, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None


class RAGRetrieveResponse(BaseModel):
    session_id: str
    trace_id: str | None = None
    query_text: str
    current_stage: str | None = None
    risk_level: str | None = None
    emotion: str | None = None
    top_k: int
    generated_at: datetime
    index_card_count: int
    candidate_count: int
    filters_applied: list[str] = Field(default_factory=list)
    results: list[RetrievedKnowledgeCard] = Field(default_factory=list)


class RAGIndexInfoResponse(BaseModel):
    status: Literal["ready"]
    card_count: int = Field(ge=0)
    cards_path: str
    generated_at: datetime


@dataclass
class IndexedKnowledgeCard:
    card: KnowledgeCard
    tokens: list[str]
    vector: dict[str, float]
    norm: float


@dataclass
class KnowledgeIndex:
    cards_path: Path
    cards: list[KnowledgeCard]
    entries: list[IndexedKnowledgeCard]
    idf: dict[str, float]
    generated_at: datetime

    @property
    def card_count(self) -> int:
        return len(self.cards)


def normalize_text(value: str | None) -> str:
    return (value or "").strip().lower()


def tokenise_text(value: str) -> list[str]:
    tokens: list[str] = []
    for chunk in TOKEN_PATTERN.findall(normalize_text(value)):
        if re.fullmatch(r"[\u4e00-\u9fff]+", chunk):
            chars = list(chunk)
            tokens.extend(chars)
            if len(chars) > 1:
                tokens.extend("".join(chars[index : index + 2]) for index in range(len(chars) - 1))
        else:
            tokens.append(chunk)
    return tokens


def build_card_tokens(card: KnowledgeCard) -> list[str]:
    weighted_parts: list[str] = []
    weighted_parts.extend([card.title, card.title])
    weighted_parts.extend([card.summary, card.summary])
    weighted_parts.extend(card.tags)
    weighted_parts.extend(card.recommended_phrases)
    weighted_parts.extend(card.followup_questions)
    weighted_parts.extend(card.contraindications)
    weighted_parts.extend(card.stage)
    weighted_parts.extend(card.risk_level)
    weighted_parts.extend(card.emotion)

    tokens: list[str] = []
    for part in weighted_parts:
        tokens.extend(tokenise_text(part))
    return tokens


def build_weighted_vector(tokens: list[str], idf: dict[str, float]) -> tuple[dict[str, float], float]:
    term_counts = Counter(tokens)
    weighted: dict[str, float] = {}
    for token, count in term_counts.items():
        idf_value = idf.get(token)
        if idf_value is None:
            continue
        weighted[token] = (1.0 + math.log(count)) * idf_value
    norm = math.sqrt(sum(value * value for value in weighted.values()))
    return weighted, norm


def has_meaningful_token_overlap(left_tokens: list[str], right_tokens: list[str]) -> bool:
    left = {token for token in left_tokens if len(token) >= 2}
    right = {token for token in right_tokens if len(token) >= 2}
    return bool(left.intersection(right))


def load_knowledge_cards(path: Path) -> list[KnowledgeCard]:
    if not path.exists():
        raise RuntimeError(f"knowledge card dataset does not exist: {path}")

    cards: list[KnowledgeCard] = []
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"invalid knowledge card json on line {line_number}") from exc
        cards.append(KnowledgeCard.model_validate(payload))

    if not cards:
        raise RuntimeError("knowledge card dataset is empty")
    return cards


def build_knowledge_index(cards_path: Path) -> KnowledgeIndex:
    cards = load_knowledge_cards(cards_path)
    document_tokens: list[list[str]] = []
    document_frequency: Counter[str] = Counter()

    for card in cards:
        tokens = build_card_tokens(card)
        document_tokens.append(tokens)
        document_frequency.update(set(tokens))

    total_documents = len(cards)
    idf = {
        token: math.log((1 + total_documents) / (1 + frequency)) + 1.0
        for token, frequency in document_frequency.items()
    }

    entries: list[IndexedKnowledgeCard] = []
    for card, tokens in zip(cards, document_tokens, strict=True):
        vector, norm = build_weighted_vector(tokens, idf)
        entries.append(IndexedKnowledgeCard(card=card, tokens=tokens, vector=vector, norm=norm))

    return KnowledgeIndex(
        cards_path=cards_path,
        cards=cards,
        entries=entries,
        idf=idf,
        generated_at=datetime.now(timezone.utc),
    )


def build_query_vector(query_text: str, index: KnowledgeIndex) -> tuple[dict[str, float], float]:
    tokens = tokenise_text(query_text)
    vector, norm = build_weighted_vector(tokens, index.idf)
    return vector, norm


def cosine_similarity(left: dict[str, float], left_norm: float, right: dict[str, float], right_norm: float) -> float:
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    shared_tokens = set(left).intersection(right)
    if not shared_tokens:
        return 0.0
    dot = sum(left[token] * right[token] for token in shared_tokens)
    return dot / (left_norm * right_norm)


def filter_candidates(
    index: KnowledgeIndex,
    *,
    current_stage: str | None,
    risk_level: str | None,
) -> tuple[list[IndexedKnowledgeCard], list[str]]:
    filters_applied: list[str] = []
    candidates = index.entries

    if risk_level == "high":
        candidates = [
            entry for entry in candidates if entry.card.category in HIGH_RISK_ALLOWED_CATEGORIES
        ]
        filters_applied.append("risk_guardrail:high_only_safe_categories")
        if current_stage:
            filters_applied.append("stage:bypassed_for_high_risk_guardrail")

        filtered = [entry for entry in candidates if risk_level in entry.card.risk_level]
        if filtered:
            candidates = filtered
            filters_applied.append(f"risk_level:{risk_level}")
        return candidates, filters_applied

    if current_stage:
        candidates = [entry for entry in candidates if current_stage in entry.card.stage]
        filters_applied.append(f"stage:{current_stage}")

    if risk_level:
        filtered = [entry for entry in candidates if risk_level in entry.card.risk_level]
        if filtered:
            candidates = filtered
            filters_applied.append(f"risk_level:{risk_level}")
        elif current_stage:
            filters_applied.append("risk_level:fallback_to_stage_only")

    return candidates, filters_applied


def score_candidate(
    entry: IndexedKnowledgeCard,
    *,
    semantic_score: float,
    query_vector: dict[str, float],
    query_norm: float,
    current_stage: str | None,
    risk_level: str | None,
    emotion: str | None,
) -> float:
    score = semantic_score

    if current_stage and current_stage in entry.card.stage:
        score += 0.08
    if risk_level and risk_level in entry.card.risk_level:
        score += 0.12
    if emotion and emotion in entry.card.emotion:
        score += 0.16

    return round(score, 6)


def retrieve_knowledge_cards(
    index: KnowledgeIndex,
    payload: RAGRetrieveRequest,
    settings: RAGServiceSettings,
) -> dict[str, Any]:
    top_k = payload.top_k or settings.rag_default_top_k
    top_k = min(top_k, settings.rag_max_top_k)

    query_tokens = tokenise_text(payload.query_text)
    query_vector, query_norm = build_query_vector(payload.query_text, index)
    candidates, filters_applied = filter_candidates(
        index,
        current_stage=payload.current_stage,
        risk_level=payload.risk_level,
    )

    scored: list[tuple[float, float, bool, IndexedKnowledgeCard]] = []
    for entry in candidates:
        semantic_score = cosine_similarity(query_vector, query_norm, entry.vector, entry.norm)
        meaningful_overlap = has_meaningful_token_overlap(query_tokens, entry.tokens)
        score = score_candidate(
            entry,
            semantic_score=semantic_score,
            query_vector=query_vector,
            query_norm=query_norm,
            current_stage=payload.current_stage,
            risk_level=payload.risk_level,
            emotion=payload.emotion,
        )
        scored.append((score, semantic_score, meaningful_overlap, entry))

    if payload.risk_level != "high":
        semantically_grounded = [item for item in scored if item[1] > 0.0 and item[2]]
        if semantically_grounded:
            scored = semantically_grounded
            filters_applied.append("semantic:min_overlap_required")
        else:
            scored = []
            filters_applied.append("semantic:no_overlap_no_results")

    scored.sort(key=lambda item: (-item[0], item[3].card.id))

    results = [
        RetrievedKnowledgeCard(
            source_id=entry.card.id,
            id=entry.card.id,
            title=entry.card.title,
            category=entry.card.category,
            summary=entry.card.summary,
            score=score,
            stage=entry.card.stage,
            risk_level=entry.card.risk_level,
            emotion=entry.card.emotion,
            recommended_phrases=entry.card.recommended_phrases,
            followup_questions=entry.card.followup_questions,
            contraindications=entry.card.contraindications,
            source=entry.card.source,
        ).model_dump()
        for score, _, _, entry in scored[:top_k]
    ]

    return RAGRetrieveResponse(
        session_id=payload.session_id,
        trace_id=payload.trace_id,
        query_text=payload.query_text,
        current_stage=payload.current_stage,
        risk_level=payload.risk_level,
        emotion=payload.emotion,
        top_k=top_k,
        generated_at=datetime.now(timezone.utc),
        index_card_count=index.card_count,
        candidate_count=len(scored),
        filters_applied=filters_applied,
        results=results,
    ).model_dump(mode="json")


def create_app(index: KnowledgeIndex | None = None) -> FastAPI:
    bootstrap_runtime_env()
    settings = RAGServiceSettings.from_env()
    active_index = index or build_knowledge_index(settings.rag_cards_path)

    app = FastAPI(title="virtual-huamn-rag-service", version="0.1.0")
    app.state.settings = settings
    app.state.knowledge_index = active_index

    @app.get("/health")
    def health() -> dict[str, Any]:
        response = RAGIndexInfoResponse(
            status="ready",
            card_count=app.state.knowledge_index.card_count,
            cards_path=str(app.state.knowledge_index.cards_path),
            generated_at=app.state.knowledge_index.generated_at,
        )
        return response.model_dump(mode="json")

    @app.post("/internal/rag/retrieve")
    def retrieve(payload: RAGRetrieveRequest) -> dict[str, Any]:
        return retrieve_knowledge_cards(app.state.knowledge_index, payload, app.state.settings)

    @app.post("/internal/rag/index/reload")
    def reload_index() -> dict[str, Any]:
        try:
            app.state.knowledge_index = build_knowledge_index(app.state.settings.rag_cards_path)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        response = RAGIndexInfoResponse(
            status="ready",
            card_count=app.state.knowledge_index.card_count,
            cards_path=str(app.state.knowledge_index.cards_path),
            generated_at=app.state.knowledge_index.generated_at,
        )
        return response.model_dump(mode="json")

    return app


app = create_app()
