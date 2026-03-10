#!/usr/bin/env python3
"""Verify full trace logging across audio input, affect, retrieval, dialogue, TTS, and avatar events."""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"
AFFECT_MAIN = ROOT / "services" / "affect-service" / "main.py"
RAG_MAIN = ROOT / "services" / "rag-service" / "main.py"
TTS_MAIN = ROOT / "services" / "tts-service" / "main.py"
SAMPLE_AUDIO = (
    ROOT
    / "data"
    / "derived"
    / "audio_16k_mono"
    / "NoXI"
    / "001_2016-03-17_Paris"
    / "Expert_video"
    / "3.wav"
)
RECORD_ID = "noxi/001_2016-03-17_Paris/speaker_a/3"


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


def resolve_database_url(env: dict[str, str]) -> str:
    database_url = env.get("DATABASE_URL") or env.get("POSTGRES_URL")
    if database_url:
        return database_url
    return (
        f"postgresql://{env.get('POSTGRES_USER', 'app')}:{env.get('POSTGRES_PASSWORD', 'change_me')}"
        f"@{env.get('POSTGRES_HOST', 'localhost')}:{env.get('POSTGRES_PORT', '5432')}"
        f"/{env.get('POSTGRES_DB', 'virtual_human')}"
    )


def ensure_database_ready(env: dict[str, str]) -> None:
    try:
        with psycopg.connect(resolve_database_url(env)) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
    except psycopg.Error as exc:
        raise RuntimeError(
            "postgres is not reachable; start the foundation stack first with "
            "`docker compose -f infra/compose/docker-compose.yml up -d`"
        ) from exc


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_health(url: str, label: str) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(40):
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"{label} health check did not become ready")


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


def request_json(method: str, url: str, *, payload: dict | None = None, body: bytes | None = None, headers: dict[str, str] | None = None) -> dict:
    data = body
    request_headers = dict(headers or {})
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(url=url, data=data, headers=request_headers, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=90) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"http {exc.code} {url}: {detail}") from exc


def fetch_export(gateway_base_url: str, session_id: str) -> dict:
    return request_json(
        "GET",
        f"{gateway_base_url}/api/session/{urllib.parse.quote(session_id)}/export",
        headers={"Accept": "application/json"},
    )


