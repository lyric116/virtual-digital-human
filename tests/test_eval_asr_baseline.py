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
        "split": "test",
        "canonical_role": "speaker_a",
        "segment_id": "1",
        "speaker_id": "speaker-1",
        "speaker_gender": "female",
        "speaker_dialect": "standard",
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
    assert sample_rows[0]["split"] == "test"
    assert sample_rows[0]["speaker_id"] == "speaker-1"
    assert sample_rows[0]["speaker_gender"] == "female"
    assert sample_rows[0]["speaker_dialect"] == "standard"


def test_evaluate_rows_tokenizes_chinese_at_character_level():
    module = load_module()
    rows = [
        eligible_row("magicdata/test/1", draft_text="高地地图", final_text="高德地图"),
    ]

    sample_rows, metrics = module.evaluate_rows(rows, hypothesis_source="draft", service_base_url=None)

    assert sample_rows[0]["reference_tokens"] == 4
    assert sample_rows[0]["hypothesis_tokens"] == 4
    assert sample_rows[0]["edit_distance"] == 1
    assert metrics["wer"] == 0.25
    assert metrics["ser"] == 1.0


def test_normalize_text_for_eval_collapses_magicdata_brand_and_erhua_variants():
    module = load_module()

    assert module.normalize_text_for_eval("QQ音乐。") == module.normalize_text_for_eval("口口音乐")
    assert module.normalize_text_for_eval("等一会儿再关") == module.normalize_text_for_eval("等一会再关")


def test_evaluate_rows_applies_chinese_eval_normalization_rules():
    module = load_module()
    rows = [
        eligible_row("magicdata/test/brand", draft_text="QQ音乐", final_text="口口音乐"),
        eligible_row("magicdata/test/erhua", draft_text="等一会再关", final_text="等一会儿再关"),
    ]

    sample_rows, metrics = module.evaluate_rows(rows, hypothesis_source="draft", service_base_url=None)

    assert sample_rows[0]["edit_distance"] == 0
    assert sample_rows[1]["edit_distance"] == 0
    assert metrics["edit_distance_total"] == 0
    assert metrics["wer"] == 0.0
    assert metrics["ser"] == 0.0


def test_build_summary_includes_failure_metadata_fields():
    module = load_module()
    sample_rows = [
        {
            "record_id": "magicdata/test/1",
            "split": "test",
            "speaker_id": "speaker-1",
            "speaker_gender": "female",
            "speaker_dialect": "standard",
            "sample_wer": 0.25,
            "edit_distance": 1,
            "reviewer": "reviewer_a",
        }
    ]

    transcripts_path = Path("/tmp/transcripts.jsonl")
    summary = module.build_summary(
        generated_at="2026-03-18T00:00:00+00:00",
        transcripts_path=transcripts_path,
        report_path=Path("/tmp/report.md"),
        details_path=Path("/tmp/details.json"),
        hypothesis_source="draft",
        gating={
            "total_rows": 1,
            "eligible_records": 1,
            "not_verified": 0,
            "not_locked_for_eval": 0,
            "not_human_verified": 0,
            "missing_final_text": 0,
        },
        metrics={
            "sample_count": 1,
            "reference_token_total": 4,
            "edit_distance_total": 1,
            "wer": 0.25,
            "ser": 1.0,
        },
        sample_rows=sample_rows,
    )

    assert summary["failure_examples"][0]["split"] == "test"
    assert summary["failure_examples"][0]["speaker_id"] == "speaker-1"
    assert summary["failure_examples"][0]["speaker_gender"] == "female"
    assert summary["failure_examples"][0]["speaker_dialect"] == "standard"


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
