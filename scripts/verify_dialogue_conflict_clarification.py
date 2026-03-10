#!/usr/bin/env python3
"""Verify that multimodal conflict now drives clarification replies."""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave

import numpy as np
import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"
AFFECT_MAIN = ROOT / "services" / "affect-service" / "main.py"
CONFLICT_TEXT = "今天就普通聊聊，先说说最近的情况。"


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
    with opener.open(request, timeout=20) as response:
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


def write_pattern_wav(path: Path) -> None:
    sample_rate_hz = 16000
    tone_ms = 180
    silence_ms = 1020
    cycles = 3
    amplitude = 0.03
    tone_frames = int(sample_rate_hz * (tone_ms / 1000.0))
    silence_frames = int(sample_rate_hz * (silence_ms / 1000.0))

    pcm = bytearray()
    for _ in range(cycles):
        for index in range(tone_frames):
            sample = int(
                amplitude
                * np.sin((2.0 * np.pi * 220.0 * index) / sample_rate_hz)
                * 32767
            )
            pcm.extend(int(sample).to_bytes(2, byteorder="little", signed=True))
        pcm.extend((0).to_bytes(2, byteorder="little", signed=True) * silence_frames)

    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate_hz)
        wav_file.writeframes(bytes(pcm))


def write_face_like_frame(path: Path) -> None:
    frame = np.full((64, 64), 0.12, dtype=np.float32)
    frame[16:48, 18:46] = 0.72
    frame[26:31, 23:28] = 0.18
    frame[26:31, 36:41] = 0.20
    frame[38:42, 27:37] = 0.28
    np.save(path, frame)


def wait_for_assistant_reply(base_url: str, session_id: str) -> dict:
    for _ in range(80):
        state = get_json(f"{base_url}/api/session/{session_id}/state")
        assistant_messages = [item for item in state.get("messages", []) if item.get("role") == "assistant"]
        if assistant_messages:
            return state
        time.sleep(0.25)
    raise RuntimeError("assistant reply did not persist in time")


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    ensure_database_ready(env)

    affect_port = reserve_local_port()
    dialogue_port = reserve_local_port()
    orchestrator_port = reserve_local_port()
    gateway_port = reserve_local_port()
    affect_base_url = f"http://127.0.0.1:{affect_port}"
    dialogue_base_url = f"http://127.0.0.1:{dialogue_port}"
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"

    affect_env = dict(env)
    affect_env["PYTHONPATH"] = str(AFFECT_MAIN.parent)
    affect_env["AFFECT_SERVICE_PORT"] = str(affect_port)
    affect_env["AFFECT_SERVICE_BASE_URL"] = affect_base_url

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
    gateway_env["AFFECT_SERVICE_BASE_URL"] = affect_base_url

    affect_service = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(AFFECT_MAIN.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(affect_port),
        ],
        cwd=ROOT,
        env=affect_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
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
        wait_for_health(f"{affect_base_url}/health", "affect-service")
        wait_for_health(f"{dialogue_base_url}/health", "dialogue-service")
        wait_for_health(f"{orchestrator_base_url}/health", "orchestrator")
        wait_for_health(f"{gateway_base_url}/health", "gateway")

        with tempfile.TemporaryDirectory(prefix="dialogue_conflict_") as temp_dir:
            temp_root = Path(temp_dir)
            audio_path = temp_root / "slow_low.wav"
            video_path = temp_root / "face_like.npy"
            write_pattern_wav(audio_path)
            write_face_like_frame(video_path)

            session = post_json(
                f"{gateway_base_url}/api/session/create",
                {
                    "input_modes": ["text", "audio", "video"],
                    "metadata": {"source": "verify_dialogue_conflict_clarification"},
                },
            )
            session_id = session["session_id"]

            accepted = post_json(
                f"{gateway_base_url}/api/session/{session_id}/text",
                {
                    "content_text": CONFLICT_TEXT,
                    "metadata": {
                        "source": "verify_dialogue_conflict_clarification",
                        "dataset": "live_web",
                        "record_id": f"session/{session_id}",
                        "sample_note": "synthetic multimodal conflict sample",
                        "audio_path_16k_mono": str(audio_path),
                        "video_frame_path": str(video_path),
                    },
                },
            )
            if accepted["status"] != "accepted":
                raise RuntimeError("text submit did not return accepted status")

            state = wait_for_assistant_reply(gateway_base_url, session_id)
            exported = get_json(f"{gateway_base_url}/api/session/{session_id}/export")

        assistant_message = [item for item in state["messages"] if item["role"] == "assistant"][-1]
        if assistant_message["metadata"].get("next_action") != "ask_followup":
            raise RuntimeError("assistant did not persist clarification next_action")
        if "affect_conflict_clarification" not in assistant_message["metadata"].get("safety_flags", []):
            raise RuntimeError("assistant metadata did not record affect conflict clarification")

        affect_events = [item for item in exported.get("events", []) if item["event_type"] == "affect.snapshot"]
        if not affect_events:
            raise RuntimeError("export is missing persisted affect.snapshot event")
        latest_affect = affect_events[-1]
        if latest_affect["payload"]["fusion_result"].get("conflict") is not True:
            raise RuntimeError("affect snapshot did not persist multimodal conflict")

        dialogue_events = [item for item in exported.get("events", []) if item["event_type"] == "dialogue.reply"]
        if not dialogue_events:
            raise RuntimeError("export is missing dialogue.reply event")
        latest_dialogue = dialogue_events[-1]
        if latest_dialogue["payload"].get("next_action") != "ask_followup":
            raise RuntimeError("dialogue reply did not prioritize clarification next_action")
        if latest_dialogue["payload"].get("affect_conflict") is not True:
            raise RuntimeError("dialogue reply payload did not retain affect conflict flag")
        if not str(latest_dialogue["payload"].get("affect_conflict_reason") or "").startswith("text-neutral"):
            raise RuntimeError("dialogue reply payload did not retain affect conflict reason")
        if "affect_conflict_clarification" not in latest_dialogue["payload"].get("safety_flags", []):
            raise RuntimeError("dialogue reply did not expose affect conflict clarification flag")
        if latest_dialogue["payload"].get("stage") != "assess":
            raise RuntimeError("dialogue reply did not stay in clarification-oriented assess stage")

        with psycopg.connect(resolve_database_url(env), row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT message_id, content_text, metadata
                    FROM messages
                    WHERE session_id = %s AND role = 'assistant'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (session_id,),
                )
                assistant_row = cur.fetchone()

        if assistant_row is None:
            raise RuntimeError("assistant database row missing")

        print(
            json.dumps(
                {
                    "session": state["session"],
                    "assistant_message": assistant_message,
                    "affect_event": latest_affect,
                    "dialogue_event": latest_dialogue,
                    "database_assistant_row": dict(assistant_row),
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
        stop_process(affect_service)


if __name__ == "__main__":
    main()