def wait_for_trace_events(gateway_base_url: str, session_id: str) -> dict:
    required = {"transcript.final", "message.accepted", "affect.snapshot", "knowledge.retrieved", "dialogue.reply"}
    deadline = time.time() + 90
    last_export: dict | None = None
    while time.time() < deadline:
        exported = fetch_export(gateway_base_url, session_id)
        event_types = {event["event_type"] for event in exported["events"]}
        if required.issubset(event_types):
            return exported
        last_export = exported
        time.sleep(1)
    raise RuntimeError(f"trace events not ready, last export={json.dumps(last_export, ensure_ascii=False)[:1200]}")


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    ensure_database_ready(env)

    dialogue_port = reserve_local_port()
    orchestrator_port = reserve_local_port()
    asr_port = reserve_local_port()
    affect_port = reserve_local_port()
    rag_port = reserve_local_port()
    tts_port = reserve_local_port()
    gateway_port = reserve_local_port()

    dialogue_base_url = f"http://127.0.0.1:{dialogue_port}"
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"
    asr_base_url = f"http://127.0.0.1:{asr_port}"
    affect_base_url = f"http://127.0.0.1:{affect_port}"
    rag_base_url = f"http://127.0.0.1:{rag_port}"
    tts_base_url = f"http://127.0.0.1:{tts_port}"
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"

    dialogue_env = dict(env)
    dialogue_env["PYTHONPATH"] = str(DIALOGUE_MAIN.parent)
    dialogue_env["DIALOGUE_SERVICE_PORT"] = str(dialogue_port)
    dialogue_env["DIALOGUE_SERVICE_BASE_URL"] = dialogue_base_url

    orchestrator_env = dict(env)
    orchestrator_env["PYTHONPATH"] = str(ORCHESTRATOR_MAIN.parent)
    orchestrator_env["ORCHESTRATOR_PORT"] = str(orchestrator_port)
    orchestrator_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url
    orchestrator_env["DIALOGUE_SERVICE_BASE_URL"] = dialogue_base_url
    orchestrator_env["RAG_SERVICE_BASE_URL"] = rag_base_url

    asr_env = dict(env)
    asr_env["PYTHONPATH"] = str(ASR_MAIN.parent)
    asr_env["ASR_SERVICE_HOST"] = "127.0.0.1"
    asr_env["ASR_SERVICE_PORT"] = str(asr_port)

    affect_env = dict(env)
    affect_env["PYTHONPATH"] = str(AFFECT_MAIN.parent)
    affect_env["AFFECT_SERVICE_HOST"] = "127.0.0.1"
    affect_env["AFFECT_SERVICE_PORT"] = str(affect_port)

    rag_env = dict(env)
    rag_env["PYTHONPATH"] = str(RAG_MAIN.parent)
    rag_env["RAG_SERVICE_HOST"] = "127.0.0.1"
    rag_env["RAG_SERVICE_PORT"] = str(rag_port)

    tts_env = dict(env)
    tts_env["PYTHONPATH"] = str(TTS_MAIN.parent)
    tts_env["TTS_SERVICE_HOST"] = "127.0.0.1"
    tts_env["TTS_SERVICE_PORT"] = str(tts_port)
    tts_env["TTS_SERVICE_BASE_URL"] = tts_base_url

    gateway_env = dict(env)
    gateway_env["PYTHONPATH"] = str(GATEWAY_MAIN.parent)
    gateway_env["GATEWAY_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"
    gateway_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url
    gateway_env["ASR_SERVICE_HOST"] = "127.0.0.1"
    gateway_env["ASR_SERVICE_PORT"] = str(asr_port)
    gateway_env["AFFECT_SERVICE_BASE_URL"] = affect_base_url

    processes = [
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "--app-dir", str(DIALOGUE_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(dialogue_port)],
            cwd=ROOT,
            env=dialogue_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        ),
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "--app-dir", str(ORCHESTRATOR_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(orchestrator_port)],
            cwd=ROOT,
            env=orchestrator_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        ),
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "--app-dir", str(ASR_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(asr_port)],
            cwd=ROOT,
            env=asr_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        ),
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "--app-dir", str(AFFECT_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(affect_port)],
            cwd=ROOT,
            env=affect_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        ),
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "--app-dir", str(RAG_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(rag_port)],
            cwd=ROOT,
            env=rag_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        ),
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "--app-dir", str(TTS_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(tts_port)],
            cwd=ROOT,
            env=tts_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        ),
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "--app-dir", str(GATEWAY_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(gateway_port)],
            cwd=ROOT,
            env=gateway_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        ),
    ]

    try:
        wait_for_health(f"{dialogue_base_url}/health", "dialogue-service")
        wait_for_health(f"{orchestrator_base_url}/health", "orchestrator")
        wait_for_health(f"{asr_base_url}/health", "asr-service")
        wait_for_health(f"{affect_base_url}/health", "affect-service")
        wait_for_health(f"{rag_base_url}/health", "rag-service")
        wait_for_health(f"{tts_base_url}/health", "tts-service")
        wait_for_health(f"{gateway_base_url}/health", "gateway")

        session = request_json(
            "POST",
            f"{gateway_base_url}/api/session/create",
            payload={
                "input_modes": ["audio", "video"],
                "avatar_id": "companion_female_01",
                "record_id": RECORD_ID,
                "dataset": "noxi",
                "canonical_role": "speaker_a",
                "segment_id": "3",
                "metadata": {"source": "verify_session_trace_logging"},
            },
        )
        session_id = session["session_id"]
        trace_id = session["trace_id"]

        audio_payload = request_json(
            "POST",
            f"{gateway_base_url}/api/session/{urllib.parse.quote(session_id)}/audio/finalize?duration_ms=740",
            body=SAMPLE_AUDIO.read_bytes(),
            headers={"Content-Type": "audio/wav"},
        )
        if audio_payload["source_kind"] != "audio":
            raise RuntimeError("audio finalize did not return an audio-backed accepted message")

        exported = wait_for_trace_events(gateway_base_url, session_id)
        assistant_messages = [message for message in exported["messages"] if message["role"] == "assistant"]
        if not assistant_messages:
            raise RuntimeError("assistant reply was not persisted before export inspection")
        assistant_message = assistant_messages[-1]

        tts_payload = request_json(
            "POST",
            f"{tts_base_url}/internal/tts/synthesize",
            payload={
                "text": assistant_message["content_text"],
                "voice_id": "companion_female_01",
                "session_id": session_id,
                "trace_id": trace_id,
                "message_id": assistant_message["message_id"],
                "subtitle": assistant_message["content_text"],
            },
        )

        runtime_events = [
            (
                "tts.synthesized",
                {
                    "tts_id": tts_payload.get("tts_id"),
                    "voice_id": tts_payload.get("voice_id"),
                    "audio_format": tts_payload.get("audio_format"),
                    "duration_ms": tts_payload.get("duration_ms"),
                    "provider_used": tts_payload.get("provider_used"),
                },
            ),
            (
                "tts.playback.started",
                {
                    "voice_id": tts_payload.get("voice_id"),
                    "audio_format": tts_payload.get("audio_format"),
                    "duration_ms": tts_payload.get("duration_ms"),
                },
            ),
            (
                "avatar.command",
                {
                    "command": "speak",
                    "avatar_id": "companion_female_01",
                    "stage": exported["stage"],
                    "risk_level": assistant_message["metadata"].get("risk_level"),
                    "expression_preset": "steady_support",
                },
            ),
            (
                "tts.playback.ended",
                {
                    "voice_id": tts_payload.get("voice_id"),
                    "audio_format": tts_payload.get("audio_format"),
                    "duration_ms": tts_payload.get("duration_ms"),
                },
            ),
            (
                "avatar.command",
                {
                    "command": "idle",
                    "avatar_id": "companion_female_01",
                    "stage": exported["stage"],
                    "risk_level": assistant_message["metadata"].get("risk_level"),
                    "expression_preset": "calm_checkin",
                },
            ),
        ]

        for event_type, payload in runtime_events:
            request_json(
                "POST",
                f"{gateway_base_url}/api/session/{urllib.parse.quote(session_id)}/runtime-event",
                payload={
                    "event_type": event_type,
                    "message_id": assistant_message["message_id"],
                    "payload": payload,
                },
            )

        exported = fetch_export(gateway_base_url, session_id)
        ordered_types = [event["event_type"] for event in exported["events"]]
        required_types = {
            "session.created",
            "transcript.final",
            "message.accepted",
            "affect.snapshot",
            "knowledge.retrieved",
            "dialogue.reply",
            "tts.synthesized",
            "tts.playback.started",
            "tts.playback.ended",
            "avatar.command",
        }
        missing = sorted(required_types.difference(ordered_types))
        if missing:
            raise RuntimeError(f"missing trace events: {missing}")
        if ordered_types.index("knowledge.retrieved") > ordered_types.index("dialogue.reply"):
            raise RuntimeError("knowledge.retrieved was logged after dialogue.reply")

        for event in exported["events"]:
            if event["event_type"] not in required_types:
                continue
            payload = event["payload"]
            if payload.get("record_id") != RECORD_ID:
                raise RuntimeError(f"event missing record_id lineage: {event['event_type']}")
            if payload.get("dataset") != "noxi":
                raise RuntimeError(f"event missing dataset lineage: {event['event_type']}")
            if payload.get("canonical_role") != "speaker_a":
                raise RuntimeError(f"event missing canonical_role lineage: {event['event_type']}")
            if payload.get("segment_id") != "3":
                raise RuntimeError(f"event missing segment_id lineage: {event['event_type']}")

        knowledge_event = next(event for event in exported["events"] if event["event_type"] == "knowledge.retrieved")
        if not knowledge_event["payload"].get("source_ids"):
            raise RuntimeError("knowledge.retrieved did not contain source_ids")

        print(
            json.dumps(
                {
                    "session_id": session_id,
                    "trace_id": trace_id,
                    "assistant_message_id": assistant_message["message_id"],
                    "event_types": ordered_types,
                    "tts_provider_used": tts_payload.get("provider_used"),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    finally:
        for process in reversed(processes):
            stop_process(process)


if __name__ == "__main__":
    main()
