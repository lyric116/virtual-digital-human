from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAKEFILE = ROOT / "Makefile"
README = ROOT / "README.md"
COMPOSE_README = ROOT / "infra" / "compose" / "README.md"
WEB_README = ROOT / "apps" / "web" / "README.md"


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
        "up-core:",
        "down-core:",
        "logs-core:",
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
        "$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.core.yml up -d --build",
        "$(DOCKER_COMPOSE) --env-file .env -f infra/compose/docker-compose.full.yml up -d --build",
    ]:
        assert token in content


def test_docs_reference_makefile_shortcuts():
    readme = README.read_text(encoding="utf-8")
    compose_readme = COMPOSE_README.read_text(encoding="utf-8")
    web_readme = WEB_README.read_text(encoding="utf-8")

    assert "make up-core" in readme
    assert "make up-full" in readme
    assert "make backend-core" in readme
    assert "make web" in readme
    assert "make up-core" in compose_readme
    assert "make up-full" in compose_readme
    assert "make web" in web_readme
