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

- recommended shortcut: `make up-infra`
- raw command: `docker compose -f infra/compose/docker-compose.yml up -d`

Stop the stack:

- recommended shortcut: `make down-infra`
- raw command: `docker compose -f infra/compose/docker-compose.yml down`

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

- recommended shortcuts: `make start-core`, `make status-core`, `make logs-core`, `make verify-core`, `make stop-core`
- raw command: `docker compose --env-file .env -f infra/compose/docker-compose.core.yml up -d --build`
- before first start, ensure local Python deps are present with `uv sync` or `make sync`
- current step-51 core stack mounts the repo root to `/app` and mounts `.venv/lib/python3.11/site-packages` read-only into each Python service container
- runtime service configuration is loaded from the repository-root `.env` through
  `env_file: ../../.env`; keep the real `.env` in the project root
- this is the default local startup path for the repo; prefer it over manually starting
  backend services one by one
- do not mix raw `uvicorn` processes with the compose stack on the same ports; if you hit
  `address already in use`, stop the running stack with `make stop-core` or
  `make stop-full` before switching workflows

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

- recommended shortcuts: `make compose-full-config`, `make start-full`, `make status-full`, `make logs-full`, `make stop-full`
- use `docker compose --env-file .env -f infra/compose/docker-compose.full.yml config` to validate the
  expanded deployment file
- use the same local repo bind mount + `.venv` site-packages mount strategy as the core
  stack until final packaging replaces it with production images
- use `docker compose --env-file .env -f infra/compose/docker-compose.full.yml up -d --build`
  when you need the full voice + avatar chain with external credentials
- use the full stack when ASR or the full audio/avatar path is required; otherwise prefer
  `make start-core`
