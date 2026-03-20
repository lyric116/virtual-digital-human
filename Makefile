UV_CACHE_DIR ?= .uv-cache
PYTHON ?= python3
UV ?= uv
DOCKER_COMPOSE ?= docker compose

.PHONY: help sync lint test test-fast web backend-core backend-full up-infra down-infra start-core stop-core status-core up-core down-core logs-core start-full stop-full status-full up-full down-full logs-full verify-core compose-core-config compose-full-config

help:
	@printf '%s\n' \
		'Available targets:' \
		'  make sync                Install Python dependencies with uv' \
		'  make lint                Run Ruff' \
		'  make test                Run full pytest suite' \
		'  make test-fast           Run a smaller compose/env smoke suite' \
		'  make start-core          Start the core compose stack (default local workflow)' \
		'  make stop-core           Stop the core compose stack' \
		'  make status-core         Show container status for the core compose stack' \
		'  make logs-core           Tail logs for the core compose stack' \
		'  make verify-core         Run the existing core compose verifier' \
		'  make start-full          Start the full compose stack with ASR and avatar services' \
		'  make stop-full           Stop the full compose stack' \
		'  make status-full         Show container status for the full compose stack' \
		'  make logs-full           Tail logs for the full compose stack' \
		'  make up-core             Alias for make start-core' \
		'  make down-core           Alias for make stop-core' \
		'  make up-full             Alias for make start-full' \
		'  make down-full           Alias for make stop-full' \
		'  make web                 Start the static frontend preview on :4173 for manual debugging' \
		'  make backend-core        Print only: native debug commands for the core backend services' \
		'  make backend-full        Print only: native debug commands for the full backend services' \
		'  make up-infra            Start the infrastructure compose stack' \
		'  make down-infra          Stop the infrastructure compose stack' \
		'  make compose-core-config Validate the core compose config' \
		'  make compose-full-config Validate the full compose config'

sync:
	UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) sync

lint:
	UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run ruff check .

test:
	UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run pytest

test-fast:
	UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run pytest tests/test_core_compose.py tests/test_full_compose.py tests/test_environment_inventory.py tests/test_makefile_targets.py

web:
	$(PYTHON) -m http.server 4173 --directory apps/web

backend-core:
	@printf '%s\n' 'Print only: run these native core backend services in separate terminals for debugging.' 'Do not mix these commands with make start-core or make start-full on the same ports.' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir apps/orchestrator main:app --host 0.0.0.0 --port 8010' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir services/dialogue-service main:app --host 0.0.0.0 --port 8030' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir services/tts-service main:app --host 0.0.0.0 --port 8040' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir services/affect-service main:app --host 0.0.0.0 --port 8060' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir services/rag-service main:app --host 0.0.0.0 --port 8070'

backend-full:
	@printf '%s\n' 'Print only: run these native full backend services in separate terminals for debugging.' 'Do not mix these commands with make start-core or make start-full on the same ports.' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir apps/orchestrator main:app --host 0.0.0.0 --port 8010' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir services/asr-service main:app --host 0.0.0.0 --port 8020' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir services/dialogue-service main:app --host 0.0.0.0 --port 8030' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir services/tts-service main:app --host 0.0.0.0 --port 8040' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir services/avatar-driver-service main:app --host 0.0.0.0 --port 8050' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir services/affect-service main:app --host 0.0.0.0 --port 8060' 'UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run uvicorn --app-dir services/rag-service main:app --host 0.0.0.0 --port 8070'

up-infra:
	$(DOCKER_COMPOSE) -f infra/compose/docker-compose.yml up -d

down-infra:
	$(DOCKER_COMPOSE) -f infra/compose/docker-compose.yml down

start-core: up-core

stop-core: down-core

status-core:
	$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.core.yml ps

up-core:
	$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.core.yml up -d --build

down-core:
	$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.core.yml down

logs-core:
	$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.core.yml logs -f

start-full: up-full

stop-full: down-full

status-full:
	$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.full.yml ps

up-full:
	$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.full.yml up -d --build

down-full:
	$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.full.yml down

logs-full:
	$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.full.yml logs -f

verify-core:
	UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run python scripts/verify_core_compose_stack.py --compose-file infra/compose/docker-compose.core.yml

compose-core-config:
	$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.core.yml config

compose-full-config:
	$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.full.yml config
