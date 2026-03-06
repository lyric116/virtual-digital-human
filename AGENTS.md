# Repository Guidelines

## Project Structure & Module Organization
This repository is currently bootstrap-level and intentionally minimal. Use this layout as code is added:
- `src/`: application code, organized by feature (`src/<feature>/...`)
- `tests/`: automated tests mirroring `src/`
- `assets/`: static files, fixtures, and sample data
- `scripts/`: repeatable automation used locally and in CI
- `docs/`: architecture notes and ADRs

Prefer small, cohesive modules over large shared utility files.

## Build, Test, and Development Commands
No build system is committed yet. When introducing tooling, expose a stable set of top-level commands and keep them documented in `README.md`.

Recommended command surface:
- `make setup`: install dependencies and initialize local tooling
- `make lint`: run all linters/format checks
- `make test`: run the full test suite
- `make dev`: start the local development environment

If you do not use `make`, provide equivalent commands in one canonical place (for example `package.json` or `pyproject.toml`).

## Coding Style & Naming Conventions
Use consistent formatting by language:
- Python: 4-space indentation, `snake_case` modules/functions, `PascalCase` classes
- JS/TS/JSON/YAML: 2-space indentation, `camelCase` variables/functions, `PascalCase` types/classes, `kebab-case` filenames where appropriate

Keep lines under 100 characters unless readability clearly improves otherwise.
Run formatter and linter before opening a PR (for example `ruff format`, `ruff check`, or `prettier --check .` depending on stack).

## Testing Guidelines
Place tests in `tests/` with clear names such as `test_auth.py` or `auth.test.ts`.
For each new feature, include:
- one happy-path test
- one edge or failure-path test

Add regression tests for bug fixes. Aim for at least 80% coverage in changed modules.

## Commit & Pull Request Guidelines
Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

Each PR should include:
- concise summary and scope
- linked issue/task when available (`Closes #123`)
- test evidence (commands run and results)
- screenshots or logs for UI/behavioral changes

Keep changes focused; submit unrelated work in separate PRs.
