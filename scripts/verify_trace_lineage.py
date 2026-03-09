#!/usr/bin/env python3
"""Verify trace continuity across session rows, messages, realtime events, and exports."""

from __future__ import annotations

import asyncio
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
import websockets


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"


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


def stop_process(process: subprocess.Popen[bytes] | subprocess.Popen[str]) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def http_json(url: str, method: str = "GET", payload: dict | None = None) -> dict:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


async def collect_realtime_events(gateway_ws_url: str, session_id: str, trace_id: str, gateway_base_url: str) -> dict[str, dict]:
    socket_url = f"{gateway_ws_url}/session/{session_id}?trace_id={trace_id}"
    async with websockets.connect(socket_url) as websocket:
        ready = json.loads(await websocket.recv())
        if ready["event_type"] != "session.connection.ready":
            raise RuntimeError("did not receive session.connection.ready first")

        http_json(
            f"{gateway_base_url}/api/session/{session_id}/text",
            method="POST",
            payload={
                "content_text": "我这两天晚上总是睡不稳，想先试着说出来。",
                "client_seq": 1,
                "metadata": {"source": "trace-lineage-verifier"},
            },
        )
        await websocket.send(
            json.dumps(
                {
                    "type": "ping",
                    "session_id": session_id,
                    "trace_id": trace_id,
                    "sent_at": "2026-03-08T11:30:00Z",
                }
            )
        )

        accepted = None
        reply = None
        deadline = time.time() + 5
        while time.time() < deadline and (accepted is None or reply is None):
            envelope = json.loads(await asyncio.wait_for(websocket.recv(), timeout=5))
            if envelope["event_type"] == "message.accepted":
                accepted = envelope
            elif envelope["event_type"] == "dialogue.reply":
                reply = envelope

        if accepted is None or reply is None:
            raise RuntimeError("did not receive both message.accepted and dialogue.reply")

        return {
            "ready": ready,
            "accepted": accepted,
            "reply": reply,
        }


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    dialogue_port = reserve_local_port()
    orchestrator_port = reserve_local_port()
    gateway_port = reserve_local_port()
    dialogue_base_url = f"http://127.0.0.1:{dialogue_port}"
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"
    gateway_ws_url = f"ws://127.0.0.1:{gateway_port}/ws"

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
    gateway_env["GATEWAY_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"
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

        session = http_json(
            f"{gateway_base_url}/api/session/create",
            method="POST",
            payload={
                "input_modes": ["text", "audio"],
                "avatar_id": "companion_female_01",
                "metadata": {"source": "trace-lineage-verifier"},
            },
        )
        trace_id = session["trace_id"]
        session_id = session["session_id"]
        realtime = asyncio.run(
            collect_realtime_events(gateway_ws_url, session_id, trace_id, gateway_base_url)
        )
        exported = http_json(f"{gateway_base_url}/api/session/{session_id}/export")
    finally:
        stop_process(gateway)
        stop_process(orchestrator)
        stop_process(dialogue_service)

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
            session_row = cur.fetchone()
            cur.execute(
                """
                SELECT message_id, role, trace_id, content_text, submitted_at
                FROM messages
                WHERE session_id = %s
                ORDER BY submitted_at ASC, created_at ASC, message_id ASC
                """,
                (session_id,),
            )
            message_rows = cur.fetchall()
            cur.execute(
                """
                SELECT event_id, event_type, trace_id, message_id, emitted_at
                FROM system_events
                WHERE session_id = %s
                ORDER BY emitted_at ASC, created_at ASC, event_id ASC
                """,
                (session_id,),
            )
            event_rows = cur.fetchall()

    if session_row is None:
        raise RuntimeError(f"session row not found for {session_id}")

    expected_trace = trace_id
    accepted_event = realtime["accepted"]
    reply_event = realtime["reply"]

    observed_traces = [
        session_row["trace_id"],
        accepted_event["trace_id"],
        accepted_event["payload"]["trace_id"],
        reply_event["trace_id"],
        reply_event["payload"]["trace_id"],
        exported["trace_id"],
    ]
    observed_traces.extend(row["trace_id"] for row in message_rows)
    observed_traces.extend(row["trace_id"] for row in event_rows)
    observed_traces.extend(item["trace_id"] for item in exported["messages"])
    observed_traces.extend(item["trace_id"] for item in exported["events"])
    observed_traces.extend(item["trace_id"] for item in exported["stage_history"])

    if any(trace != expected_trace for trace in observed_traces):
        raise RuntimeError("trace continuity check failed")

    print(
        json.dumps(
            {
                "session": session,
                "realtime": realtime,
                "exported": exported,
                "database_session": dict(session_row),
                "database_messages": [dict(row) for row in message_rows],
                "database_events": [dict(row) for row in event_rows],
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
