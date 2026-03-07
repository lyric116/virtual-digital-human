from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "infra" / "compose" / "docker-compose.yml"
COMPOSE_README = ROOT / "infra" / "compose" / "README.md"
INFRA_README = ROOT / "infra" / "README.md"
VERIFY_SCRIPT = ROOT / "scripts" / "verify_infra_stack.py"


def test_compose_file_contains_foundation_services_and_volumes():
    content = COMPOSE_FILE.read_text(encoding="utf-8")

    for token in [
        "postgres:",
        "redis:",
        "minio:",
        "healthcheck:",
        "postgres_data:",
        "redis_data:",
        "minio_data:",
        "POSTGRES_PORT",
        "REDIS_PORT",
        "MINIO_API_PORT",
        "MINIO_CONSOLE_PORT",
    ]:
        assert token in content


def test_infra_docs_point_to_compose_stack_and_verifier():
    compose_readme = COMPOSE_README.read_text(encoding="utf-8")
    infra_readme = INFRA_README.read_text(encoding="utf-8")
    verify_script = VERIFY_SCRIPT.read_text(encoding="utf-8")

    assert "docker-compose.yml" in compose_readme
    assert "scripts/verify_infra_stack.py" in compose_readme
    assert "compose" in infra_readme
    assert '"docker"' in verify_script
    assert '"compose"' in verify_script
