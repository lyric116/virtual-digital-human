#!/usr/bin/env python3
"""Append structured entries to the memory-bank markdown files."""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MEMORY_BANK = ROOT / "memory-bank"
PROGRESS_PATH = MEMORY_BANK / "progress.md"
ARCHITECTURE_PATH = MEMORY_BANK / "architecture.md"

PROGRESS_START = "<!-- progress:entries:start -->"
PROGRESS_END = "<!-- progress:entries:end -->"
ARCH_START = "<!-- architecture:insights:start -->"
ARCH_END = "<!-- architecture:insights:end -->"


def insert_before_marker(path: Path, start_marker: str, end_marker: str, entry: str) -> None:
    text = path.read_text(encoding="utf-8")
    if start_marker not in text or end_marker not in text:
        raise ValueError(f"missing markers in {path}")

    start_idx = text.index(start_marker) + len(start_marker)
    end_idx = text.index(end_marker)
    before = text[:start_idx].rstrip()
    middle = text[start_idx:end_idx].strip()
    after = text[end_idx:]

    parts = [before, "", entry.strip()]
    if middle:
        parts.extend(["", middle])
    new_text = "\n".join(parts) + "\n" + after.lstrip("\n")
    path.write_text(new_text, encoding="utf-8")


def normalize_items(values: list[str]) -> str:
    return "\n".join([f"- {value}" for value in values])


def cmd_append_progress(args: argparse.Namespace) -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    entry = f"""## {today} - {args.title}

### Scope

{args.scope}

### Outputs

{normalize_items(args.output)}

### Checks

{normalize_items(args.check)}

### Next

{normalize_items(args.next_step)}
"""
    insert_before_marker(PROGRESS_PATH, PROGRESS_START, PROGRESS_END, entry)
    print(PROGRESS_PATH.relative_to(ROOT))


def cmd_append_architecture(args: argparse.Namespace) -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    entry = f"""## {today} - {args.title}

{normalize_items(args.insight)}
"""
    insert_before_marker(ARCHITECTURE_PATH, ARCH_START, ARCH_END, entry)
    print(ARCHITECTURE_PATH.relative_to(ROOT))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    progress = sub.add_parser("append-progress")
    progress.add_argument("--title", required=True)
    progress.add_argument("--scope", required=True)
    progress.add_argument("--output", action="append", required=True)
    progress.add_argument("--check", action="append", required=True)
    progress.add_argument("--next-step", action="append", required=True)
    progress.set_defaults(func=cmd_append_progress)

    architecture = sub.add_parser("append-architecture")
    architecture.add_argument("--title", required=True)
    architecture.add_argument("--insight", action="append", required=True)
    architecture.set_defaults(func=cmd_append_architecture)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
