#!/usr/bin/env python3
"""Verify short-term dialogue memory through the live gateway stack."""

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
                "metadata": {"source": "verify_dialogue_short_term_memory"},
            },
        )
        session_id = session["session_id"]

        turns = [
            "我叫小李，请记住这个称呼。我这两天有点烦。",
            "今天上课的时候还是有点心不在焉。",
            "你还记得我叫什么吗？请直接回答我的称呼。",
        ]

        for index, turn in enumerate(turns, start=1):
            post_json(
                f"{gateway_base_url}/api/session/{session_id}/text",
                {
                    "content_text": turn,
                    "client_seq": index,
                    "metadata": {"source": "verify_dialogue_short_term_memory"},
                },
            )
            expected_message_count = index * 2
            state = wait_for_message_count(gateway_base_url, session_id, expected_message_count)

        last_assistant_message = state["messages"][-1]
        if last_assistant_message["role"] != "assistant":
            raise RuntimeError("last message is not assistant")
        if "小李" not in last_assistant_message["content_text"]:
            raise RuntimeError("assistant reply did not recall the stored user name")

        print(
            json.dumps(
                {
                    "session_id": session_id,
                    "final_stage": state["session"]["stage"],
                    "message_count": len(state["messages"]),
                    "last_assistant_message": last_assistant_message,
                },
                ensure_ascii=False,
                indent=2,
                default=str,
            )
        )
    finally:
        gateway.terminate()
        gateway.wait(timeout=5)
        orchestrator.terminate()
        orchestrator.wait(timeout=5)
        dialogue_service.terminate()
        dialogue_service.wait(timeout=5)


if __name__ == "__main__":
    main()
