#!/usr/bin/env python3
"""Apply and verify the baseline PostgreSQL schema through the foundation compose stack."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str], *, input_text: str | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        cwd=ROOT,
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
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


def psql_cmd(compose_file: Path, project_name: str, env: dict[str, str], *args: str) -> list[str]:
    user = env.get("POSTGRES_USER", "app")
    database = env.get("POSTGRES_DB", "virtual_human")
    return [
        *compose_cmd(compose_file, project_name, "exec", "-T", "postgres"),
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        user,
        "-d",
        database,
        *args,
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--compose-file", default="infra/compose/docker-compose.yml")
    parser.add_argument("--project-name", default="virtual-huamn-foundation")
    parser.add_argument("--schema-file", default="infra/docker/postgres/init/001_base_schema.sql")
    args = parser.parse_args()

    compose_file = (ROOT / args.compose_file).resolve()
    schema_file = (ROOT / args.schema_file).resolve()
    env = {**parse_env_file(ROOT / ".env.example"), **parse_env_file(ROOT / ".env"), **os.environ}

    run(psql_cmd(compose_file, args.project_name, env), input_text=schema_file.read_text(encoding="utf-8"))

    seed_sql = """
    INSERT INTO sessions (
        session_id, trace_id, status, stage, input_modes, avatar_id, metadata
    ) VALUES (
        'sess_schema_check',
        'trace_schema_check',
        'created',
        'engage',
        '["text"]'::jsonb,
        'companion_female_01',
        '{"source":"verify_db_schema"}'::jsonb
    )
    ON CONFLICT (session_id) DO UPDATE
    SET trace_id = EXCLUDED.trace_id,
        status = EXCLUDED.status,
        stage = EXCLUDED.stage,
        input_modes = EXCLUDED.input_modes,
        avatar_id = EXCLUDED.avatar_id,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();

    INSERT INTO messages (
        message_id, session_id, trace_id, role, status, source_kind, content_text, metadata
    ) VALUES (
        'msg_schema_check',
        'sess_schema_check',
        'trace_schema_check',
        'user',
        'accepted',
        'text',
        'schema verification message',
        '{"source":"verify_db_schema"}'::jsonb
    )
    ON CONFLICT (message_id) DO UPDATE
    SET content_text = EXCLUDED.content_text,
        updated_at = NOW();

    INSERT INTO system_events (
        event_id, session_id, trace_id, message_id, event_type, schema_version, source_service, payload, emitted_at
    ) VALUES (
        'evt_schema_check',
        'sess_schema_check',
        'trace_schema_check',
        'msg_schema_check',
        'message.accepted',
        'v1alpha1',
        'verify_db_schema',
        '{"status":"accepted"}'::jsonb,
        NOW()
    )
    ON CONFLICT (event_id) DO UPDATE
    SET payload = EXCLUDED.payload,
        emitted_at = NOW();

    INSERT INTO evaluation_records (
        eval_id, session_id, trace_id, scope, metric_name, metric_value, metric_unit, metadata
    ) VALUES (
        'eval_schema_check',
        'sess_schema_check',
        'trace_schema_check',
        'session',
        'latency_ms',
        123.0,
        'ms',
        '{"source":"verify_db_schema"}'::jsonb
    )
    ON CONFLICT (eval_id) DO UPDATE
    SET metric_value = EXCLUDED.metric_value,
        metadata = EXCLUDED.metadata;

    INSERT INTO media_indexes (
        media_id, session_id, trace_id, message_id, media_kind, storage_backend, storage_path, mime_type, duration_ms, byte_size, metadata
    ) VALUES (
        'media_schema_check',
        'sess_schema_check',
        'trace_schema_check',
        'msg_schema_check',
        'audio_final',
        'minio',
        'minio://vdh-derived/schema-check.wav',
        'audio/wav',
        1000,
        2048,
        '{"source":"verify_db_schema"}'::jsonb
    )
    ON CONFLICT (media_id) DO UPDATE
    SET storage_path = EXCLUDED.storage_path,
        duration_ms = EXCLUDED.duration_ms,
        byte_size = EXCLUDED.byte_size;
    """

    summary_sql = """
    SELECT json_build_object(
        'session', (SELECT json_build_object('session_id', session_id, 'status', status, 'stage', stage) FROM sessions WHERE session_id = 'sess_schema_check'),
        'message', (SELECT json_build_object('message_id', message_id, 'session_id', session_id, 'role', role) FROM messages WHERE message_id = 'msg_schema_check'),
        'event', (SELECT json_build_object('event_id', event_id, 'event_type', event_type) FROM system_events WHERE event_id = 'evt_schema_check'),
        'evaluation', (SELECT json_build_object('eval_id', eval_id, 'metric_name', metric_name, 'metric_value', metric_value) FROM evaluation_records WHERE eval_id = 'eval_schema_check'),
        'media', (SELECT json_build_object('media_id', media_id, 'media_kind', media_kind, 'storage_backend', storage_backend) FROM media_indexes WHERE media_id = 'media_schema_check')
    );
    """

    run(psql_cmd(compose_file, args.project_name, env, "-c", seed_sql))
    result = run(psql_cmd(compose_file, args.project_name, env, "-tAc", summary_sql))
    summary = json.loads(result.stdout.strip())

    if summary["message"]["session_id"] != summary["session"]["session_id"]:
        raise RuntimeError("message foreign key linkage to session did not verify")

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
