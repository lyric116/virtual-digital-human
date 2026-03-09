from __future__ import annotations

import importlib.util
import io
import json
from pathlib import Path
import sys
import wave


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "prepare_magicdata_eval.py"


def load_module():
    spec = importlib.util.spec_from_file_location("prepare_magicdata_eval_test", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load prepare_magicdata_eval module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def make_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(16000)
        handle.writeframes(b"\x00\x00" * 16000)
    path.write_bytes(buffer.getvalue())


def write_fixture_dataset(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / "SPKINFO.txt").write_text(
        "\n".join(
            [
                "SPKID\tAge\tGender\tDialect",
                "dev_f_1\t20\tfemale\tbei jing",
                "dev_m_1\t21\tmale\the nan",
                "test_f_1\t22\tfemale\tshang hai",
                "test_m_1\t23\tmale\tshan dong",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (root / "dev").mkdir(parents=True, exist_ok=True)
    (root / "test").mkdir(parents=True, exist_ok=True)
    (root / "dev" / "TRANS.txt").write_text(
        "\n".join(
            [
                "UtteranceID\tSpeakerID\tTranscription",
                "dev_f_1_0001.wav\tdev_f_1\t你好世界",
                "dev_f_1_0002.wav\tdev_f_1\t打开地图",
                "dev_m_1_0001.wav\tdev_m_1\t播放音乐",
                "dev_m_1_0002.wav\tdev_m_1\t查看天气",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (root / "test" / "TRANS.txt").write_text(
        "\n".join(
            [
                "UtteranceID\tSpeakerID\tTranscription",
                "test_f_1_0001.wav\ttest_f_1\t导航到学校",
                "test_f_1_0002.wav\ttest_f_1\t打开发票",
                "test_m_1_0001.wav\ttest_m_1\t查询快递",
                "test_m_1_0002.wav\ttest_m_1\t播放新闻",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    for split, speaker, utterance in [
        ("dev", "dev_f_1", "dev_f_1_0001.wav"),
        ("dev", "dev_f_1", "dev_f_1_0002.wav"),
        ("dev", "dev_m_1", "dev_m_1_0001.wav"),
        ("dev", "dev_m_1", "dev_m_1_0002.wav"),
        ("test", "test_f_1", "test_f_1_0001.wav"),
        ("test", "test_f_1", "test_f_1_0002.wav"),
        ("test", "test_m_1", "test_m_1_0001.wav"),
        ("test", "test_m_1", "test_m_1_0002.wav"),
    ]:
        make_wav(root / split / speaker / utterance)


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def test_prepare_magicdata_eval_builds_full_and_core_outputs(tmp_path):
    module = load_module()
    extracted_root = tmp_path / "magicdata"
    write_fixture_dataset(extracted_root)
    full_output = tmp_path / "full.jsonl"
    core_output = tmp_path / "core.jsonl"
    summary_output = tmp_path / "summary.json"

    full_rows = module.build_reference_rows(extracted_root)
    core_base_rows = module.select_core_subset(full_rows, per_group=1)
    core_rows = module.freeze_core_rows(full_rows, {row["record_id"] for row in core_base_rows})
    module.write_jsonl(full_output, full_rows)
    module.write_jsonl(core_output, core_rows)
    module.write_json(
        summary_output,
        module.build_summary(
            extracted_root=extracted_root,
            full_rows=full_rows,
            core_rows=core_rows,
            core_per_group=1,
        ),
    )

    loaded_full = read_jsonl(full_output)
    loaded_core = read_jsonl(core_output)
    summary = json.loads(summary_output.read_text(encoding="utf-8"))

    assert len(loaded_full) == 8
    assert len(loaded_core) == 4
    assert all(row["dataset"] == "magicdata_zh" for row in loaded_full)
    assert all(row["language"] == "zh-CN" for row in loaded_full)
    assert all(row["audio_path"] == row["audio_path_16k_mono"] for row in loaded_full)
    assert all(row["locked_for_eval"] is False for row in loaded_full)
    assert all(row["locked_for_eval"] is True for row in loaded_core)
    assert {row["split"] for row in loaded_core} == {"dev", "test"}
    assert {row["speaker_gender"] for row in loaded_core} == {"female", "male"}
    assert summary["full_reference_records"] == 8
    assert summary["core_eval_records"] == 4
    assert summary["selection_strategy"] == "round_robin_by_split_gender_then_speaker"
    assert summary["core_per_group_target"] == 1
    assert summary["audio_format_examples"]["dev"]["sample_rate_hz"] == 16000
