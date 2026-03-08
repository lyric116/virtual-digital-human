from __future__ import annotations

import argparse
import importlib.util
import io
import json
from pathlib import Path
import sys
import wave


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "write_asr_drafts.py"


def load_module():
    spec = importlib.util.spec_from_file_location("write_asr_drafts_test", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load write_asr_drafts module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def make_wave_bytes(sample_rate_hz: int = 16000, channels: int = 1, duration_frames: int = 8000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate_hz)
        handle.writeframes(b"\x00\x00" * duration_frames * channels)
    return buffer.getvalue()


def transcript_row(record_id: str) -> dict:
    return {
        "record_id": record_id,
        "workflow_status": "pending_asr",
        "next_action": "run_asr_draft",
        "asr_draft_status": "not_started",
        "asr_engine": None,
        "asr_engine_version": None,
        "asr_generated_at": None,
        "draft_text_raw": "",
        "draft_text_normalized": "",
        "draft_confidence_mean": None,
        "draft_confidence_min": None,
        "draft_confidence_max": None,
        "draft_segments": [],
        "review_status": "not_started",
        "review_decision": None,
        "final_text": "",
        "final_text_normalized": "",
        "text_status": "missing",
        "transcript_source": None,
        "locked_for_eval": False,
    }


def test_resolve_service_base_url_uses_local_loopback(monkeypatch):
    module = load_module()
    monkeypatch.setenv("ASR_SERVICE_HOST", "0.0.0.0")
    monkeypatch.setenv("ASR_SERVICE_PORT", "8020")

    assert module.resolve_service_base_url(None) == "http://127.0.0.1:8020"


def test_transcribe_service_updates_transcript_workflow(tmp_path, monkeypatch):
    module = load_module()
    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(make_wave_bytes())

    batch_path = tmp_path / "batch.jsonl"
    transcripts_path = tmp_path / "transcripts.jsonl"
    output_path = tmp_path / "results.jsonl"
    write_jsonl(
        batch_path,
        [
            {
                "record_id": "noxi/test/speaker_a/1",
                "audio_path_16k_mono": str(audio_path),
            }
        ],
    )
    write_jsonl(transcripts_path, [transcript_row("noxi/test/speaker_a/1")])

    monkeypatch.setattr(
        module,
        "transcribe_via_service",
        lambda service_base_url, resolved_audio_path, record_id: {
            "model": "qwen3-asr-flash",
            "generated_at": "2026-03-08T12:00:00+00:00",
            "confidence_mean": None,
            "transcript_segments": [],
            "transcript_text": f"draft for {record_id} from {resolved_audio_path.name}",
        },
    )

    args = argparse.Namespace(
        transcripts=transcripts_path,
        batch=batch_path,
        env_file=tmp_path / "missing.env",
        service_base_url="http://127.0.0.1:8020",
        limit=None,
        output=output_path,
        force=False,
    )
    module.cmd_transcribe_service(args)

    [updated_row] = read_jsonl(transcripts_path)
    [result_row] = read_jsonl(output_path)

    assert updated_row["workflow_status"] == "draft_ready"
    assert updated_row["next_action"] == "manual_review"
    assert updated_row["text_status"] == "asr_generated"
    assert updated_row["draft_text_raw"].startswith("draft for noxi/test/speaker_a/1")
    assert updated_row["asr_engine"] == "qwen3-asr-flash"
    assert updated_row["transcript_source"] == "asr_service_batch"
    assert result_row["record_id"] == "noxi/test/speaker_a/1"


def test_transcribe_service_keeps_pending_rows_when_transcript_is_empty(tmp_path, monkeypatch):
    module = load_module()
    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(make_wave_bytes())

    batch_path = tmp_path / "batch.jsonl"
    transcripts_path = tmp_path / "transcripts.jsonl"
    output_path = tmp_path / "results.jsonl"
    write_jsonl(
        batch_path,
        [
            {
                "record_id": "recola/test/speaker_b/1",
                "audio_path_16k_mono": str(audio_path),
            }
        ],
    )
    write_jsonl(transcripts_path, [transcript_row("recola/test/speaker_b/1")])

    monkeypatch.setattr(
        module,
        "transcribe_via_service",
        lambda service_base_url, resolved_audio_path, record_id: {
            "model": "qwen3-asr-flash",
            "generated_at": "2026-03-08T12:00:00+00:00",
            "confidence_mean": None,
            "transcript_segments": [],
            "transcript_text": "",
        },
    )

    args = argparse.Namespace(
        transcripts=transcripts_path,
        batch=batch_path,
        env_file=tmp_path / "missing.env",
        service_base_url="http://127.0.0.1:8020",
        limit=None,
        output=output_path,
        force=False,
    )
    module.cmd_transcribe_service(args)

    [updated_row] = read_jsonl(transcripts_path)

    assert updated_row["workflow_status"] == "pending_asr"
    assert updated_row["next_action"] == "run_asr_draft"
    assert updated_row["draft_text_raw"] == ""
