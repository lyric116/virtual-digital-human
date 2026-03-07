from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_EXAMPLE = ROOT / ".env.example"
ENV_DOC = ROOT / "docs" / "environment.md"
README = ROOT / "README.md"
MEMORY_BANK_README = ROOT / "memory-bank" / "README.md"

REQUIRED_SECTIONS = [
    "## Common Runtime",
    "## Web",
    "## Gateway",
    "## Orchestrator",
    "## PostgreSQL",
    "## Redis",
    "## MinIO",
    "## LLM",
    "## ASR",
    "## TTS",
    "## Avatar Driver",
    "## Compatibility Aliases",
]

REQUIRED_KEYS = [
    "APP_ENV",
    "LOG_LEVEL",
    "TRACE_HEADER",
    "SESSION_EXPORT_DIR",
    "WEB_PUBLIC_API_BASE_URL",
    "WEB_PUBLIC_WS_URL",
    "WEB_DEFAULT_AVATAR_ID",
    "GATEWAY_HOST",
    "GATEWAY_PORT",
    "GATEWAY_PUBLIC_BASE_URL",
    "GATEWAY_WS_PATH",
    "GATEWAY_CORS_ORIGINS",
    "ORCHESTRATOR_HOST",
    "ORCHESTRATOR_PORT",
    "ORCHESTRATOR_REQUEST_TIMEOUT_SECONDS",
    "ORCHESTRATOR_SESSION_TTL_SECONDS",
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "REDIS_URL",
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_DB",
    "REDIS_PASSWORD",
    "MINIO_ENDPOINT",
    "MINIO_API_PORT",
    "MINIO_CONSOLE_PORT",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_SECURE",
    "MINIO_BUCKET_RAW",
    "MINIO_BUCKET_DERIVED",
    "MINIO_BUCKET_LOGS",
    "LLM_PROVIDER",
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "LLM_MODEL",
    "LLM_TIMEOUT_SECONDS",
    "LLM_CONTEXT_WINDOW",
    "ASR_PROVIDER",
    "ASR_BASE_URL",
    "ASR_API_KEY",
    "ASR_MODEL",
    "ASR_LANGUAGE_HINT",
    "ASR_TIMEOUT_SECONDS",
    "ASR_MODEL_PATH",
    "TTS_PROVIDER",
    "TTS_BASE_URL",
    "TTS_API_KEY",
    "TTS_MODEL",
    "TTS_VOICE_A",
    "TTS_VOICE_B",
    "TTS_AUDIO_FORMAT",
    "TTS_MODEL_PATH",
    "AVATAR_DRIVER_HOST",
    "AVATAR_DRIVER_PORT",
    "AVATAR_PROTOCOL_VERSION",
    "AVATAR_DEFAULT_ID_A",
    "AVATAR_DEFAULT_ID_B",
    "AVATAR_MODEL_PATH",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "DASHSCOPE_API_KEY",
    "DASHSCOPE_BASE_URL",
    "key",
    "baseurl",
    "model",
]


def parse_env_keys(path: Path) -> set[str]:
    keys: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _ = line.split("=", 1)
        keys.add(key.strip())
    return keys


def test_env_example_contains_required_keys():
    keys = parse_env_keys(ENV_EXAMPLE)
    missing = [key for key in REQUIRED_KEYS if key not in keys]
    assert not missing, f"missing env keys from .env.example: {missing}"


def test_environment_doc_covers_sections_and_keys():
    content = ENV_DOC.read_text(encoding="utf-8")
    missing_sections = [section for section in REQUIRED_SECTIONS if section not in content]
    missing_keys = [key for key in REQUIRED_KEYS if f"`{key}`" not in content]
    assert not missing_sections, f"missing sections in environment.md: {missing_sections}"
    assert not missing_keys, f"missing keys in environment.md: {missing_keys}"


def test_readme_points_to_environment_inventory_and_memory_bank_flow():
    readme = README.read_text(encoding="utf-8")
    memory_bank = MEMORY_BANK_README.read_text(encoding="utf-8")

    assert ".env.example" in readme
    assert "docs/environment.md" in readme
    assert "scripts/update_memory_bank.py" in memory_bank
    assert "Every successful implementation step" in memory_bank
