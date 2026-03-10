from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
VERIFY_MAIN = ROOT / "scripts" / "verify_knowledge_cards.py"
CARDS_PATH = ROOT / "data" / "kb" / "knowledge_cards.jsonl"
KB_README = ROOT / "data" / "kb" / "README.md"
RAG_README = ROOT / "services" / "rag-service" / "README.md"
DOC_README = ROOT / "docs" / "06-rag-kb.md"


def load_module():
    spec = importlib.util.spec_from_file_location("verify_knowledge_cards_test", VERIFY_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load verify_knowledge_cards.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_knowledge_cards_verify_expected_coverage():
    module = load_module()
    summary = module.verify_knowledge_cards()

    assert summary["card_count"] >= 10
    assert "anxiety_support" in summary["categories"]
    assert "handoff_support" in summary["categories"]
    assert "handoff" in summary["stages_covered"]
    assert summary["high_risk_card_count"] >= 1


def test_knowledge_card_docs_point_to_dataset_and_verifier():
    kb_readme = KB_README.read_text(encoding="utf-8")
    rag_readme = RAG_README.read_text(encoding="utf-8")
    doc_readme = DOC_README.read_text(encoding="utf-8")

    assert "knowledge_cards.jsonl" in kb_readme
    assert "verify_knowledge_cards.py" in kb_readme
    assert "knowledge_cards.jsonl" in rag_readme
    assert "verify_knowledge_cards.py" in rag_readme
    assert "recommended_phrases" in doc_readme


def test_knowledge_card_dataset_is_committed_and_non_empty():
    assert CARDS_PATH.exists()
    assert CARDS_PATH.read_text(encoding="utf-8").strip()
