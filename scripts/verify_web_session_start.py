#!/usr/bin/env python3
"""Verify the frontend start-session flow against a live local gateway."""

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
HARNESS = ROOT / "scripts" / "web_session_start_harness.js"


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
            raise RuntimeError("gateway health check did not become ready for web session verify")

        result = subprocess.run(
            [
                "node",
                str(HARNESS),
                "--mode",
                "live",
                "--api-base-url",
                gateway_base_url,
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
    first_session_id = payload["firstPage"]["afterCreate"]["sessionId"]
    second_session_id = payload["secondPage"]["afterCreate"]["sessionId"]

    if payload["firstPage"]["beforeCreate"]["sessionId"] != "未创建":
        raise RuntimeError("first page did not start from the default empty session state")
    if payload["secondPage"]["beforeCreate"]["sessionId"] != "未创建":
        raise RuntimeError("second page retained stale session state after refresh simulation")
    if first_session_id == second_session_id:
        raise RuntimeError("frontend generated the same session id twice")

    database_url = resolve_database_url(env)
    found_rows: list[dict[str, str]] = []

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            for session_id in [first_session_id, second_session_id]:
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
                    raise RuntimeError(f"session row not found for {session_id}")
                found_rows.append(dict(row))

    print(
        json.dumps(
            {
                "first_page": payload["firstPage"],
                "second_page": payload["secondPage"],
                "database_rows": found_rows,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
