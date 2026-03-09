#!/usr/bin/env python3
"""Verify dialogue fallback reply flow when the real LLM path fails."""

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
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"
HARNESS = ROOT / "scripts" / "web_mock_reply_harness.js"


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
    database_url = resolve_database_url(env)
    try:
        with psycopg.connect(database_url) as conn:
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
    for _ in range(30):
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"{label} health check did not become ready")


def stop_process(process: subprocess.Popen[str]) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    ensure_database_ready(env)

    dialogue_port = reserve_local_port()
    orchestrator_port = reserve_local_port()
    gateway_port = reserve_local_port()
    dialogue_base_url = f"http://127.0.0.1:{dialogue_port}"
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"
    gateway_ws_url = f"ws://127.0.0.1:{gateway_port}/ws"

    dialogue_env = dict(env)
    dialogue_env["PYTHONPATH"] = str(DIALOGUE_MAIN.parent)
    dialogue_env["DIALOGUE_SERVICE_PORT"] = str(dialogue_port)
    dialogue_env["DIALOGUE_SERVICE_BASE_URL"] = dialogue_base_url
    dialogue_env["DIALOGUE_FORCE_FAILURE_MODE"] = "timeout"

    orchestrator_env = dict(env)
    orchestrator_env["PYTHONPATH"] = str(ORCHESTRATOR_MAIN.parent)
    orchestrator_env["ORCHESTRATOR_PORT"] = str(orchestrator_port)
    orchestrator_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url
    orchestrator_env["DIALOGUE_SERVICE_BASE_URL"] = dialogue_base_url

    gateway_env = dict(env)
    gateway_env["PYTHONPATH"] = str(GATEWAY_MAIN.parent)
    gateway_env["GATEWAY_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"
    gateway_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url

    dialogue_service = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(DIALOGUE_MAIN.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(dialogue_port),
        ],
        cwd=ROOT,
        env=dialogue_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

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
        wait_for_health(f"{dialogue_base_url}/health", "dialogue-service")
        wait_for_health(f"{orchestrator_base_url}/health", "orchestrator")
        wait_for_health(f"{gateway_base_url}/health", "gateway")

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
                "--connect-timeout-ms",
                "8000",
                "--sent-timeout-ms",
                "12000",
                "--reply-timeout-ms",
                "15000",
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        stop_process(gateway)
        stop_process(orchestrator)
        stop_process(dialogue_service)

    if result.returncode != 0:
        raise RuntimeError(
            "web fallback harness failed: "
            f"stdout={result.stdout.strip()} stderr={result.stderr.strip()}"
        )

    payload = json.loads(result.stdout)
    session_id = payload["afterReply"]["sessionId"]

    if payload["afterReply"]["dialogueReplyState"] != "received":
        raise RuntimeError("frontend did not receive fallback dialogue reply")
    if payload["afterReply"]["stage"] not in {"engage", "assess", "intervene", "reassess", "handoff"}:
        raise RuntimeError("fallback reply did not keep a valid stage")

    database_url = resolve_database_url(env)
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT message_id, role, status, source_kind, content_text, metadata, submitted_at
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
                SELECT event_type, source_service
                FROM system_events
                WHERE session_id = %s
                ORDER BY created_at ASC
                """,
                (session_id,),
            )
            event_rows = cur.fetchall()

    if assistant_row is None:
        raise RuntimeError(f"assistant message row not found for {session_id}")
    assistant_metadata = assistant_row["metadata"] or {}
    safety_flags = assistant_metadata.get("safety_flags") or []
    if "dialogue_fallback_response" not in safety_flags:
        raise RuntimeError("assistant message does not contain dialogue_fallback_response")
    if not any(flag.startswith("dialogue_fallback_reason:") for flag in safety_flags):
        raise RuntimeError("assistant fallback reason flag is missing")
    if any(row["event_type"] == "session.error" for row in event_rows):
        raise RuntimeError("dialogue fallback flow still emitted session.error")

    print(
        json.dumps(
            {
                "before_create": payload["beforeCreate"],
                "after_connect": payload["afterConnect"],
                "after_reply": payload["afterReply"],
                "database_assistant_message": dict(assistant_row),
                "database_events": [dict(row) for row in event_rows],
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
