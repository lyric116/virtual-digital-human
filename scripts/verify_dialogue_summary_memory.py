#!/usr/bin/env python3
"""Verify dialogue summary generation and persistence through the live gateway stack."""

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


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"
TURN_WAIT_TIMEOUT_SECONDS = 70
SUMMARY_WAIT_TIMEOUT_SECONDS = 90


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


def post_json(url: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def get_json(url: str) -> dict:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_message_count(base_url: str, session_id: str, count: int) -> dict:
    deadline = time.time() + TURN_WAIT_TIMEOUT_SECONDS
    while time.time() < deadline:
        payload = get_json(f"{base_url}/api/session/{session_id}/state")
        if len(payload.get("messages", [])) >= count:
            return payload
        time.sleep(0.5)
    raise RuntimeError(f"session {session_id} did not reach {count} messages in time")


def wait_for_dialogue_summary(base_url: str, session_id: str) -> dict:
    deadline = time.time() + SUMMARY_WAIT_TIMEOUT_SECONDS
    while time.time() < deadline:
        payload = get_json(f"{base_url}/api/session/{session_id}/state")
        summary = ((payload.get("session") or {}).get("metadata") or {}).get("dialogue_summary")
        if isinstance(summary, dict) and str(summary.get("summary_text", "")).strip():
            return payload
        time.sleep(0.5)
    raise RuntimeError("dialogue summary was not generated after three user turns")


def stop_process(process: subprocess.Popen[str]) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


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
            "`docker compose -f infra/compose/docker-compose.yml up -d` "
            "or run `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_infra_stack.py "
            "--compose-file infra/compose/docker-compose.yml`"
        ) from exc


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    ensure_database_ready(env)
    dialogue_port = reserve_local_port()
    orchestrator_port = reserve_local_port()
    gateway_port = reserve_local_port()
    dialogue_base_url = f"http://127.0.0.1:{dialogue_port}"
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"
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

    gateway_env = dict(env)
    gateway_env["PYTHONPATH"] = str(GATEWAY_MAIN.parent)
    gateway_env["GATEWAY_PORT"] = str(gateway_port)
    gateway_env["GATEWAY_PUBLIC_BASE_URL"] = gateway_base_url
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

        session = post_json(
            f"{gateway_base_url}/api/session/create",
            {
                "input_modes": ["text", "audio"],
                "avatar_id": "companion_female_01",
                "metadata": {"source": "verify_dialogue_summary_memory"},
            },
        )
        session_id = session["session_id"]

        scripted_turns = [
            "我叫小周，这周主要在为实习和睡眠发愁。",
            "白天上课时也会分心，脑子转得很快。",
            "你先给我一个简单的缓和建议。",
        ]

        state = {}
        for index, turn in enumerate(scripted_turns, start=1):
            post_json(
                f"{gateway_base_url}/api/session/{session_id}/text",
                {
                    "content_text": turn,
                    "client_seq": index,
                    "metadata": {"source": "verify_dialogue_summary_memory"},
                },
            )
            state = wait_for_message_count(gateway_base_url, session_id, index * 2)

        state = wait_for_dialogue_summary(gateway_base_url, session_id)
        session_metadata = state["session"].get("metadata") or {}
        summary = session_metadata.get("dialogue_summary") or {}
        summary_text = str(summary.get("summary_text", "")).strip()
        if not summary_text:
            raise RuntimeError("dialogue summary was still empty after summary wait")
        if summary.get("user_turn_count") != 3:
            raise RuntimeError(
                f"unexpected summary user_turn_count: {summary.get('user_turn_count')}"
            )

        refreshed_state = get_json(f"{gateway_base_url}/api/session/{session_id}/state")
        refreshed_summary = (refreshed_state["session"].get("metadata") or {}).get("dialogue_summary")
        if not isinstance(refreshed_summary, dict):
            raise RuntimeError("dialogue summary did not persist across session state reload")
        if refreshed_summary.get("summary_text") != summary_text:
            raise RuntimeError("dialogue summary changed unexpectedly after state reload")

        post_json(
            f"{gateway_base_url}/api/session/{session_id}/text",
            {
                "content_text": "继续吧，请沿着刚才的方向说。",
                "client_seq": 4,
                "metadata": {"source": "verify_dialogue_summary_memory"},
            },
        )
        final_state = wait_for_message_count(gateway_base_url, session_id, 8)
        exported = get_json(f"{gateway_base_url}/api/session/{session_id}/export")
        summary_events = [
            event for event in exported.get("events", []) if event.get("event_type") == "dialogue.summary.updated"
        ]
        if not summary_events:
            raise RuntimeError("session export did not include dialogue.summary.updated")

        print(
            json.dumps(
                {
                    "session_id": session_id,
                    "message_count": len(final_state.get("messages", [])),
                    "summary": refreshed_summary,
                    "summary_event_count": len(summary_events),
                    "final_stage": final_state["session"]["stage"],
                },
                ensure_ascii=False,
                indent=2,
                default=str,
            )
        )
    finally:
        stop_process(gateway)
        stop_process(orchestrator)
        stop_process(dialogue_service)


if __name__ == "__main__":
    main()
