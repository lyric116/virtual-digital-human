#!/usr/bin/env python3
"""Verify dialogue-service schema validation and orchestrator proxy integration."""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"


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


def post_json(url: str, payload: dict) -> tuple[int, dict]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=30) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        return exc.code, json.loads(detail)


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    dialogue_port = reserve_local_port()
    orchestrator_port = reserve_local_port()
    dialogue_base_url = f"http://127.0.0.1:{dialogue_port}"
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"

    dialogue_env = dict(env)
    dialogue_env["PYTHONPATH"] = str(DIALOGUE_MAIN.parent)
    dialogue_env["DIALOGUE_SERVICE_PORT"] = str(dialogue_port)
    dialogue_env["DIALOGUE_SERVICE_BASE_URL"] = dialogue_base_url

    orchestrator_env = dict(env)
    orchestrator_env["PYTHONPATH"] = str(ORCHESTRATOR_MAIN.parent)
    orchestrator_env["ORCHESTRATOR_PORT"] = str(orchestrator_port)
    orchestrator_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url
    orchestrator_env["DIALOGUE_SERVICE_BASE_URL"] = dialogue_base_url

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

    try:
        wait_for_health(f"{dialogue_base_url}/health", "dialogue-service")
        wait_for_health(f"{orchestrator_base_url}/health", "orchestrator")

        valid_status, valid_payload = post_json(
            f"{dialogue_base_url}/internal/dialogue/validate",
            {
                "session_id": "sess_dialogue_001",
                "trace_id": "trace_dialogue_001",
                "message_id": "msg_assistant_001",
                "reply": "谢谢你愿意说出来。",
                "emotion": "neutral",
                "risk_level": "low",
                "stage": "engage",
                "next_action": "ask_followup",
                "knowledge_refs": [],
                "avatar_style": "warm_support",
                "safety_flags": [],
            },
        )
        invalid_status, invalid_payload = post_json(
            f"{dialogue_base_url}/internal/dialogue/validate",
            {
                "session_id": "sess_dialogue_001",
                "trace_id": "trace_dialogue_001",
                "message_id": "msg_assistant_001",
                "reply": "invalid",
                "emotion": "neutral",
                "risk_level": "low",
                "stage": "invalid_stage",
                "next_action": "ask_followup",
            },
        )
        orchestrator_status, orchestrator_payload = post_json(
            f"{orchestrator_base_url}/internal/dialogue/respond",
            {
                "session_id": "sess_dialogue_001",
                "trace_id": "trace_dialogue_001",
                "user_message_id": "msg_user_001",
                "content_text": "我这两天睡不好，晚上脑子停不下来。",
                "current_stage": "engage",
                "metadata": {"source": "verify_dialogue_schema_validation"},
            },
        )
    finally:
        orchestrator.terminate()
        orchestrator.wait(timeout=5)
        dialogue_service.terminate()
        dialogue_service.wait(timeout=5)

    if valid_status != 200:
        raise RuntimeError("dialogue-service valid payload did not pass schema validation")
    if invalid_status != 422:
        raise RuntimeError("dialogue-service invalid payload did not fail with 422")
    if orchestrator_status != 200:
        raise RuntimeError("orchestrator did not return a validated dialogue reply")

    print(
        json.dumps(
            {
                "dialogue_service_base_url": dialogue_base_url,
                "orchestrator_base_url": orchestrator_base_url,
                "validate_ok_status": valid_status,
                "validate_invalid_status": invalid_status,
                "validate_invalid_error_count": len(invalid_payload.get("detail", [])),
                "orchestrator_reply": orchestrator_payload,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
