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
DIALOGUE_MAIN = ROOT / "services" / "dialogue-service" / "main.py"
ASR_MAIN = ROOT / "services" / "asr-service" / "main.py"
HARNESS = ROOT / "scripts" / "web_audio_final_transcript_harness.js"
SAMPLE_AUDIO = ROOT / "data" / "derived" / "audio_16k_mono" / "NoXI" / "001_2016-03-17_Paris" / "Expert_video" / "3.wav"


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


def stop_process(process: subprocess.Popen[bytes] | subprocess.Popen[str]) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> None:
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}
    dialogue_port = reserve_local_port()
    orchestrator_port = reserve_local_port()
    asr_port = reserve_local_port()
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
        wait_for_health(f"{dialogue_base_url}/health", "dialogue-service")
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
        stop_process(gateway)
        stop_process(asr_service)
        stop_process(orchestrator)
        stop_process(dialogue_service)

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
