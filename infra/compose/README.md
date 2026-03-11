# Compose

## Foundation Stack

The current compose stack is limited to baseline infrastructure required by implementation
plan step 4:

- PostgreSQL
- Redis
- MinIO

PostgreSQL auto-loads init SQL from:

- `infra/docker/postgres/init/001_base_schema.sql`

Primary file:

- `infra/compose/docker-compose.yml`
- `infra/compose/docker-compose.core.yml`
- `infra/compose/docker-compose.full.yml`

## Usage

Bring up the stack:

- `docker compose -f infra/compose/docker-compose.yml up -d`

Stop the stack:

- `docker compose -f infra/compose/docker-compose.yml down`

Run the verification workflow:

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_infra_stack.py --compose-file infra/compose/docker-compose.yml`
- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_db_schema.py --compose-file infra/compose/docker-compose.yml`

## Core Stack

The current step-51 core stack adds the browser shell and the text-loop services needed
by the current codebase:

- `web`
- `gateway`
- `orchestrator`
- `dialogue-service`
- `rag-service`
- `affect-service`
- `tts-service`
- `postgres`
- `redis`
- `minio`

Bring up the stack:

- `docker compose -f infra/compose/docker-compose.core.yml up -d --build`
- before first start, ensure local Python deps are present with `uv sync`
- current step-51 core stack mounts the repo root to `/app` and mounts `.venv/lib/python3.11/site-packages` read-only into each Python service container

Run the end-to-end verification workflow:

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_core_compose_stack.py --compose-file infra/compose/docker-compose.core.yml`
- if Docker cannot create networks or containers in the current environment, the verifier now times out instead of hanging indefinitely

The verification workflow checks:

1. config validity
2. container health
3. persistence after restart for PostgreSQL, Redis, and MinIO
4. PostgreSQL baseline schema application and insert verification

## Full Stack

The next deployment layer adds the remaining model-facing services needed by the
voice + avatar chain:

- `asr-service`
- `avatar-driver-service`

Primary file:

- `infra/compose/docker-compose.full.yml`

Current expectation:

- use `docker compose -f infra/compose/docker-compose.full.yml config` to validate the
  expanded deployment file
- use the same local repo bind mount + `.venv` site-packages mount strategy as the core
  stack until final packaging replaces it with production images
