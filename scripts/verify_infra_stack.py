#!/usr/bin/env python3
"""Verify Docker compose foundation services health and persistence."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if check and result.returncode != 0:
        raise RuntimeError(
            f"command failed: {' '.join(command)}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def compose_cmd(compose_file: Path, project_name: str, *args: str) -> list[str]:
    return ["docker", "compose", "-p", project_name, "-f", str(compose_file), *args]


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


def parse_compose_ps(output: str) -> list[dict]:
    text = output.strip()
    if not text:
        return []
    if text.startswith("["):
        return json.loads(text)
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def wait_for_healthy(compose_file: Path, project_name: str, timeout_seconds: int) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        result = run(compose_cmd(compose_file, project_name, "ps", "--format", "json"))
        services = parse_compose_ps(result.stdout)
        if services and all(service.get("Health") == "healthy" for service in services):
            return
        time.sleep(2)
    raise RuntimeError("services did not become healthy before timeout")


def verify_postgres(compose_file: Path, project_name: str, env: dict[str, str]) -> None:
    user = env.get("POSTGRES_USER", "app")
    database = env.get("POSTGRES_DB", "virtual_human")
    sql = (
        "CREATE TABLE IF NOT EXISTS infra_healthcheck "
        "(name TEXT PRIMARY KEY, value TEXT NOT NULL); "
        "INSERT INTO infra_healthcheck(name, value) VALUES('marker', 'step4') "
        "ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value; "
        "SELECT value FROM infra_healthcheck WHERE name = 'marker';"
    )
    result = run(
        compose_cmd(
            compose_file,
            project_name,
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            user,
            "-d",
            database,
            "-tAc",
            sql,
        )
    )
    if "step4" not in result.stdout:
        raise RuntimeError("postgres marker write/read check failed")


def verify_redis(compose_file: Path, project_name: str) -> None:
    run(compose_cmd(compose_file, project_name, "exec", "-T", "redis", "redis-cli", "SET", "infra:healthcheck", "step4"))
    result = run(compose_cmd(compose_file, project_name, "exec", "-T", "redis", "redis-cli", "GET", "infra:healthcheck"))
    if "step4" not in result.stdout:
        raise RuntimeError("redis marker write/read check failed")


def verify_minio(compose_file: Path, project_name: str) -> None:
    command = "mkdir -p /data/healthcheck && printf 'step4\\n' > /data/healthcheck/marker.txt && cat /data/healthcheck/marker.txt"
    result = run(compose_cmd(compose_file, project_name, "exec", "-T", "minio", "sh", "-lc", command))
    if "step4" not in result.stdout:
        raise RuntimeError("minio volume write/read check failed")


def verify_persistence_after_restart(compose_file: Path, project_name: str, env: dict[str, str]) -> None:
    run(compose_cmd(compose_file, project_name, "restart", "postgres", "redis", "minio"))
    wait_for_healthy(compose_file, project_name, timeout_seconds=120)
    time.sleep(2)

    user = env.get("POSTGRES_USER", "app")
    database = env.get("POSTGRES_DB", "virtual_human")

    postgres = run(
        compose_cmd(
            compose_file,
            project_name,
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            user,
            "-d",
            database,
            "-tAc",
            "SELECT value FROM infra_healthcheck WHERE name = 'marker';",
        )
    )
    redis = run(compose_cmd(compose_file, project_name, "exec", "-T", "redis", "redis-cli", "GET", "infra:healthcheck"))
    minio = run(
        compose_cmd(
            compose_file,
            project_name,
            "exec",
            "-T",
            "minio",
            "sh",
            "-lc",
            "cat /data/healthcheck/marker.txt",
        )
    )

    if "step4" not in postgres.stdout:
        raise RuntimeError("postgres marker missing after restart")
    if "step4" not in redis.stdout:
        raise RuntimeError("redis marker missing after restart")
    if "step4" not in minio.stdout:
        raise RuntimeError("minio marker missing after restart")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--compose-file", default="infra/compose/docker-compose.yml")
    parser.add_argument("--project-name", default="virtual-huamn-foundation")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    args = parser.parse_args()

    compose_file = (ROOT / args.compose_file).resolve()
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}

    run(compose_cmd(compose_file, args.project_name, "config"))
    run(compose_cmd(compose_file, args.project_name, "up", "-d"))
    wait_for_healthy(compose_file, args.project_name, timeout_seconds=args.timeout_seconds)
    verify_postgres(compose_file, args.project_name, env)
    verify_redis(compose_file, args.project_name)
    verify_minio(compose_file, args.project_name)
    verify_persistence_after_restart(compose_file, args.project_name, env)

    summary = {
        "compose_file": str(compose_file.relative_to(ROOT)),
        "project_name": args.project_name,
        "services": ["postgres", "redis", "minio"],
        "health": "healthy",
        "persistence": "verified",
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
