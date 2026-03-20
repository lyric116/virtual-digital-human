from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "verify_asr_regression.py"


def load_module():
    spec = importlib.util.spec_from_file_location("verify_asr_regression_test", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load verify_asr_regression module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_enforce_magicdata_thresholds_accepts_metrics_within_limit(tmp_path):
    module = load_module()
    details_path = tmp_path / "details.json"
    details_path.write_text(
        json.dumps({"metrics": {"wer": 0.05, "ser": 0.2}}, ensure_ascii=False),
        encoding="utf-8",
    )

    metrics = module.enforce_magicdata_thresholds(details_path, max_wer=0.1, max_ser=0.4)

    assert metrics["wer"] == 0.05
    assert metrics["ser"] == 0.2


def test_enforce_magicdata_thresholds_rejects_regression(tmp_path):
    module = load_module()
    details_path = tmp_path / "details.json"
    details_path.write_text(
        json.dumps({"metrics": {"wer": 0.11, "ser": 0.2}}, ensure_ascii=False),
        encoding="utf-8",
    )

    try:
        module.enforce_magicdata_thresholds(details_path, max_wer=0.1, max_ser=0.4)
    except RuntimeError as exc:
        assert "WER regression" in str(exc)
    else:
        raise AssertionError("expected threshold failure")


def test_build_parser_defaults_to_stable_magicdata_subset():
    module = load_module()
    parser = module.build_parser()

    args = parser.parse_args([])

    assert args.magicdata_core_per_group == module.DEFAULT_MAGICDATA_CORE_PER_GROUP


def test_build_parser_accepts_optional_expanded_magicdata_subset():
    module = load_module()
    parser = module.build_parser()

    args = parser.parse_args(["--magicdata-core-per-group", "24"])

    assert args.magicdata_core_per_group == 24
