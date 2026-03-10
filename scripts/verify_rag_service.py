#!/usr/bin/env python3
"""Verify the step-44 RAG retrieval baseline with three representative queries."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
RAG_MAIN = ROOT / "services" / "rag-service" / "main.py"
CARDS_PATH = ROOT / "data" / "kb" / "knowledge_cards.jsonl"


def load_module():
    spec = importlib.util.spec_from_file_location("rag_service_verify", RAG_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load rag service module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> None:
    module = load_module()
    index = module.build_knowledge_index(CARDS_PATH)
    settings = module.RAGServiceSettings(
        rag_service_host="127.0.0.1",
        rag_service_port=8070,
        rag_service_base_url="http://127.0.0.1:8070",
        rag_cards_path=CARDS_PATH,
        rag_default_top_k=3,
        rag_max_top_k=5,
    )

    queries = [
        {
            "name": "anxious_breathing",
            "payload": {
                "session_id": "sess_verify_rag_1",
                "trace_id": "trace_verify_rag_1",
                "query_text": "我现在很焦虑，胸口很紧，想试试慢一点的呼吸。",
                "current_stage": "intervene",
                "risk_level": "medium",
                "emotion": "anxious",
                "top_k": 3,
            },
            "expect_ids": {
                "breathing_box_4444",
                "breathing_478_basic",
                "anxiety_grounding_5sense",
            },
        },
        {
            "name": "low_mood_activation",
            "payload": {
                "session_id": "sess_verify_rag_2",
                "trace_id": "trace_verify_rag_2",
                "query_text": "我这几天提不起劲，什么都不想做，但想先从很小的事情开始。",
                "current_stage": "intervene",
                "risk_level": "medium",
                "emotion": "low_mood",
                "top_k": 3,
            },
            "expect_ids": {
                "low_mood_micro_activation",
                "low_mood_self_compassion_checkin",
            },
        },
        {
            "name": "high_risk_handoff",
            "payload": {
                "session_id": "sess_verify_rag_3",
                "trace_id": "trace_verify_rag_3",
                "query_text": "我现在真的不想活了，想结束生命。",
                "current_stage": "handoff",
                "risk_level": "high",
                "emotion": "distressed",
                "top_k": 2,
            },
            "expect_ids": {
                "handoff_emergency_support",
                "handoff_campus_support_path",
            },
        },
    ]

    summaries: list[dict[str, object]] = []
    for query in queries:
        payload = module.retrieve_knowledge_cards(
            index,
            module.RAGRetrieveRequest.model_validate(query["payload"]),
            settings,
        )
        result_ids = [card["source_id"] for card in payload["results"]]
        if not result_ids:
            raise RuntimeError(f"{query['name']}: no retrieval results returned")
        if not any(card_id in query["expect_ids"] for card_id in result_ids):
            raise RuntimeError(f"{query['name']}: unexpected top ids {result_ids}")
        if query["name"] == "high_risk_handoff":
            if any(card["category"] != "handoff_support" for card in payload["results"]):
                raise RuntimeError("high_risk_handoff: non-handoff card leaked into results")

        summaries.append(
            {
                "name": query["name"],
                "top_ids": result_ids,
                "candidate_count": payload["candidate_count"],
                "filters_applied": payload["filters_applied"],
            }
        )

    print(
        json.dumps(
            {
                "card_count": index.card_count,
                "queries": summaries,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
