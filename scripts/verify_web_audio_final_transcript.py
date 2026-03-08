#!/usr/bin/env python3
"""Verify frontend audio finalize -> ASR -> mock reply against live services and PostgreSQL."""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"
HARNESS = ROOT / "scripts" / "web_audio_final_transcript_harness.js"
SAMPLE_AUDIO = ROOT / "data" / "derived" / "audio_16k_mono" / "NoXI" / "001_2016-03-17_Paris" / "Expert_video" / "3.wav"


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
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


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    orchestrator_port = reserve_local_port()
    asr_port = reserve_local_port()
    gateway_port = reserve_local_port()
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"
    asr_base_url = f"http://127.0.0.1:{asr_port}"
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"
    gateway_ws_url = f"ws://127.0.0.1:{gateway_port}/ws"

    orchestrator_env = dict(env)
    orchestrator_env["PYTHONPATH"] = str(ORCHESTRATOR_MAIN.parent)
    orchestrator_env["ORCHESTRATOR_PORT"] = str(orchestrator_port)
    orchestrator_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url

    asr_env = dict(env)
    asr_env["PYTHONPATH"] = str(ASR_MAIN.parent)
    asr_env["ASR_SERVICE_HOST"] = "127.0.0.1"
    asr_env["ASR_SERVICE_PORT"] = str(asr_port)

    gateway_env = dict(env)
    gateway_env["PYTHONPATH"] = str(GATEWAY_MAIN.parent)
    gateway_env["GATEWAY_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"
    gateway_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url
    gateway_env["ASR_SERVICE_HOST"] = "127.0.0.1"
    gateway_env["ASR_SERVICE_PORT"] = str(asr_port)

    orchestrator = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(ORCHESTRATOR_MAIN.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(orchestrator_port),
        ],
        cwd=ROOT,
        env=orchestrator_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    asr_service = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(ASR_MAIN.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(asr_port),
        ],
        cwd=ROOT,
        env=asr_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    gateway = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(GATEWAY_MAIN.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(gateway_port),
        ],
        cwd=ROOT,
        env=gateway_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        wait_for_health(f"{orchestrator_base_url}/health", "orchestrator")
        wait_for_health(f"{asr_base_url}/health", "asr-service")
        wait_for_health(f"{gateway_base_url}/health", "gateway")

        try:
            result = subprocess.run(
                [
                    "node",
                    str(HARNESS),
                    "--mode",
                    "live",
                    "--api-base-url",
                    gateway_base_url,
                    "--ws-url",
                    gateway_ws_url,
                    "--sample-audio",
                    str(SAMPLE_AUDIO),
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=True,
            )
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else ""
            stdout = exc.stdout.strip() if exc.stdout else ""
            raise RuntimeError(
                f"audio final transcript harness failed: stdout={stdout} stderr={stderr}"
            ) from exc
    finally:
        gateway.terminate()
        gateway.wait(timeout=5)
        asr_service.terminate()
        asr_service.wait(timeout=5)
        orchestrator.terminate()
        orchestrator.wait(timeout=5)

    payload = json.loads(result.stdout)
    session_id = payload["afterReply"]["sessionId"]
    message_id = payload["afterReply"]["lastMessageId"]

    if payload["afterReply"]["audioUploadState"] != "completed":
        raise RuntimeError("frontend did not reach completed state after audio finalize")
    if payload["afterReply"]["dialogueReplyState"] != "received":
        raise RuntimeError("frontend did not receive assistant reply after audio finalize")
    if not payload["afterReply"]["userFinalText"].strip():
        raise RuntimeError("frontend did not expose final transcript text")

    database_url = resolve_database_url(env)
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT message_id, session_id, trace_id, role, status, source_kind, content_text, metadata, submitted_at
                FROM messages
                WHERE message_id = %s
                """,
                (message_id,),
            )
            user_message_row = cur.fetchone()
            cur.execute(
                """
                SELECT message_id, session_id, trace_id, role, status, source_kind, content_text, metadata, submitted_at
                FROM messages
                WHERE session_id = %s AND role = 'assistant'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (session_id,),
            )
            assistant_row = cur.fetchone()
            cur.execute(
                """
                SELECT media_id, session_id, media_kind, storage_path, mime_type, duration_ms, byte_size, metadata, created_at
                FROM media_indexes
                WHERE session_id = %s AND media_kind = 'audio_final'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (session_id,),
            )
            final_audio_row = cur.fetchone()

    if user_message_row is None:
        raise RuntimeError(f"audio transcript user message not found for {message_id}")
    if assistant_row is None:
        raise RuntimeError(f"assistant reply not found for session {session_id}")
    if final_audio_row is None:
        raise RuntimeError(f"final audio asset not found for session {session_id}")

    print(
        json.dumps(
            {
                "before_create": payload["beforeCreate"],
                "after_connect": payload["afterConnect"],
                "during_recording": payload["duringRecording"],
                "after_stop": payload["afterStop"],
                "after_reply": payload["afterReply"],
                "database_user_message": dict(user_message_row),
                "database_assistant_message": dict(assistant_row),
                "database_audio_final": dict(final_audio_row),
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
