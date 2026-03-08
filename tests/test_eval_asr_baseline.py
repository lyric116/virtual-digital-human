from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "eval_asr_baseline.py"


def load_module():
    spec = importlib.util.spec_from_file_location("eval_asr_baseline_test", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load eval_asr_baseline module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def eligible_row(record_id: str, *, draft_text: str, final_text: str) -> dict:
    return {
        "record_id": record_id,
        "dataset": "noxi",
        "canonical_role": "speaker_a",
        "segment_id": "1",
        "audio_path_16k_mono": "data/derived/audio_16k_mono/NoXI/example.wav",
        "workflow_status": "verified",
        "locked_for_eval": True,
        "text_status": "human_verified",
        "draft_text_raw": draft_text,
        "draft_text_normalized": draft_text,
        "final_text": final_text,
        "final_text_normalized": final_text,
        "reviewer": "reviewer_a",
        "reviewed_at": "2026-03-08T16:00:00+00:00",
    }


def test_select_eligible_rows_enforces_verified_and_locked_gate():
    module = load_module()
    rows = [
        eligible_row("noxi/test/1", draft_text="bonjour", final_text="bonjour"),
        {
            **eligible_row("noxi/test/2", draft_text="bonjour", final_text="bonjour"),
            "locked_for_eval": False,
        },
        {
            **eligible_row("noxi/test/3", draft_text="bonjour", final_text="bonjour"),
            "workflow_status": "draft_ready",
        },
    ]

    eligible, gating = module.select_eligible_rows(rows)

    assert [row["record_id"] for row in eligible] == ["noxi/test/1"]
    assert gating["eligible_records"] == 1
    assert gating["not_locked_for_eval"] == 1
    assert gating["not_verified"] == 1


def test_evaluate_rows_computes_wer_and_ser_from_draft_text():
    module = load_module()
    rows = [
        eligible_row("noxi/test/1", draft_text="bonjour test final", final_text="bonjour test final"),
        eligible_row("noxi/test/2", draft_text="bonjour petit erreur", final_text="bonjour petite erreur"),
    ]

    sample_rows, metrics = module.evaluate_rows(rows, hypothesis_source="draft", service_base_url=None)

    assert metrics["sample_count"] == 2
    assert metrics["reference_token_total"] == 6
    assert metrics["edit_distance_total"] == 1
    assert metrics["wer"] == 0.166667
    assert metrics["ser"] == 0.5
    assert sample_rows[1]["sentence_error"] is True


def test_main_writes_blocked_report_when_no_locked_samples(tmp_path, monkeypatch):
    module = load_module()
    transcripts_path = tmp_path / "transcripts.jsonl"
    report_path = tmp_path / "report.md"
    details_path = tmp_path / "details.json"
    write_jsonl(
        transcripts_path,
        [
            {
                **eligible_row("noxi/test/1", draft_text="bonjour", final_text="bonjour"),
                "locked_for_eval": False,
                "workflow_status": "draft_ready",
                "text_status": "asr_generated",
                "final_text": "",
                "final_text_normalized": "",
            }
        ],
    )

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "eval_asr_baseline.py",
            "--transcripts",
            str(transcripts_path),
            "--report",
            str(report_path),
            "--details-json",
            str(details_path),
        ],
    )
    module.main()

    report = report_path.read_text(encoding="utf-8")
    details = json.loads(details_path.read_text(encoding="utf-8"))

    assert "Blocked: no transcript rows currently satisfy the formal ASR evaluation gate." in report
    assert details["status"] == "blocked"
    assert details["gating"]["eligible_records"] == 0
