from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FULL_COMPOSE = ROOT / "infra" / "compose" / "docker-compose.full.yml"


def test_full_compose_assets_exist():
    assert FULL_COMPOSE.exists()


def test_full_compose_includes_model_services_but_remains_host_coupled():
    content = FULL_COMPOSE.read_text(encoding="utf-8")

    for token in [
        "asr-service:",
        "avatar-driver-service:",
        "ASR_SERVICE_HOST: asr-service",
        "AVATAR_DRIVER_PORT: 8050",
        "../..:/app",
        "../../.venv/lib/python3.11/site-packages:/usr/local/lib/python3.11/site-packages:ro",
    ]:
        assert token in content


def test_full_compose_only_partially_loads_repo_root_env_file_for_runtime_services():
    content = FULL_COMPOSE.read_text(encoding="utf-8")

    assert "env_file:" in content
    assert content.count("- ../../.env") == 4
    assert "ASR_API_KEY:" not in content
    assert "LLM_API_KEY:" not in content
