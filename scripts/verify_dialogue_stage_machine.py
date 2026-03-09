#!/usr/bin/env python3
"""Verify the gateway dialogue stage machine with a fixed scripted sequence."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
GATEWAY_MAIN = ROOT / "apps" / "api-gateway" / "main.py"


def load_gateway_module():
    spec = importlib.util.spec_from_file_location("api_gateway_stage_machine_verify", GATEWAY_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load api gateway module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> None:
    module = load_gateway_module()
    current_stage = "engage"
    steps = [
        {"turn": 1, "proposed_stage": "assess", "risk_level": "low"},
        {"turn": 2, "proposed_stage": "reassess", "risk_level": "medium"},
        {"turn": 3, "proposed_stage": "reassess", "risk_level": "low"},
        {"turn": 4, "proposed_stage": "engage", "risk_level": "low"},
        {"turn": 5, "proposed_stage": "handoff", "risk_level": "medium"},
    ]
    observed: list[dict[str, str]] = []

    for step in steps:
        resolved_stage, reason = module.resolve_session_stage_transition(
            current_stage=current_stage,
            proposed_stage=step["proposed_stage"],
            risk_level=step["risk_level"],
        )
        observed.append(
            {
                "turn": str(step["turn"]),
                "current_stage": current_stage,
                "proposed_stage": step["proposed_stage"],
                "resolved_stage": resolved_stage,
                "reason": reason,
            }
        )
        current_stage = resolved_stage

    expected_resolved_stages = ["assess", "intervene", "reassess", "reassess", "handoff"]
    actual_resolved_stages = [item["resolved_stage"] for item in observed]
    if actual_resolved_stages != expected_resolved_stages:
        raise RuntimeError(
            f"unexpected stage sequence: {actual_resolved_stages} != {expected_resolved_stages}"
        )

    print(
        json.dumps(
            {
                "expected_resolved_stages": expected_resolved_stages,
                "observed": observed,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
