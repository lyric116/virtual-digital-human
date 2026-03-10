#!/usr/bin/env python3
"""Build a baseline latency report across affect, dialogue, TTS, avatar, and one offline ASR sample."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import socket
import statistics
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import wave


ROOT = Path(__file__).resolve().parents[1]
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"
RAG_MAIN = ROOT / "services" / "rag-service" / "main.py"
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"
AFFECT_MAIN = ROOT / "services" / "affect-service" / "main.py"
TTS_MAIN = ROOT / "services" / "tts-service" / "main.py"
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"
MANIFEST = ROOT / "data" / "manifests" / "val_manifest.jsonl"
TRANSCRIPTS = ROOT / "data" / "derived" / "transcripts" / "val_transcripts_template.jsonl"
REPORT_MD = ROOT / "data" / "derived" / "eval-local" / "latency_report.md"
REPORT_JSON = ROOT / "data" / "derived" / "eval-local" / "latency_report.json"
LATENCY_TTS_PROVIDER = "wave_fallback"

TEXT_PROMPTS = [
    "我这两天总是睡不好，脑子停不下来。",
    "我今天一整天都很紧绷，回到宿舍也放不下来。",
    "晚上越想快点睡着，反而越清醒。",
    "我知道自己应该休息，但总觉得还有事情没处理完。",
    "我现在不算特别危险，就是一直很焦虑，想先慢一点。",
]
ENTERPRISE_RECORD_ID = "noxi/001_2016-03-17_Paris/speaker_a/3"
ENTERPRISE_CLIP_SECONDS = 5.0


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" in line:
            key, value = line.split("=", 1)
        elif ":" in line:
            key, value = line.split(":", 1)
        else:
            continue
        values[key.strip()] = value.strip().strip("'").strip('"')
    return values


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_health(url: str, label: str) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(60):
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"{label} health check did not become ready")


def post_json(url: str, payload: dict, *, timeout: int = 180) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def post_audio(url: str, audio_path: Path, record_id: str, *, timeout: int = 180) -> dict:
    request = urllib.request.Request(
        f"{url}?{urllib.parse.urlencode({'filename': audio_path.name, 'record_id': record_id})}",
        data=audio_path.read_bytes(),
        headers={"Content-Type": "audio/wav"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            return


def load_manifest_row(record_id: str) -> dict[str, object]:
    for raw_line in MANIFEST.read_text(encoding="utf-8").splitlines():
        payload = json.loads(raw_line)
        if payload.get("record_id") == record_id:
            return payload
    raise RuntimeError(f"missing manifest row for {record_id}")


def load_transcript_row(record_id: str) -> dict[str, object]:
    for raw_line in TRANSCRIPTS.read_text(encoding="utf-8").splitlines():
        payload = json.loads(raw_line)
        if payload.get("record_id") == record_id:
            return payload
    raise RuntimeError(f"missing transcript row for {record_id}")


def build_latency_clip(audio_path: Path, *, clip_seconds: float) -> tuple[Path, float]:
    output_path = REPORT_MD.parent / f"{audio_path.stem}_latency_clip.wav"
    with wave.open(str(audio_path), "rb") as source:
        sample_rate_hz = source.getframerate()
        frame_count = source.getnframes()
        clip_frames = min(frame_count, int(sample_rate_hz * clip_seconds))
        frames = source.readframes(clip_frames)
        actual_seconds = clip_frames / sample_rate_hz
        with wave.open(str(output_path), "wb") as target:
            target.setnchannels(source.getnchannels())
            target.setsampwidth(source.getsampwidth())
            target.setframerate(sample_rate_hz)
            target.writeframes(frames)
    return output_path, round(actual_seconds, 2)


def percentile(values: list[float], ratio: float) -> float | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    sorted_values = sorted(values)
    position = (len(sorted_values) - 1) * ratio
    lower_index = math.floor(position)
    upper_index = math.ceil(position)
    if lower_index == upper_index:
        return sorted_values[lower_index]
    lower_value = sorted_values[lower_index]
    upper_value = sorted_values[upper_index]
    weight = position - lower_index
    return lower_value + (upper_value - lower_value) * weight


def summarize_metric(rows: list[dict[str, object]], key: str) -> dict[str, float | int | None]:
    values = [float(row[key]) for row in rows if isinstance(row.get(key), (int, float))]
    if not values:
        return {
            "count": 0,
            "mean_ms": None,
            "p50_ms": None,
            "p90_ms": None,
            "min_ms": None,
            "max_ms": None,
        }
    return {
        "count": len(values),
        "mean_ms": round(statistics.fmean(values), 2),
        "p50_ms": round(percentile(values, 0.5) or 0, 2),
        "p90_ms": round(percentile(values, 0.9) or 0, 2),
        "min_ms": round(min(values), 2),
        "max_ms": round(max(values), 2),
    }


def format_metric_value(value: float | int | None) -> str:
    if value is None:
        return "-"
    return f"{value:.2f}"


def render_markdown(report: dict[str, object]) -> str:
    lines = [
        "# Latency Report",
        "",
        f"- Generated at: {report['generated_at']}",
        f"- Run count: {report['run_count']}",
        f"- Interactive runs: {report['interactive_run_count']}",
        f"- Enterprise offline runs: {report['enterprise_run_count']}",
        f"- TTS provider baseline: {report['tts_provider_baseline']}",
        "",
        "## Stage Summary",
        "",
        "| Stage | Count | Mean (ms) | P50 (ms) | P90 (ms) | Min (ms) | Max (ms) |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for key, label in [
        ("asr_ms", "ASR"),
        ("affect_ms", "Affect"),
        ("dialogue_ms", "Dialogue"),
        ("tts_ms", "TTS"),
        ("avatar_present_ms", "Avatar Present"),
        ("total_ms", "Total"),
    ]:
        summary = report["stage_summary"][key]
        lines.append(
            "| {label} | {count} | {mean} | {p50} | {p90} | {minv} | {maxv} |".format(
                label=label,
                count=summary["count"],
                mean=format_metric_value(summary["mean_ms"]),
                p50=format_metric_value(summary["p50_ms"]),
                p90=format_metric_value(summary["p90_ms"]),
                minv=format_metric_value(summary["min_ms"]),
                maxv=format_metric_value(summary["max_ms"]),
            )
        )

    lines.extend([
        "",
        "## Run Details",
        "",
        "| Run | Type | Source | ASR (ms) | Affect (ms) | Dialogue (ms) | TTS (ms) | Avatar (ms) | Total (ms) | Notes |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ])
    for row in report["runs"]:
        lines.append(
            "| {run_id} | {scenario_type} | {source_label} | {asr} | {affect} | {dialogue} | {tts} | {avatar} | {total} | {notes} |".format(
                run_id=row["run_id"],
                scenario_type=row["scenario_type"],
                source_label=row["source_label"],
                asr=format_metric_value(row.get("asr_ms")),
                affect=format_metric_value(row.get("affect_ms")),
                dialogue=format_metric_value(row.get("dialogue_ms")),
                tts=format_metric_value(row.get("tts_ms")),
                avatar=format_metric_value(row.get("avatar_present_ms")),
                total=format_metric_value(row.get("total_ms")),
                notes=row.get("notes", ""),
            )
        )
    return "\n".join(lines) + "\n"


def build_affect_payload(
    *,
    session_id: str,
    trace_id: str,
    current_stage: str,
    text_input: str,
    metadata: dict[str, object],
    last_source_kind: str,
) -> dict[str, object]:
    return {
        "session_id": session_id,
        "trace_id": trace_id,
        "current_stage": current_stage,
        "text_input": text_input,
        "last_source_kind": last_source_kind,
        "metadata": metadata,
        "capture_state": {
            "camera_state": "offline",
            "recording_state": "stopped",
            "uploaded_chunk_count": 0,
            "uploaded_video_frame_count": 0,
        },
    }


def run_text_interaction(index: int, text: str, base_urls: dict[str, str]) -> dict[str, object]:
    session_id = f"sess_latency_text_{index:03d}"
    trace_id = f"trace_latency_text_{index:03d}"
    user_message_id = f"msg_latency_text_{index:03d}"

    started_at = time.perf_counter()
    sys.stdout.write(f"[latency] interactive_text {index}/5 start\n")
    sys.stdout.flush()
    affect_started = time.perf_counter()
    affect_payload = post_json(
        f"{base_urls['affect']}/internal/affect/analyze",
        build_affect_payload(
            session_id=session_id,
            trace_id=trace_id,
            current_stage="assess",
            text_input=text,
            metadata={"source": "latency_report_text"},
            last_source_kind="text",
        ),
    )
    affect_ms = round((time.perf_counter() - affect_started) * 1000, 2)

    dialogue_started = time.perf_counter()
    dialogue_payload = post_json(
        f"{base_urls['orchestrator']}/internal/dialogue/respond",
        {
            "session_id": session_id,
            "trace_id": trace_id,
            "user_message_id": user_message_id,
            "content_text": text,
            "current_stage": "assess",
            "metadata": {
                "source": "latency_report_text",
                "affect_snapshot": affect_payload,
            },
        },
        timeout=240,
    )
    dialogue_ms = round((time.perf_counter() - dialogue_started) * 1000, 2)

    tts_started = time.perf_counter()
    tts_payload = post_json(
        f"{base_urls['tts']}/internal/tts/synthesize",
        {
            "text": dialogue_payload["reply"],
            "voice_id": "companion_female_01",
            "session_id": session_id,
            "trace_id": trace_id,
            "message_id": dialogue_payload["message_id"],
            "subtitle": dialogue_payload["reply"],
        },
        timeout=240,
    )
    tts_ms = round((time.perf_counter() - tts_started) * 1000, 2)

    avatar_present_ms = float(tts_payload["duration_ms"])
    total_ms = round((time.perf_counter() - started_at) * 1000 + avatar_present_ms, 2)
    return {
        "run_id": f"text_{index:02d}",
        "scenario_type": "interactive_text",
        "source_label": "text_prompt",
        "asr_ms": None,
        "affect_ms": affect_ms,
        "dialogue_ms": dialogue_ms,
        "tts_ms": tts_ms,
        "avatar_present_ms": avatar_present_ms,
        "total_ms": total_ms,
        "reply_stage": dialogue_payload["stage"],
        "reply_risk_level": dialogue_payload["risk_level"],
        "tts_provider": tts_payload.get("provider_used"),
        "notes": f"prompt_length={len(text)}",
    }


def run_enterprise_interaction(record_id: str, base_urls: dict[str, str]) -> dict[str, object]:
    manifest_row = load_manifest_row(record_id)
    transcript_row = load_transcript_row(record_id)
    source_audio_path = ROOT / str(manifest_row["audio_path_16k_mono"])
    audio_path, clip_seconds = build_latency_clip(
        source_audio_path,
        clip_seconds=ENTERPRISE_CLIP_SECONDS,
    )
    face3d_path = ROOT / str(manifest_row["face3d_path"])
    session_id = "sess_latency_enterprise_001"
    trace_id = "trace_latency_enterprise_001"
    user_message_id = "msg_latency_enterprise_001"

    started_at = time.perf_counter()
    sys.stdout.write(f"[latency] enterprise_offline_audio start {record_id}\n")
    sys.stdout.flush()
    asr_started = time.perf_counter()
    asr_notes: list[str] = []
    try:
        asr_payload = post_audio(
            f"{base_urls['asr']}/api/asr/transcribe",
            audio_path,
            record_id,
            timeout=45,
        )
        transcript_text = str(asr_payload["transcript_text"]).strip()
        if not transcript_text:
            raise RuntimeError("empty transcript_text from asr-service")
    except Exception as exc:
        transcript_text = str(
            transcript_row.get("final_text")
            or transcript_row.get("draft_text_raw")
            or ""
        ).strip()
        if not transcript_text:
            raise RuntimeError(f"enterprise latency fallback missing transcript for {record_id}") from exc
        asr_notes.append(
            f"asr_fallback=cached_transcript reason={type(exc).__name__}"
        )
    asr_ms = round((time.perf_counter() - asr_started) * 1000, 2)

    affect_started = time.perf_counter()
    affect_payload = post_json(
        f"{base_urls['affect']}/internal/affect/analyze",
        build_affect_payload(
            session_id=session_id,
            trace_id=trace_id,
            current_stage="assess",
            text_input=transcript_text,
            metadata={
                "source": "latency_report_enterprise",
                "dataset": manifest_row["dataset"],
                "record_id": record_id,
                "audio_path_16k_mono": str(audio_path),
                "face3d_path": str(face3d_path),
            },
            last_source_kind="audio",
        ),
    )
    affect_ms = round((time.perf_counter() - affect_started) * 1000, 2)

    dialogue_started = time.perf_counter()
    dialogue_payload = post_json(
        f"{base_urls['orchestrator']}/internal/dialogue/respond",
        {
            "session_id": session_id,
            "trace_id": trace_id,
            "user_message_id": user_message_id,
            "content_text": transcript_text,
            "current_stage": "assess",
            "metadata": {
                "source": "latency_report_enterprise",
                "dataset": manifest_row["dataset"],
                "record_id": record_id,
                "affect_snapshot": affect_payload,
            },
        },
        timeout=240,
    )
    dialogue_ms = round((time.perf_counter() - dialogue_started) * 1000, 2)

    tts_started = time.perf_counter()
    tts_payload = post_json(
        f"{base_urls['tts']}/internal/tts/synthesize",
        {
            "text": dialogue_payload["reply"],
            "voice_id": "companion_female_01",
            "session_id": session_id,
            "trace_id": trace_id,
            "message_id": dialogue_payload["message_id"],
            "subtitle": dialogue_payload["reply"],
        },
        timeout=240,
    )
    tts_ms = round((time.perf_counter() - tts_started) * 1000, 2)

    avatar_present_ms = float(tts_payload["duration_ms"])
    total_ms = round((time.perf_counter() - started_at) * 1000 + avatar_present_ms, 2)
    return {
        "run_id": "enterprise_01",
        "scenario_type": "enterprise_offline_audio",
        "source_label": f"{record_id}:first_{clip_seconds:.2f}s",
        "asr_ms": asr_ms,
        "affect_ms": affect_ms,
        "dialogue_ms": dialogue_ms,
        "tts_ms": tts_ms,
        "avatar_present_ms": avatar_present_ms,
        "total_ms": total_ms,
        "reply_stage": dialogue_payload["stage"],
        "reply_risk_level": dialogue_payload["risk_level"],
        "tts_provider": tts_payload.get("provider_used"),
        "notes": " ".join(filter(None, [
            f"dataset={manifest_row['dataset']} canonical_role={manifest_row['canonical_role']} "
            f"clip_seconds={clip_seconds:.2f}",
            *asr_notes,
        ])),
    }


def launch_service(main_path: Path, port: int, env: dict[str, str]) -> subprocess.Popen[str]:
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(main_path.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def generate_report() -> dict[str, object]:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    if not env.get("LLM_API_KEY"):
        raise RuntimeError("missing LLM_API_KEY for latency evaluation")
    if not env.get("ASR_API_KEY"):
        raise RuntimeError("missing ASR_API_KEY for latency evaluation")

    dialogue_port = reserve_local_port()
    rag_port = reserve_local_port()
    orchestrator_port = reserve_local_port()
    affect_port = reserve_local_port()
    tts_port = reserve_local_port()
    asr_port = reserve_local_port()

    base_urls = {
        "dialogue": f"http://127.0.0.1:{dialogue_port}",
        "rag": f"http://127.0.0.1:{rag_port}",
        "orchestrator": f"http://127.0.0.1:{orchestrator_port}",
        "affect": f"http://127.0.0.1:{affect_port}",
        "tts": f"http://127.0.0.1:{tts_port}",
        "asr": f"http://127.0.0.1:{asr_port}",
    }

    dialogue_env = dict(env)
    dialogue_env["PYTHONPATH"] = str(DIALOGUE_MAIN.parent)
    dialogue_env["DIALOGUE_SERVICE_HOST"] = "127.0.0.1"
    dialogue_env["DIALOGUE_SERVICE_PORT"] = str(dialogue_port)
    dialogue_env["DIALOGUE_SERVICE_BASE_URL"] = base_urls["dialogue"]

    rag_env = dict(env)
    rag_env["PYTHONPATH"] = str(RAG_MAIN.parent)
    rag_env["RAG_SERVICE_HOST"] = "127.0.0.1"
    rag_env["RAG_SERVICE_PORT"] = str(rag_port)
    rag_env["RAG_SERVICE_BASE_URL"] = base_urls["rag"]

    orchestrator_env = dict(env)
    orchestrator_env["PYTHONPATH"] = str(ORCHESTRATOR_MAIN.parent)
    orchestrator_env["ORCHESTRATOR_HOST"] = "127.0.0.1"
    orchestrator_env["ORCHESTRATOR_PORT"] = str(orchestrator_port)
    orchestrator_env["ORCHESTRATOR_BASE_URL"] = base_urls["orchestrator"]
    orchestrator_env["DIALOGUE_SERVICE_BASE_URL"] = base_urls["dialogue"]
    orchestrator_env["RAG_SERVICE_BASE_URL"] = base_urls["rag"]

    affect_env = dict(env)
    affect_env["PYTHONPATH"] = str(AFFECT_MAIN.parent)
    affect_env["AFFECT_SERVICE_HOST"] = "127.0.0.1"
    affect_env["AFFECT_SERVICE_PORT"] = str(affect_port)
    affect_env["AFFECT_SERVICE_BASE_URL"] = base_urls["affect"]

    tts_env = dict(env)
    tts_env["PYTHONPATH"] = str(TTS_MAIN.parent)
    tts_env["TTS_SERVICE_HOST"] = "127.0.0.1"
    tts_env["TTS_SERVICE_PORT"] = str(tts_port)
    tts_env["TTS_SERVICE_BASE_URL"] = base_urls["tts"]
    tts_env["TTS_PROVIDER"] = LATENCY_TTS_PROVIDER
    tts_env["TTS_AUDIO_FORMAT"] = "wav"
    tts_env["TTS_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"

    asr_env = dict(env)
    asr_env["PYTHONPATH"] = str(ASR_MAIN.parent)
    asr_env["ASR_SERVICE_PORT"] = str(asr_port)
    asr_env["ASR_TIMEOUT_SECONDS"] = "25"

    processes = [
        launch_service(DIALOGUE_MAIN, dialogue_port, dialogue_env),
        launch_service(RAG_MAIN, rag_port, rag_env),
        launch_service(ORCHESTRATOR_MAIN, orchestrator_port, orchestrator_env),
        launch_service(AFFECT_MAIN, affect_port, affect_env),
        launch_service(TTS_MAIN, tts_port, tts_env),
        launch_service(ASR_MAIN, asr_port, asr_env),
    ]

    try:
        wait_for_health(f"{base_urls['dialogue']}/health", "dialogue-service")
        wait_for_health(f"{base_urls['rag']}/health", "rag-service")
        wait_for_health(f"{base_urls['orchestrator']}/health", "orchestrator")
        wait_for_health(f"{base_urls['affect']}/health", "affect-service")
        wait_for_health(f"{base_urls['tts']}/health", "tts-service")
        wait_for_health(f"{base_urls['asr']}/health", "asr-service")

        runs: list[dict[str, object]] = []
        for index, text in enumerate(TEXT_PROMPTS, start=1):
            runs.append(run_text_interaction(index, text, base_urls))
        runs.append(run_enterprise_interaction(ENTERPRISE_RECORD_ID, base_urls))
    finally:
        for process in reversed(processes):
            stop_process(process)

    stage_summary = {
        key: summarize_metric(runs, key)
        for key in ("asr_ms", "affect_ms", "dialogue_ms", "tts_ms", "avatar_present_ms", "total_ms")
    }
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "run_count": len(runs),
        "interactive_run_count": len([row for row in runs if row["scenario_type"] == "interactive_text"]),
        "enterprise_run_count": len([row for row in runs if row["scenario_type"] == "enterprise_offline_audio"]),
        "tts_provider_baseline": LATENCY_TTS_PROVIDER,
        "stage_summary": stage_summary,
        "runs": runs,
    }
    REPORT_MD.parent.mkdir(parents=True, exist_ok=True)
    REPORT_MD.write_text(render_markdown(report), encoding="utf-8")
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> None:
    report = generate_report()
    sys.stdout.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
