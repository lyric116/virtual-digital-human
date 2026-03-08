#!/usr/bin/env python3
"""Verify live audio chunk storage against the gateway and PostgreSQL."""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request

import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"


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


def wait_for_health(base_url: str) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(20):
        try:
            with opener.open(f"{base_url}/health", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("gateway health check did not become ready for audio chunk verify")


def post_json(url: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def post_audio_chunk(
    *,
    base_url: str,
    session_id: str,
    chunk_seq: int,
    chunk_started_at_ms: int,
    duration_ms: int,
    is_final: bool,
    body: bytes,
) -> dict:
    query = urllib.parse.urlencode(
        {
            "chunk_seq": chunk_seq,
            "chunk_started_at_ms": chunk_started_at_ms,
            "duration_ms": duration_ms,
            "is_final": "true" if is_final else "false",
        }
    )
    request = urllib.request.Request(
        f"{base_url}/api/session/{session_id}/audio/chunk?{query}",
        data=body,
        headers={"Content-Type": "audio/webm"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


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
        wait_for_health(gateway_base_url)
        session = post_json(
            f"{gateway_base_url}/api/session/create",
            {
                "input_modes": ["audio"],
                "avatar_id": env.get("WEB_DEFAULT_AVATAR_ID", "companion_female_01"),
                "metadata": {"source": "verify_audio_chunk_upload"},
            },
        )
        uploads = [
            post_audio_chunk(
                base_url=gateway_base_url,
                session_id=session["session_id"],
                chunk_seq=1,
                chunk_started_at_ms=0,
                duration_ms=250,
                is_final=False,
                body=b"chunk-1-audio",
            ),
            post_audio_chunk(
                base_url=gateway_base_url,
                session_id=session["session_id"],
                chunk_seq=2,
                chunk_started_at_ms=250,
                duration_ms=250,
                is_final=False,
                body=b"chunk-2-audio",
            ),
            post_audio_chunk(
                base_url=gateway_base_url,
                session_id=session["session_id"],
                chunk_seq=3,
                chunk_started_at_ms=500,
                duration_ms=250,
                is_final=True,
                body=b"chunk-3-audio",
            ),
        ]
    finally:
        server.terminate()
        server.wait(timeout=5)

    database_url = resolve_database_url(env)
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT media_id, session_id, trace_id, media_kind, storage_backend, storage_path,
                       mime_type, duration_ms, byte_size, metadata, created_at
                FROM media_indexes
                WHERE session_id = %s AND media_kind = 'audio_chunk'
                ORDER BY created_at ASC, media_id ASC
                """,
                (session["session_id"],),
            )
            media_rows = cur.fetchall()

    if len(media_rows) < 3:
        raise RuntimeError("expected at least three audio_chunk rows for the uploaded session")

    newest_rows = media_rows[-3:]
    resolved_files = []
    for row in newest_rows:
        stored_path = Path(row["storage_path"])
        absolute_path = stored_path if stored_path.is_absolute() else ROOT / stored_path
        if not absolute_path.exists():
            raise RuntimeError(f"stored audio chunk file is missing: {absolute_path}")
        resolved_files.append(str(absolute_path))

    metadata_rows = [row["metadata"] for row in newest_rows]
    if [item.get("chunk_seq") for item in metadata_rows] != [1, 2, 3]:
        raise RuntimeError("audio chunk sequence metadata is not ordered as expected")
    if metadata_rows[-1].get("is_final") is not True:
        raise RuntimeError("last audio chunk was not marked final in metadata")

    print(
        json.dumps(
            {
                "session": session,
                "uploads": uploads,
                "database_rows": [dict(row) for row in newest_rows],
                "stored_files": resolved_files,
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
