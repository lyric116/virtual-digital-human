# Compose

## Foundation Stack

The current compose stack is limited to baseline infrastructure required by implementation
plan step 4:

- PostgreSQL
- Redis
- MinIO

Primary file:

- `infra/compose/docker-compose.yml`

## Usage

Bring up the stack:

- `docker compose -f infra/compose/docker-compose.yml up -d`

Stop the stack:

- `docker compose -f infra/compose/docker-compose.yml down`

Run the verification workflow:

- `UV_CACHE_DIR=.uv-cache uv run python scripts/verify_infra_stack.py --compose-file infra/compose/docker-compose.yml`

The verification workflow checks:

1. config validity
2. container health
3. persistence after restart for PostgreSQL, Redis, and MinIO
