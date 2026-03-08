#!/usr/bin/env python3
"""Verify frontend session export against live gateway, orchestrator, and PostgreSQL."""

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
HARNESS = ROOT / "scripts" / "web_export_harness.js"


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
    for _ in range(20):
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
    gateway_port = reserve_local_port()
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"
    gateway_ws_url = f"ws://127.0.0.1:{gateway_port}/ws"

    orchestrator_env = dict(env)
    orchestrator_env["PYTHONPATH"] = str(ORCHESTRATOR_MAIN.parent)
    orchestrator_env["ORCHESTRATOR_PORT"] = str(orchestrator_port)
    orchestrator_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url

    gateway_env = dict(env)
    gateway_env["PYTHONPATH"] = str(GATEWAY_MAIN.parent)
    gateway_env["GATEWAY_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"
    gateway_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url

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
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
    finally:
        gateway.terminate()
        gateway.wait(timeout=5)
        orchestrator.terminate()
        orchestrator.wait(timeout=5)

    payload = json.loads(result.stdout)
    after_export = payload["afterExport"]
    exported_payload = payload["exportedPayload"]
    session_id = after_export["sessionId"]

    if after_export["exportState"] != "exported":
        raise RuntimeError("frontend export state did not reach exported")
    if exported_payload["session_id"] != session_id:
        raise RuntimeError("exported payload session_id does not match current session")
    if len(exported_payload["messages"]) < 4:
        raise RuntimeError("exported payload does not contain the expected message history")
    if len(exported_payload["stage_history"]) < 3:
        raise RuntimeError("exported payload does not contain the expected stage history")
    event_types = [event["event_type"] for event in exported_payload["events"]]
    for required_event in ["session.created", "message.accepted", "dialogue.reply"]:
        if required_event not in event_types:
            raise RuntimeError(f"missing exported event type: {required_event}")

    database_url = resolve_database_url(env)
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_type, COUNT(*) AS count
                FROM system_events
                WHERE session_id = %s
                GROUP BY event_type
                ORDER BY event_type ASC
                """,
                (session_id,),
            )
            event_rows = cur.fetchall()
            cur.execute(
                """
                SELECT message_id, role, content_text, submitted_at
                FROM messages
                WHERE session_id = %s
                ORDER BY submitted_at ASC, created_at ASC, message_id ASC
                """,
                (session_id,),
            )
            message_rows = cur.fetchall()

    if not event_rows:
        raise RuntimeError(f"system_events rows not found for {session_id}")
    if len(message_rows) < 4:
        raise RuntimeError(f"expected at least four messages for {session_id}")

    print(
        json.dumps(
            {
                "before_create": payload["beforeCreate"],
                "after_connect": payload["afterConnect"],
                "after_export": after_export,
                "exported_payload": exported_payload,
                "database_event_counts": [dict(row) for row in event_rows],
                "database_messages": [dict(row) for row in message_rows],
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
