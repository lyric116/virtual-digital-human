#!/usr/bin/env python3
"""Verify single-voice TTS service with three real Chinese samples."""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
TTS_MAIN = ROOT / "services" / "tts-service" / "main.py"
SAMPLES = [
    "我们先慢一点，把现在最难受的部分说清楚。",
    "你愿意继续说下去已经很不容易了，我会陪你一起把压力来源理清楚。",
    "如果你现在只是很紧绷但没有立即伤害自己的打算，我们先做一次缓慢呼吸，然后再看看今晚最需要先处理的是睡眠、压力还是反复想事情。",
]


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
    raise RuntimeError("tts-service health check did not become ready")


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


def fetch_bytes(url: str) -> bytes:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=60) as response:
        return response.read()


def stop_process(process: subprocess.Popen[str]) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    port = reserve_local_port()
    base_url = f"http://127.0.0.1:{port}"
    service_env = dict(env)
    service_env["PYTHONPATH"] = str(TTS_MAIN.parent)
    service_env["TTS_SERVICE_HOST"] = "127.0.0.1"
    service_env["TTS_SERVICE_PORT"] = str(port)
    service_env["TTS_SERVICE_BASE_URL"] = base_url
    service_env["TTS_PROVIDER"] = "edge_tts"
    service_env["TTS_AUDIO_FORMAT"] = "mp3"
    service_env["TTS_VOICE_A"] = "zh-CN-XiaoxiaoNeural"

    service = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(TTS_MAIN.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=ROOT,
        env=service_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        wait_for_health(f"{base_url}/health")
        results: list[dict[str, object]] = []
        durations: list[int] = []
        for index, text in enumerate(SAMPLES, start=1):
            payload = post_json(
                f"{base_url}/internal/tts/synthesize",
                {
                    "text": text,
                    "session_id": f"sess_tts_{index:03d}",
                    "trace_id": f"trace_tts_{index:03d}",
                    "message_id": f"msg_assistant_tts_{index:03d}",
                },
            )
            audio_bytes = fetch_bytes(payload["audio_url"])
            if not audio_bytes:
                raise RuntimeError(f"tts audio bytes were empty for sample {index}")
            if payload["audio_format"] != "mp3":
                raise RuntimeError(f"unexpected tts audio format: {payload['audio_format']}")
            durations.append(int(payload["duration_ms"]))
            results.append(
                {
                    "index": index,
                    "voice_id": payload["voice_id"],
                    "audio_format": payload["audio_format"],
                    "duration_ms": payload["duration_ms"],
                    "byte_size": payload["byte_size"],
                    "audio_url": payload["audio_url"],
                }
            )

        if not (durations[0] < durations[1] < durations[2]):
            raise RuntimeError(f"tts durations did not increase with longer samples: {durations}")

        print(
            json.dumps(
                {
                    "tts_service_base_url": base_url,
                    "sample_count": len(SAMPLES),
                    "voice_id": results[0]["voice_id"],
                    "results": results,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    finally:
        stop_process(service)


if __name__ == "__main__":
    main()
