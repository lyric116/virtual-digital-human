from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "eval_latency_report.py"


def load_module():
    spec = importlib.util.spec_from_file_location("eval_latency_report_test", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load eval_latency_report module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_summarize_metric_and_percentiles_are_stable():
    module = load_module()
    rows = [
        {"dialogue_ms": 100.0},
        {"dialogue_ms": 120.0},
        {"dialogue_ms": 200.0},
        {"dialogue_ms": None},
    ]

    summary = module.summarize_metric(rows, "dialogue_ms")

    assert summary["count"] == 3
    assert summary["mean_ms"] == 140.0
    assert summary["p50_ms"] == 120.0
    assert summary["p90_ms"] == 184.0
    assert summary["min_ms"] == 100.0
    assert summary["max_ms"] == 200.0


def test_render_markdown_contains_stage_and_run_tables():
    module = load_module()
    report = {
        "generated_at": "2026-03-10T12:00:00Z",
        "run_count": 2,
        "interactive_run_count": 1,
        "enterprise_run_count": 1,
        "tts_provider_baseline": "wave_fallback",
        "stage_summary": {
            "asr_ms": {"count": 1, "mean_ms": 11.0, "p50_ms": 11.0, "p90_ms": 11.0, "min_ms": 11.0, "max_ms": 11.0},
            "affect_ms": {"count": 2, "mean_ms": 20.0, "p50_ms": 20.0, "p90_ms": 20.0, "min_ms": 18.0, "max_ms": 22.0},
            "dialogue_ms": {"count": 2, "mean_ms": 30.0, "p50_ms": 30.0, "p90_ms": 30.0, "min_ms": 28.0, "max_ms": 32.0},
            "tts_ms": {"count": 2, "mean_ms": 40.0, "p50_ms": 40.0, "p90_ms": 40.0, "min_ms": 39.0, "max_ms": 41.0},
            "avatar_present_ms": {"count": 2, "mean_ms": 900.0, "p50_ms": 900.0, "p90_ms": 900.0, "min_ms": 850.0, "max_ms": 950.0},
            "total_ms": {"count": 2, "mean_ms": 990.0, "p50_ms": 990.0, "p90_ms": 990.0, "min_ms": 940.0, "max_ms": 1040.0},
        },
        "runs": [
            {
                "run_id": "text_01",
                "scenario_type": "interactive_text",
                "source_label": "text_prompt",
                "asr_ms": None,
                "affect_ms": 18.0,
                "dialogue_ms": 28.0,
                "tts_ms": 39.0,
                "avatar_present_ms": 850.0,
                "total_ms": 935.0,
                "notes": "prompt_length=10",
            },
            {
                "run_id": "enterprise_01",
                "scenario_type": "enterprise_offline_audio",
                "source_label": "noxi/sample/1",
                "asr_ms": 11.0,
                "affect_ms": 22.0,
                "dialogue_ms": 32.0,
                "tts_ms": 41.0,
                "avatar_present_ms": 950.0,
                "total_ms": 1056.0,
                "notes": "dataset=noxi",
            },
        ],
    }

    markdown = module.render_markdown(report)

    assert "# Latency Report" in markdown
    assert "| Stage | Count | Mean (ms) |" in markdown
    assert "| Run | Type | Source |" in markdown
    assert "enterprise_offline_audio" in markdown
