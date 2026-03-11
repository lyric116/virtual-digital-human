#!/usr/bin/env python3
"""Validate the final acceptance checklist references real evidence files."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKLIST_PATH = ROOT / "docs" / "final_acceptance_checklist.json"
ALLOWED_STATUSES = {"done", "partial", "blocked"}


def main() -> None:
    payload = json.loads(CHECKLIST_PATH.read_text(encoding="utf-8"))
    items = payload.get("items", [])

    missing_paths: list[str] = []
    invalid_statuses: list[str] = []
    status_counts = {status: 0 for status in ALLOWED_STATUSES}

    for item in items:
        status = item.get("status")
        if status not in ALLOWED_STATUSES:
            invalid_statuses.append(f"{item.get('id')}: {status}")
            continue
        status_counts[status] += 1

        for raw_path in item.get("evidence_paths", []):
            evidence_path = ROOT / raw_path
            if not evidence_path.exists():
                missing_paths.append(raw_path)

    if invalid_statuses or missing_paths:
        raise SystemExit(
            json.dumps(
                {
                    "status": "failed",
                    "invalid_statuses": invalid_statuses,
                    "missing_paths": missing_paths,
                },
                ensure_ascii=False,
                indent=2,
            )
        )

    print(
        json.dumps(
            {
                "status": "ok",
                "checklist_path": str(CHECKLIST_PATH.relative_to(ROOT)),
                "item_count": len(items),
                "status_counts": status_counts,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
