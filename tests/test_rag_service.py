from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
RAG_MAIN = ROOT / "services" / "rag-service" / "main.py"
RAG_README = ROOT / "services" / "rag-service" / "README.md"
ROOT_README = ROOT / "README.md"


def load_rag_module():
    spec = importlib.util.spec_from_file_location("rag_service_main_test", RAG_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load rag service module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def build_settings(module):
    return module.RAGServiceSettings(
        rag_service_host="127.0.0.1",
        rag_service_port=8070,
        rag_service_base_url="http://127.0.0.1:8070",
        rag_cards_path=ROOT / "data" / "kb" / "knowledge_cards.jsonl",
        rag_default_top_k=3,
        rag_max_top_k=5,
    )


def test_rag_retrieval_returns_breathing_cards_for_anxious_intervention():
    module = load_rag_module()
    index = module.build_knowledge_index(ROOT / "data" / "kb" / "knowledge_cards.jsonl")
    settings = build_settings(module)
    payload = module.RAGRetrieveRequest(
        session_id="sess_rag_test",
        trace_id="trace_rag_test",
        query_text="我现在很焦虑，胸口很紧，想试试慢一点的呼吸。",
        current_stage="intervene",
        risk_level="medium",
        emotion="anxious",
        top_k=3,
    )

    result = module.retrieve_knowledge_cards(index, payload, settings)

    assert result["candidate_count"] >= 1
    assert result["results"]
    assert result["results"][0]["source_id"] in {
        "breathing_box_4444",
        "breathing_478_basic",
        "anxiety_grounding_5sense",
    }
    assert any(card["category"] == "breathing_intervention" for card in result["results"])


def test_rag_retrieval_returns_low_mood_support_for_low_mood_query():
    module = load_rag_module()
    index = module.build_knowledge_index(ROOT / "data" / "kb" / "knowledge_cards.jsonl")
    settings = build_settings(module)
    payload = module.RAGRetrieveRequest(
        session_id="sess_rag_low_mood",
        query_text="我这几天提不起劲，什么都不想做，但想先从很小的事情开始。",
        current_stage="intervene",
        risk_level="medium",
        emotion="low_mood",
        top_k=3,
    )

    result = module.retrieve_knowledge_cards(index, payload, settings)

    assert result["results"]
    assert result["results"][0]["category"] == "low_mood_support"
    assert result["results"][0]["source_id"] == "low_mood_micro_activation"


def test_rag_retrieval_keeps_high_risk_results_inside_handoff_cards():
    module = load_rag_module()
    index = module.build_knowledge_index(ROOT / "data" / "kb" / "knowledge_cards.jsonl")
    settings = build_settings(module)
    payload = module.retrieve_knowledge_cards(
        index,
        module.RAGRetrieveRequest(
            session_id="sess_rag_handoff",
            trace_id="trace_rag_handoff",
            query_text="我现在真的不想活了，想结束生命。",
            current_stage="handoff",
            risk_level="high",
            emotion="distressed",
            top_k=2,
        ),
        settings,
    )

    assert payload["results"]
    assert all(card["category"] == "handoff_support" for card in payload["results"])
    assert all(card["source_id"] for card in payload["results"])
    assert "risk_guardrail:high_only_safe_categories" in payload["filters_applied"]


def test_rag_high_risk_guardrail_bypasses_non_handoff_stage_filter():
    module = load_rag_module()
    index = module.build_knowledge_index(ROOT / "data" / "kb" / "knowledge_cards.jsonl")
    settings = build_settings(module)
    payload = module.retrieve_knowledge_cards(
        index,
        module.RAGRetrieveRequest(
            session_id="sess_rag_high_guard",
            trace_id="trace_rag_high_guard",
            query_text="我现在真的不想活了，但还没有联系任何人。",
            current_stage="assess",
            risk_level="high",
            emotion="distressed",
            top_k=2,
        ),
        settings,
    )

    assert payload["results"]
    assert all(card["category"] == "handoff_support" for card in payload["results"])
    assert "risk_guardrail:high_only_safe_categories" in payload["filters_applied"]
    assert "stage:bypassed_for_high_risk_guardrail" in payload["filters_applied"]


def test_rag_service_routes_and_docs_are_present():
    module = load_rag_module()
    app = module.create_app(index=module.build_knowledge_index(ROOT / "data" / "kb" / "knowledge_cards.jsonl"))
    paths = {route.path for route in app.routes}
    service_readme = RAG_README.read_text(encoding="utf-8")
    root_readme = ROOT_README.read_text(encoding="utf-8")

    assert "/health" in paths
    assert "/internal/rag/retrieve" in paths
    assert "/internal/rag/index/reload" in paths
    assert "verify_rag_service.py" in service_readme
    assert "verify_rag_service.py" in root_readme
