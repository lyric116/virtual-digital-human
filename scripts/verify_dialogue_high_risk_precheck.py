#!/usr/bin/env python3
"""Verify gateway high-risk rule precheck without relying on orchestrator or the LLM."""

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
HIGH_RISK_SAMPLE = "我觉得活着没意义，甚至想伤害自己。"


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
            "`docker compose -f infra/compose/docker-compose.yml up -d`"
        ) from exc


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_health(url: str) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(30):
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("gateway health check did not become ready")


def post_json(url: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def get_json(url: str) -> dict:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


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

    gateway_port = reserve_local_port()
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"
    gateway_env = dict(env)
    gateway_env["PYTHONPATH"] = str(GATEWAY_MAIN.parent)
    gateway_env["GATEWAY_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"
    gateway_env["ORCHESTRATOR_BASE_URL"] = "http://127.0.0.1:1"

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
        wait_for_health(f"{gateway_base_url}/health")
        created = post_json(
            f"{gateway_base_url}/api/session/create",
            {"input_modes": ["text", "audio"], "metadata": {"source": "verify_dialogue_high_risk_precheck"}},
        )
        session_id = created["session_id"]

        accepted = post_json(
            f"{gateway_base_url}/api/session/{session_id}/text",
            {"content_text": HIGH_RISK_SAMPLE, "metadata": {"source": "verify_dialogue_high_risk_precheck"}},
        )
        if accepted["status"] != "accepted":
            raise RuntimeError("text submit did not return accepted status")

        state: dict | None = None
        exported: dict | None = None
        for _ in range(40):
            state = get_json(f"{gateway_base_url}/api/session/{session_id}/state")
            assistant_messages = [item for item in state.get("messages", []) if item.get("role") == "assistant"]
            if assistant_messages:
                exported = get_json(f"{gateway_base_url}/api/session/{session_id}/export")
                break
            time.sleep(0.25)
        else:
            raise RuntimeError("high-risk assistant reply did not persist in time")

        assert state is not None
        assert exported is not None

        assistant_message = [item for item in state["messages"] if item["role"] == "assistant"][-1]
        if assistant_message["metadata"].get("stage") != "handoff":
            raise RuntimeError("high-risk precheck did not force handoff stage")
        if assistant_message["metadata"].get("risk_level") != "high":
            raise RuntimeError("high-risk precheck did not persist high risk level")
        if not assistant_message["metadata"].get("risk_rule_precheck"):
            raise RuntimeError("assistant metadata did not record risk_rule_precheck")

        event_types = [item["event_type"] for item in exported.get("events", [])]
        if "session.error" in event_types:
            raise RuntimeError("high-risk precheck still produced session.error even with dead orchestrator")

        dialogue_events = [item for item in exported.get("events", []) if item["event_type"] == "dialogue.reply"]
        if not dialogue_events:
            raise RuntimeError("dialogue.reply event missing from export")
        latest_dialogue = dialogue_events[-1]
        if latest_dialogue["source_service"] != "api_gateway":
            raise RuntimeError("high-risk precheck reply did not originate from api_gateway")
        if latest_dialogue["payload"].get("stage") != "handoff":
            raise RuntimeError("dialogue.reply payload did not expose handoff stage")
        if latest_dialogue["payload"].get("rule_precheck_triggered") is not True:
            raise RuntimeError("dialogue.reply payload did not record rule_precheck_triggered")

        database_url = resolve_database_url(env)
        with psycopg.connect(database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT session_id, stage, status, metadata
                    FROM sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                session_row = cur.fetchone()
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

        if session_row is None:
            raise RuntimeError("session row missing from database")
        if session_row["stage"] != "handoff":
            raise RuntimeError("database session stage did not persist handoff")

        print(
            json.dumps(
                {
                    "session": state["session"],
                    "assistant_message": assistant_message,
                    "export_event_types": event_types,
                    "database_session": dict(session_row),
                    "database_events": [dict(row) for row in event_rows],
                },
                ensure_ascii=False,
                indent=2,
                default=str,
            )
        )
    finally:
        stop_process(gateway)


if __name__ == "__main__":
    main()
