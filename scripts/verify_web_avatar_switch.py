#!/usr/bin/env python3
"""Verify dual-avatar switching changes both the rendered profile and the TTS voice."""

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
TTS_MAIN = ROOT / "services" / "tts-service" / "main.py"
HARNESS = ROOT / "scripts" / "web_tts_playback_harness.js"


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


def run_harness(*, gateway_base_url: str, gateway_ws_url: str, tts_base_url: str, avatar_id: str) -> dict:
    result = subprocess.run(
        [
            "node",
            str(HARNESS),
            "--mode",
            "live",
            "--api-base-url",
            gateway_base_url,
            "--ws-url",
            gateway_ws_url,
            "--tts-base-url",
            tts_base_url,
            "--avatar-id",
            avatar_id,
            "--connect-timeout-ms",
            "8000",
            "--reply-timeout-ms",
            "30000",
            "--playback-start-timeout-ms",
            "30000",
            "--playback-complete-timeout-ms",
            "32000",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "web avatar switch harness failed: "
            f"stdout={result.stdout.strip()} stderr={result.stderr.strip()}"
        )
    return json.loads(result.stdout)


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    ensure_database_ready(env)

    dialogue_port = reserve_local_port()
    orchestrator_port = reserve_local_port()
    gateway_port = reserve_local_port()
    tts_port = reserve_local_port()

    dialogue_base_url = f"http://127.0.0.1:{dialogue_port}"
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"
    gateway_ws_url = f"ws://127.0.0.1:{gateway_port}/ws"
    tts_base_url = f"http://127.0.0.1:{tts_port}"

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

    tts_env = dict(env)
    tts_env["PYTHONPATH"] = str(TTS_MAIN.parent)
    tts_env["TTS_SERVICE_PORT"] = str(tts_port)
    tts_env["TTS_SERVICE_BASE_URL"] = tts_base_url
    tts_env["TTS_PROVIDER"] = "edge_tts"
    tts_env["TTS_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"

    dialogue_service = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "--app-dir", str(DIALOGUE_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(dialogue_port)],
        cwd=ROOT,
        env=dialogue_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    orchestrator = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "--app-dir", str(ORCHESTRATOR_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(orchestrator_port)],
        cwd=ROOT,
        env=orchestrator_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    gateway = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "--app-dir", str(GATEWAY_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(gateway_port)],
        cwd=ROOT,
        env=gateway_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    tts_service = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "--app-dir", str(TTS_MAIN.parent), "main:app", "--host", "127.0.0.1", "--port", str(tts_port)],
        cwd=ROOT,
        env=tts_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        wait_for_health(f"{dialogue_base_url}/health", "dialogue-service")
        wait_for_health(f"{orchestrator_base_url}/health", "orchestrator")
        wait_for_health(f"{gateway_base_url}/health", "gateway")
        wait_for_health(f"{tts_base_url}/health", "tts-service")

        companion_payload = run_harness(
            gateway_base_url=gateway_base_url,
            gateway_ws_url=gateway_ws_url,
            tts_base_url=tts_base_url,
            avatar_id="companion_female_01",
        )
        coach_payload = run_harness(
            gateway_base_url=gateway_base_url,
            gateway_ws_url=gateway_ws_url,
            tts_base_url=tts_base_url,
            avatar_id="coach_male_01",
        )

        companion_after = companion_payload["afterPlaybackEnd"]
        coach_after = coach_payload["afterPlaybackEnd"]

        if companion_payload["beforeCreate"]["activeAvatarId"] != "companion_female_01":
            raise RuntimeError("companion avatar was not selected before session start")
        if coach_payload["beforeCreate"]["activeAvatarId"] != "coach_male_01":
            raise RuntimeError("coach avatar was not selected before session start")
        if companion_after["avatarVoice"] == coach_after["avatarVoice"]:
            raise RuntimeError("avatar switch did not change TTS voice")
        if companion_after["effectiveAvatarProfile"] == coach_after["effectiveAvatarProfile"]:
            raise RuntimeError("avatar switch did not change rendered avatar profile")
        if companion_after["avatarLabel"] == coach_after["avatarLabel"]:
            raise RuntimeError("avatar switch did not change avatar label")

        print(
            json.dumps(
                {
                    "companion_voice": companion_after["avatarVoice"],
                    "coach_voice": coach_after["avatarVoice"],
                    "companion_profile": companion_after["effectiveAvatarProfile"],
                    "coach_profile": coach_after["effectiveAvatarProfile"],
                    "companion_label": companion_after["avatarLabel"],
                    "coach_label": coach_after["avatarLabel"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    finally:
        stop_process(gateway)
        stop_process(orchestrator)
        stop_process(dialogue_service)
        stop_process(tts_service)


if __name__ == "__main__":
    main()
