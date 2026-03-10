#!/usr/bin/env python3
"""Verify live camera preview and low-frequency frame upload against the gateway."""

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
HARNESS = ROOT / "scripts" / "web_camera_capture_harness.js"


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
            "`docker compose -f infra/compose/docker-compose.yml up -d` "
            "or run `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_infra_stack.py "
            "--compose-file infra/compose/docker-compose.yml`"
        ) from exc


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_health(base_url: str) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(30):
        try:
            with opener.open(f"{base_url}/health", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("gateway health check did not become ready for camera verify")


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


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    ensure_database_ready(env)

    gateway_port = reserve_local_port()
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"
    gateway_ws_url = f"ws://127.0.0.1:{gateway_port}/ws"

    gateway_env = dict(env)
    gateway_env["PYTHONPATH"] = str(GATEWAY_MAIN.parent)
    gateway_env["GATEWAY_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"

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
        wait_for_health(gateway_base_url)
        result = subprocess.run(
            [
                "node",
                str(HARNESS),
                "--mode",
                "live",
                "--camera-mode",
                "allow",
                "--api-base-url",
                gateway_base_url,
                "--ws-url",
                gateway_ws_url,
                "--connect-timeout-ms",
                "8000",
                "--capture-timeout-ms",
                "9000",
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                "web camera capture harness failed: "
                f"stdout={result.stdout.strip()} stderr={result.stderr.strip()}"
            )
        payload = json.loads(result.stdout)
    finally:
        stop_process(gateway)

    session_id = payload["afterStop"]["sessionId"]
    database_url = resolve_database_url(env)
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT media_id, session_id, trace_id, media_kind, storage_backend, storage_path,
                       mime_type, byte_size, metadata, created_at
                FROM media_indexes
                WHERE session_id = %s AND media_kind = 'video_frame'
                ORDER BY created_at ASC, media_id ASC
                """,
                (session_id,),
            )
            media_rows = cur.fetchall()

    if len(media_rows) < 2:
        raise RuntimeError("expected at least two video_frame rows for the uploaded session")

    newest_rows = media_rows[-2:]
    stored_files = []
    metadata_rows = []
    for row in newest_rows:
        stored_path = Path(row["storage_path"])
        absolute_path = stored_path if stored_path.is_absolute() else ROOT / stored_path
        if not absolute_path.exists():
            raise RuntimeError(f"stored video frame file is missing: {absolute_path}")
        stored_files.append(str(absolute_path))
        metadata_rows.append(row["metadata"])

    expected_seqs = [1, 2]
    actual_seqs = [int(item.get("frame_seq", -1)) for item in metadata_rows]
    if actual_seqs != expected_seqs:
        raise RuntimeError(f"video frame sequence metadata mismatch: {actual_seqs}")

    print(
        json.dumps(
            {
                "session_id": session_id,
                "upload_calls": payload["uploadCalls"],
                "camera_state": payload["afterStop"]["cameraState"],
                "database_rows": [dict(row) for row in newest_rows],
                "stored_files": stored_files,
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
