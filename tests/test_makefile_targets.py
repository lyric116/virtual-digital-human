from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAKEFILE = ROOT / "Makefile"
README = ROOT / "README.md"
COMPOSE_README = ROOT / "infra" / "compose" / "README.md"
WEB_README = ROOT / "apps" / "web" / "README.md"
EMOTION_APP_README = ROOT / "emotion_app" / "README.md"


def test_makefile_exposes_expected_startup_targets():
    content = MAKEFILE.read_text(encoding="utf-8")

    for token in [
        ".PHONY:",
        "help:",
        "sync:",
        "lint:",
        "test:",
        "test-fast:",
        "web:",
        "backend-core:",
        "backend-full:",
        "up-infra:",
        "down-infra:",
        "start-core:",
        "stop-core:",
        "status-core:",
        "up-core:",
        "down-core:",
        "logs-core:",
        "start-full:",
        "stop-full:",
        "status-full:",
        "up-full:",
        "down-full:",
        "logs-full:",
        "verify-core:",
        "compose-core-config:",
        "compose-full-config:",
    ]:
        assert token in content


def test_makefile_wraps_existing_native_and_compose_commands():
    content = MAKEFILE.read_text(encoding="utf-8")

    for token in [
        "PYTHON ?= python3",
        "$(PYTHON) -m http.server 4173 --directory apps/web",
        "UV ?= uv",
        "$(UV) run uvicorn --app-dir apps/api-gateway main:app --host 0.0.0.0 --port 8000",
        "$(UV) run uvicorn --app-dir apps/orchestrator main:app --host 0.0.0.0 --port 8010",
        "$(UV) run uvicorn --app-dir services/asr-service main:app --host 0.0.0.0 --port 8020",
        "$(UV) run uvicorn --app-dir services/dialogue-service main:app --host 0.0.0.0 --port 8030",
        "$(UV) run uvicorn --app-dir services/tts-service main:app --host 0.0.0.0 --port 8040",
        "$(UV) run uvicorn --app-dir services/avatar-driver-service main:app --host 0.0.0.0 --port 8050",
        "$(UV) run uvicorn --app-dir services/affect-service main:app --host 0.0.0.0 --port 8060",
        "$(UV) run uvicorn --app-dir services/rag-service main:app --host 0.0.0.0 --port 8070",
        "DOCKER_COMPOSE ?= docker compose",
        "$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.core.yml ps",
        "$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.core.yml up -d --build",
        "$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.full.yml ps",
        "$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.full.yml up -d --build",
        "start-core: up-core",
        "stop-core: down-core",
        "start-full: up-full",
        "stop-full: down-full",
    ]:
        assert token in content


def test_makefile_describes_manual_backend_helpers_as_print_only_debug_tools():
    content = MAKEFILE.read_text(encoding="utf-8")

    assert "Print only: native debug commands for the core backend services" in content
    assert "Print only: native debug commands for the full backend services" in content
    assert "Do not mix these commands with make start-core or make start-full on the same ports." in content


def test_docs_reference_compose_first_startup_workflow():
    readme = README.read_text(encoding="utf-8")
    compose_readme = COMPOSE_README.read_text(encoding="utf-8")
    web_readme = WEB_README.read_text(encoding="utf-8")
    emotion_app_readme = EMOTION_APP_README.read_text(encoding="utf-8")

    assert "make start-core" in readme
    assert "make status-core" in readme
    assert "make start-full" in readme
    assert "make stop-full" in readme
    assert "make backend-core" in readme
    assert "debugging only" in readme
    assert "address already in use" in readme

    assert "make start-core" in compose_readme
    assert "make status-core" in compose_readme
    assert "make start-full" in compose_readme
    assert "address already in use" in compose_readme

    assert "make start-core" in web_readme
    assert "make start-full" in web_readme
    assert "advanced debugging only" in web_readme

    assert "npm start" in emotion_app_readme
    assert "http://localhost:3000" in emotion_app_readme
    assert "make start-core" in emotion_app_readme
    assert "make start-full" in emotion_app_readme
