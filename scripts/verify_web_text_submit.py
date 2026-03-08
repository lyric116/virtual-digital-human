#!/usr/bin/env python3
"""Verify frontend text submission against the live gateway and PostgreSQL."""

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
HARNESS = ROOT / "scripts" / "web_text_submit_harness.js"


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


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    gateway_env = dict(env)
    gateway_env["PYTHONPATH"] = str(GATEWAY_MAIN.parent)
    gateway_env["GATEWAY_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"
    gateway_port = reserve_local_port()
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"
    gateway_ws_url = f"ws://127.0.0.1:{gateway_port}/ws"

    server = subprocess.Popen(
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
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for _ in range(20):
            try:
                with opener.open(f"{gateway_base_url}/health", timeout=2) as response:
                    if response.status == 200:
                        break
            except Exception:
                time.sleep(0.5)
        else:
            raise RuntimeError("gateway health check did not become ready for text submit verify")

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
        server.terminate()
        server.wait(timeout=5)

    payload = json.loads(result.stdout)
    session_id = payload["afterSubmit"]["sessionId"]
    message_id = payload["afterSubmit"]["lastMessageId"]

    if payload["afterSubmit"]["textSubmitState"] != "sent":
        raise RuntimeError("frontend did not reach sent state after text submit")
    if payload["afterSubmit"]["status"] != "active":
        raise RuntimeError("session did not transition to active after text submit")
    if message_id == "not sent":
        raise RuntimeError("frontend did not expose the accepted message id")

    database_url = resolve_database_url(env)
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT message_id, session_id, trace_id, role, status, source_kind, content_text, submitted_at
                FROM messages
                WHERE message_id = %s
                """,
                (message_id,),
            )
            message_row = cur.fetchone()
            cur.execute(
                """
                SELECT session_id, status, stage
                FROM sessions
                WHERE session_id = %s
                """,
                (session_id,),
            )
            session_row = cur.fetchone()

    if message_row is None:
        raise RuntimeError(f"message row not found for {message_id}")
    if session_row is None:
        raise RuntimeError(f"session row not found for {session_id}")

    print(
        json.dumps(
            {
                "before_create": payload["beforeCreate"],
                "after_connect": payload["afterConnect"],
                "after_submit": payload["afterSubmit"],
                "database_message": dict(message_row),
                "database_session": dict(session_row),
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
