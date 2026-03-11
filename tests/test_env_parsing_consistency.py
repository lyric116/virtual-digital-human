from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    target = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, target)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load module: {relative_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_env_parsers_normalize_export_colon_and_quotes(tmp_path: Path):
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join(
            [
                'export LLM_API_KEY="abc123"',
                'LLM_BASE_URL: "https://example.test/v1"',
                "PLAIN_VALUE=ok",
            ]
        ),
        encoding="utf-8",
    )

    gateway = load_module("env_parse_gateway_test", "apps/api-gateway/main.py")
    orchestrator = load_module("env_parse_orchestrator_test", "apps/orchestrator/main.py")
    dialogue = load_module("env_parse_dialogue_test", "services/dialogue-service/main.py")
    asr = load_module("env_parse_asr_test", "services/asr-service/main.py")

    expected = {
        "LLM_API_KEY": "abc123",
        "LLM_BASE_URL": "https://example.test/v1",
        "PLAIN_VALUE": "ok",
    }

    assert gateway.parse_env_file(env_path) == expected
    assert orchestrator.parse_env_file(env_path) == expected
    assert dialogue.parse_env_file(env_path) == expected
    assert asr.parse_env_file(env_path) == expected


def test_bootstrap_runtime_env_overrides_blank_environment_values(tmp_path: Path, monkeypatch):
    env_example = tmp_path / ".env.example"
    env_file = tmp_path / ".env"
    env_example.write_text("ASR_API_KEY=\nLLM_API_KEY=\n", encoding="utf-8")
    env_file.write_text(
        "\n".join(
            [
                "ASR_API_KEY=real_asr_key",
                "LLM_API_KEY=real_llm_key",
            ]
        ),
        encoding="utf-8",
    )

    gateway = load_module("env_bootstrap_gateway_test", "apps/api-gateway/main.py")
    orchestrator = load_module("env_bootstrap_orchestrator_test", "apps/orchestrator/main.py")
    dialogue = load_module("env_bootstrap_dialogue_test", "services/dialogue-service/main.py")
    asr = load_module("env_bootstrap_asr_test", "services/asr-service/main.py")

    modules = [gateway, orchestrator, dialogue, asr]
    original_values = {
        "ASR_API_KEY": os.environ.get("ASR_API_KEY"),
        "LLM_API_KEY": os.environ.get("LLM_API_KEY"),
    }

    try:
        for module in modules:
            monkeypatch.setattr(module, "ROOT", tmp_path)
            os.environ["ASR_API_KEY"] = ""
            os.environ["LLM_API_KEY"] = "   "
            module.bootstrap_runtime_env()
            assert os.environ["ASR_API_KEY"] == "real_asr_key"
            assert os.environ["LLM_API_KEY"] == "real_llm_key"
    finally:
        for key, value in original_values.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
