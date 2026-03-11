#!/usr/bin/env python3
"""Verify the dockerized core stack can complete one text dialogue loop."""

from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path
from urllib import request as urllib_request


ROOT = Path(__file__).resolve().parents[1]


def run(
    command: list[str],
    *,
    check: bool = True,
    timeout_seconds: int | None = None,
) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"command timed out after {timeout_seconds}s: {' '.join(command)}"
        ) from exc
    if check and result.returncode != 0:
        raise RuntimeError(
            f"command failed: {' '.join(command)}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def compose_cmd(compose_file: Path, project_name: str, *args: str) -> list[str]:
    return ["docker", "compose", "-p", project_name, "-f", str(compose_file), *args]


def http_json(url: str, *, method: str = "GET", payload: dict | None = None) -> dict:
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib_request.Request(url=url, data=body, headers=headers, method=method)
    with urllib_request.urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def http_text(url: str) -> str:
    req = urllib_request.Request(url=url, method="GET")
    with urllib_request.urlopen(req, timeout=20) as response:
        return response.read().decode("utf-8")


def wait_for_http_json(url: str, *, timeout_seconds: int = 180) -> dict:
    deadline = time.time() + timeout_seconds
    last_error = "unknown"
    while time.time() < deadline:
        try:
            return http_json(url)
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            time.sleep(2)
    raise RuntimeError(f"service did not become ready: {url} ({last_error})")


def wait_for_assistant_reply(base_url: str, session_id: str, *, timeout_seconds: int = 60) -> dict:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        state = http_json(f"{base_url}/api/session/{session_id}/state")
        assistant_messages = [item for item in state.get("messages", []) if item.get("role") == "assistant"]
        if assistant_messages:
            return {"state": state, "assistant_message": assistant_messages[-1]}
        time.sleep(2)
    raise RuntimeError("assistant reply did not appear before timeout")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--compose-file", default="infra/compose/docker-compose.core.yml")
    parser.add_argument("--project-name", default="virtual-huamn-core")
    parser.add_argument("--compose-up-timeout-seconds", type=int, default=120)
    parser.add_argument("--down-after", action="store_true")
    args = parser.parse_args()

    compose_file = (ROOT / args.compose_file).resolve()
    project_name = args.project_name

    try:
        run(compose_cmd(compose_file, project_name, "config"))
        run(
            compose_cmd(compose_file, project_name, "up", "-d", "--build"),
            timeout_seconds=args.compose_up_timeout_seconds,
        )

        config_js = http_text("http://127.0.0.1:4173/config.js")
        wait_for_http_json("http://127.0.0.1:8000/health")
        wait_for_http_json("http://127.0.0.1:8010/health")
        wait_for_http_json("http://127.0.0.1:8030/health")
        wait_for_http_json("http://127.0.0.1:8060/health")
        wait_for_http_json("http://127.0.0.1:8070/health")
        wait_for_http_json("http://127.0.0.1:8040/health")
        runtime_config = wait_for_http_json("http://127.0.0.1:8000/api/runtime/config")

        session = http_json(
            "http://127.0.0.1:8000/api/session/create",
            method="POST",
            payload={
                "input_modes": ["text", "audio", "video"],
                "avatar_id": "companion_female_01",
                "metadata": {"source": "compose_verify"},
            },
        )
        message = http_json(
            f"http://127.0.0.1:8000/api/session/{session['session_id']}/text",
            method="POST",
            payload={"content_text": "我最近总是睡不好，想先聊聊怎么把节奏放慢一点。"},
        )
        reply_result = wait_for_assistant_reply("http://127.0.0.1:8000", session["session_id"])

        summary = {
            "compose_file": str(compose_file.relative_to(ROOT)),
            "project_name": project_name,
            "web_config_preview": config_js.splitlines()[0] if config_js else "",
            "runtime_config": runtime_config,
            "session_id": session["session_id"],
            "message_id": message["message_id"],
            "assistant_message_id": reply_result["assistant_message"]["message_id"],
            "assistant_reply": reply_result["assistant_message"]["content_text"],
            "assistant_stage": reply_result["state"]["session"]["stage"],
            "status": "ok",
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        if args.down_after:
            run(compose_cmd(compose_file, project_name, "down", "-v"), check=False)


if __name__ == "__main__":
    main()
