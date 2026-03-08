#!/usr/bin/env python3
"""Verify frontend partial transcript appears before finalized audio transcript."""

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
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"
ORCHESTRATOR_MAIN = ROOT / "apps" / "orchestrator" / "main.py"
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"
HARNESS = ROOT / "scripts" / "web_audio_final_transcript_harness.js"
SAMPLE_AUDIO = ROOT / "data" / "derived" / "audio_16k_mono" / "NoXI" / "001_2016-03-17_Paris" / "Expert_video" / "3.wav"


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
    for _ in range(40):
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"{label} health check did not become ready")


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    orchestrator_port = reserve_local_port()
    asr_port = reserve_local_port()
    gateway_port = reserve_local_port()
    orchestrator_base_url = f"http://127.0.0.1:{orchestrator_port}"
    gateway_base_url = f"http://127.0.0.1:{gateway_port}"
    gateway_ws_url = f"ws://127.0.0.1:{gateway_port}/ws"

    orchestrator_env = dict(env)
    orchestrator_env["PYTHONPATH"] = str(ORCHESTRATOR_MAIN.parent)
    orchestrator_env["ORCHESTRATOR_PORT"] = str(orchestrator_port)
    orchestrator_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url

    asr_env = dict(env)
    asr_env["PYTHONPATH"] = str(ASR_MAIN.parent)
    asr_env["ASR_SERVICE_HOST"] = "127.0.0.1"
    asr_env["ASR_SERVICE_PORT"] = str(asr_port)

    gateway_env = dict(env)
    gateway_env["PYTHONPATH"] = str(GATEWAY_MAIN.parent)
    gateway_env["GATEWAY_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173"
    gateway_env["ORCHESTRATOR_BASE_URL"] = orchestrator_base_url
    gateway_env["ASR_SERVICE_HOST"] = "127.0.0.1"
    gateway_env["ASR_SERVICE_PORT"] = str(asr_port)

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

    asr_service = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(ASR_MAIN.parent),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(asr_port),
        ],
        cwd=ROOT,
        env=asr_env,
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
        wait_for_health(f"{orchestrator_base_url}/health", "orchestrator")
        wait_for_health(f"http://127.0.0.1:{asr_port}/health", "asr-service")
        wait_for_health(f"{gateway_base_url}/health", "gateway")

        try:
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
                    "--sample-audio",
                    str(SAMPLE_AUDIO),
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=True,
            )
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else ""
            stdout = exc.stdout.strip() if exc.stdout else ""
            raise RuntimeError(
                f"audio partial transcript harness failed: stdout={stdout} stderr={stderr}"
            ) from exc
    finally:
        gateway.terminate()
        gateway.wait(timeout=5)
        asr_service.terminate()
        asr_service.wait(timeout=5)
        orchestrator.terminate()
        orchestrator.wait(timeout=5)

    payload = json.loads(result.stdout)
    during_recording = payload["duringRecording"]
    after_reply = payload["afterReply"]

    if during_recording["recordingState"] != "recording":
        raise RuntimeError("recording state was not active during partial transcript verification")
    if during_recording["partialTranscriptState"] != "streaming":
        raise RuntimeError("partial transcript did not reach streaming state during recording")
    if not during_recording["partialTranscriptText"].strip() or during_recording["partialTranscriptText"].startswith("等待"):
        raise RuntimeError("partial transcript text did not appear before stop")
    if after_reply["audioUploadState"] != "completed":
        raise RuntimeError("final audio transcript did not complete after stop")
    if after_reply["dialogueReplyState"] != "received":
        raise RuntimeError("assistant reply did not arrive after finalized audio transcript")

    print(
        json.dumps(
            {
                "before_create": payload["beforeCreate"],
                "after_connect": payload["afterConnect"],
                "during_recording": during_recording,
                "after_stop": payload["afterStop"],
                "after_reply": after_reply,
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
