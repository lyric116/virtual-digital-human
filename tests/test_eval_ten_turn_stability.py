from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "eval_ten_turn_stability.py"


def load_module():
    spec = importlib.util.spec_from_file_location("eval_ten_turn_stability_test", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load eval_ten_turn_stability module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_validate_stage_history_accepts_expected_transitions():
    module = load_module()
    summary = module.validate_stage_history(
        [
            {"stage": "engage", "trace_id": "trace_001", "message_id": None},
            {"stage": "assess", "trace_id": "trace_001", "message_id": "msg_001"},
            {"stage": "intervene", "trace_id": "trace_001", "message_id": "msg_002"},
            {"stage": "reassess", "trace_id": "trace_001", "message_id": "msg_003"},
            {"stage": "intervene", "trace_id": "trace_001", "message_id": "msg_004"},
        ]
    )

    assert summary["visited_stages"] == ["engage", "assess", "intervene", "reassess", "intervene"]
    assert summary["stage_transition_count"] == 4


def test_render_markdown_contains_checks_and_enterprise_section():
    module = load_module()
    report = {
        "generated_at": "2026-03-10T18:00:00Z",
        "session_id": "sess_001",
        "user_turn_count": 10,
        "assistant_turn_count": 10,
        "final_stage": "reassess",
        "final_status": "active",
        "checks": ["check_a", "check_b"],
        "event_counts": {
            "message.accepted": 10,
            "knowledge.retrieved": 10,
            "dialogue.reply": 10,
        },
        "turn_results": [
            {
                "turn_index": 1,
                "stage": "assess",
                "risk_level": "low",
                "next_action": "ask_followup",
                "knowledge_refs": ["sleep_hygiene_basic"],
                "reply_preview": "先把今晚最担心的事写下来。",
            }
        ],
        "stage_history": [
            {"stage": "engage", "trace_id": "trace_001", "message_id": None},
            {"stage": "assess", "trace_id": "trace_001", "message_id": "msg_001"},
        ],
        "stage_summary": {
            "visited_stages": ["engage", "assess"],
            "stage_transition_count": 1,
        },
        "final_assistant_reply": "这里是总结回复。",
        "enterprise_regression": {
            "record_id": "noxi/001",
            "emotion_state": "stable_low_risk",
            "risk_level": "low",
            "conflict": False,
            "conflict_reason": None,
        },
    }

    markdown = module.render_markdown(report)

    assert "# Ten-Turn Stability Report" in markdown
    assert "## Stability Checks" in markdown
    assert "## Enterprise Multimodal Regression" in markdown
    assert "`dialogue.reply`" in markdown
