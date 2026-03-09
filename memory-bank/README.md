# Memory Bank

## Purpose

`memory-bank/` stores durable project memory for future developers. It is the place to look
first when resuming work after a pause or a handoff.

## Files

- `progress.md`
  - append-only implementation log
- `architecture.md`
  - stable repository structure and architecture insights
- `handoff-summary.md`
  - human-readable cross-chat summary and resume guide
- `handoff-summary.json`
  - machine-readable snapshot of current project state

## Update Rules

1. Every successful implementation step must append one new entry to `progress.md`
   before commit.
2. Every newly discovered stable design constraint must append one new insight to
   `architecture.md` before commit when the constraint affects future work.
3. Do not rewrite old entries unless they are factually wrong.
4. Prefer automation over manual editing.
5. Run tests after the append so committed history and memory-bank stay aligned.

## Automation

Use `scripts/update_memory_bank.py`.

- Append progress:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/update_memory_bank.py append-progress --title "..." --scope "..." --output "..." --check "..." --next-step "..."`
- Append architecture insight:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/update_memory_bank.py append-architecture --title "..." --insight "..."`
