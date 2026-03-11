#!/usr/bin/env python3
"""Verify the session creation API against the running PostgreSQL foundation stack."""

from __future__ import annotations

import importlib.util
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


def load_gateway_module():
    spec = importlib.util.spec_from_file_location("api_gateway_main", GATEWAY_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load api gateway module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


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

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    try:
        for _ in range(20):
            try:
                with opener.open(f"{gateway_base_url}/health", timeout=2) as response:
                    if response.status == 200:
                        break
            except Exception:
                time.sleep(0.5)
        else:
            raise RuntimeError("gateway health check did not become ready")

        request = urllib.request.Request(
            f"{gateway_base_url}/api/session/create",
            data=json.dumps(
                {
                    "input_modes": ["text", "audio"],
                    "metadata": {"source": "verify_gateway_session_create"},
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with opener.open(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    finally:
        server.terminate()
        server.wait(timeout=5)

    database_url = resolve_database_url(env)

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT session_id, trace_id, status, stage, input_modes, avatar_id
                FROM sessions
                WHERE session_id = %s
                """,
                (payload["session_id"],),
            )
            row = cur.fetchone()

    if row is None:
        raise RuntimeError("created session row not found in database")
    if row["trace_id"] != payload["trace_id"]:
        raise RuntimeError("trace_id mismatch between API response and database row")

    print(
        json.dumps(
            {
                "session_id": payload["session_id"],
                "trace_id": payload["trace_id"],
                "status": payload["status"],
                "stage": payload["stage"],
                "input_modes": payload["input_modes"],
                "avatar_id": payload["avatar_id"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
