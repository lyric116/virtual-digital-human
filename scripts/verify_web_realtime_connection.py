#!/usr/bin/env python3
"""Verify frontend websocket connection, heartbeat, reconnect, and missing-session close semantics against the live gateway."""

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
HARNESS = ROOT / "scripts" / "web_realtime_harness.js"


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
            raise RuntimeError("gateway health check did not become ready for realtime verify")

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
    session_id = payload["afterConnect"]["sessionId"]

    if payload["beforeCreate"]["sessionId"] != "未创建":
        raise RuntimeError("frontend did not begin from an empty session state")
    if payload["afterConnect"]["connectionStatus"] != "connected":
        raise RuntimeError("frontend never reached connected realtime state")
    if payload["afterReconnect"]["connectionStatus"] != "connected":
        raise RuntimeError("frontend did not reconnect after forced socket drop")
    if "reconnect attempt" not in payload["afterReconnect"]["connectionLog"]:
        raise RuntimeError("frontend log did not record reconnect activity")
    if payload["missingSessionProbe"]["opened"] is not True:
        raise RuntimeError("missing-session websocket did not complete the websocket handshake")
    if payload["missingSessionProbe"]["failedAtHandshake"] is not False:
        raise RuntimeError("missing-session websocket failed during handshake instead of closing after accept")
    if payload["missingSessionProbe"]["closeCode"] != 4404:
        raise RuntimeError("missing-session websocket did not close with terminal code 4404")
    if payload["missingSessionProbe"]["closeReason"] != "session_not_found":
        raise RuntimeError("missing-session websocket did not close with reason session_not_found")

    database_url = resolve_database_url(env)
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT session_id, trace_id, status, stage
                FROM sessions
                WHERE session_id = %s
                """,
                (session_id,),
            )
            row = cur.fetchone()

    if row is None:
        raise RuntimeError(f"session row not found for realtime session {session_id}")

    print(
        json.dumps(
            {
                "before_create": payload["beforeCreate"],
                "after_connect": payload["afterConnect"],
                "after_reconnect": payload["afterReconnect"],
                "missing_session_probe": payload["missingSessionProbe"],
                "database_row": dict(row),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
