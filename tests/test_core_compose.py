from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CORE_COMPOSE = ROOT / "infra" / "compose" / "docker-compose.core.yml"
CORE_VERIFY = ROOT / "scripts" / "verify_core_compose_stack.py"
PYTHON_DOCKERFILE = ROOT / "infra" / "docker" / "python-service" / "Dockerfile"
WEB_DOCKERFILE = ROOT / "infra" / "docker" / "web" / "Dockerfile"
WEB_CONFIG = ROOT / "apps" / "web" / "config.js"


def test_core_compose_stack_assets_exist():
    for path in [CORE_COMPOSE, CORE_VERIFY, PYTHON_DOCKERFILE, WEB_DOCKERFILE, WEB_CONFIG]:
        assert path.exists(), f"missing core compose asset: {path}"


def test_core_compose_includes_core_services_and_verifier_targets():
    compose_content = CORE_COMPOSE.read_text(encoding="utf-8")
    verify_content = CORE_VERIFY.read_text(encoding="utf-8")

    for token in [
        "web:",
        "gateway:",
        "orchestrator:",
        "dialogue-service:",
        "rag-service:",
        "affect-service:",
        "tts-service:",
        "postgres:",
        "redis:",
        "minio:",
        "docker-compose.core.yml",
    ]:
        assert token in compose_content or token in verify_content

    assert "/api/session/create" in verify_content
    assert "/api/session/" in verify_content
    assert "config.js" in verify_content


def test_python_service_dockerfile_uses_local_site_packages_layer():
    dockerfile_content = PYTHON_DOCKERFILE.read_text(encoding="utf-8")
    compose_content = CORE_COMPOSE.read_text(encoding="utf-8")
    dockerignore_content = (ROOT / ".dockerignore").read_text(encoding="utf-8")

    assert "COPY apps /app/apps" in dockerfile_content
    assert "PYTHONPATH=/app" in dockerfile_content
    assert ".venv" in dockerignore_content
    assert "../../.venv/lib/python3.11/site-packages:/usr/local/lib/python3.11/site-packages:ro" in compose_content
    assert "urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5).read()" in compose_content


def test_core_compose_loads_repo_root_env_file_for_runtime_service_config():
    compose_content = CORE_COMPOSE.read_text(encoding="utf-8")

    assert "env_file:" in compose_content
    assert "- ../../.env" in compose_content
    assert "LLM_API_KEY:" not in compose_content
    assert "WEB_PUBLIC_API_BASE_URL:" not in compose_content
