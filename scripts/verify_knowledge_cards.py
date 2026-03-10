#!/usr/bin/env python3
"""Verify the step-43 structured knowledge-card dataset."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CARDS_PATH = ROOT / "data" / "kb" / "knowledge_cards.jsonl"

REQUIRED_FIELDS = {
    "id",
    "title",
    "category",
    "summary",
    "stage",
    "risk_level",
    "emotion",
    "tags",
    "contraindications",
    "recommended_phrases",
    "followup_questions",
    "source",
}
VALID_STAGES = {"engage", "assess", "intervene", "reassess", "handoff"}
VALID_RISK_LEVELS = {"low", "medium", "high"}
REQUIRED_CATEGORIES = {
    "anxiety_support",
    "low_mood_support",
    "sleep_support",
    "breathing_intervention",
    "handoff_support",
}


def load_cards() -> list[dict]:
    cards: list[dict] = []
    for line_number, raw_line in enumerate(CARDS_PATH.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue
        payload = json.loads(stripped)
        payload["_line_number"] = line_number
        cards.append(payload)
    return cards


def require_non_empty_string_list(card_id: str, field_name: str, value: object) -> list[str]:
    if not isinstance(value, list):
        raise RuntimeError(f"{card_id}: {field_name} must be a list")
    normalized = [str(item).strip() for item in value if str(item).strip()]
    if not normalized:
        raise RuntimeError(f"{card_id}: {field_name} must not be empty")
    return normalized


def verify_knowledge_cards() -> dict[str, object]:
    if not CARDS_PATH.exists():
        raise RuntimeError(f"knowledge card file does not exist: {CARDS_PATH}")

    cards = load_cards()
    if not cards:
        raise RuntimeError("knowledge card file is empty")

    seen_ids: set[str] = set()
    category_counts: dict[str, int] = {}

    for card in cards:
        card_id = str(card.get("id") or "").strip()
        missing_fields = sorted(field for field in REQUIRED_FIELDS if field not in card)
        if missing_fields:
            raise RuntimeError(f"{card_id or '<missing-id>'}: missing fields {missing_fields}")
        if not card_id:
            raise RuntimeError("one knowledge card is missing id")
        if card_id in seen_ids:
            raise RuntimeError(f"duplicate knowledge card id: {card_id}")
        seen_ids.add(card_id)

        for field_name in ("title", "category", "summary", "source"):
            if not str(card.get(field_name) or "").strip():
                raise RuntimeError(f"{card_id}: {field_name} must not be empty")

        stages = require_non_empty_string_list(card_id, "stage", card.get("stage"))
        if any(stage not in VALID_STAGES for stage in stages):
            raise RuntimeError(f"{card_id}: stage contains invalid value")

        risk_levels = require_non_empty_string_list(card_id, "risk_level", card.get("risk_level"))
        if any(level not in VALID_RISK_LEVELS for level in risk_levels):
            raise RuntimeError(f"{card_id}: risk_level contains invalid value")

        require_non_empty_string_list(card_id, "emotion", card.get("emotion"))
        require_non_empty_string_list(card_id, "tags", card.get("tags"))
        require_non_empty_string_list(card_id, "contraindications", card.get("contraindications"))
        require_non_empty_string_list(card_id, "recommended_phrases", card.get("recommended_phrases"))
        require_non_empty_string_list(card_id, "followup_questions", card.get("followup_questions"))

        category = str(card["category"]).strip()
        category_counts[category] = category_counts.get(category, 0) + 1

    missing_categories = sorted(category for category in REQUIRED_CATEGORIES if category not in category_counts)
    if missing_categories:
        raise RuntimeError(f"knowledge card coverage is missing categories: {missing_categories}")

    high_risk_non_handoff = [
        card["id"]
        for card in cards
        if "high" in card["risk_level"] and card["category"] != "handoff_support"
    ]
    if high_risk_non_handoff:
        raise RuntimeError(
            "high-risk cards must stay in handoff_support during step 43: "
            f"{high_risk_non_handoff}"
        )

    return {
        "card_count": len(cards),
        "categories": category_counts,
        "high_risk_card_count": sum(1 for card in cards if "high" in card["risk_level"]),
        "stages_covered": sorted(
            {
                stage
                for card in cards
                for stage in card["stage"]
            }
        ),
    }


def main() -> None:
    print(json.dumps(verify_knowledge_cards(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
