# virtual-huamn

## Status

Current repository state:

- enterprise validation data has been indexed into `manifest`, transcript workflow, and QC assets
- `16kHz mono` ASR input audio has been generated under `data/derived/audio_16k_mono`
- external ASR draft generation has been verified with `qwen3-asr-flash`
- the monorepo engineering skeleton from `implementation_plan` step 1 is now in place

## Repository Structure

| Path | Purpose |
| --- | --- |
| `apps/web` | frontend application |
| `apps/api-gateway` | unified API entrypoint and session-facing APIs |
| `apps/orchestrator` | workflow orchestration across ASR, affect, RAG, dialogue, TTS, and avatar |
| `services/asr-service` | speech recognition service and evaluation entrypoint |
| `services/affect-service` | multimodal affect and risk inference |
| `services/rag-service` | knowledge retrieval and grounding |
| `services/dialogue-service` | structured dialogue generation and state machine |
| `services/tts-service` | speech synthesis |
| `services/avatar-driver-service` | avatar playback and behavior driving |
| `libs/shared-schema` | shared contracts, payload schemas, and event definitions |
| `libs/prompt-templates` | prompt assets and intervention templates |
| `libs/eval-tools` | reusable evaluation helpers |
| `data/` | raw enterprise data and derived artifacts |
| `infra/docker` | Dockerfiles |
| `infra/compose` | compose stacks and service wiring |
| `infra/nginx` | gateway and reverse proxy config |
| `docs/` | architecture, implementation plan, and data specs |
| `scripts/` | repeatable local and CI automation |
| `tests/` | automated tests and regression fixtures |

## Python Runtime

Use `uv run` for Python commands. The project already has `pyproject.toml` and `uv.lock`.

- Python version check:
  - `UV_CACHE_DIR=.uv-cache uv run python -V`
- Add a dependency:
  - `uv add <package>`

## Data And ASR Commands

- Rebuild manifest, transcript workflow, and QC report:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/build_data_artifacts.py`
- Generate `16kHz mono` ASR input audio and backfill manifest/transcripts:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/prepare_asr_audio.py`
- Select an ASR review batch:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/write_asr_drafts.py select-batch --batch-id review_batch_001 --limit 8 --balanced-by-group --per-group 2`
- Run DashScope `qwen3-asr-flash` on a batch:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/write_asr_drafts.py transcribe-openai --batch data/derived/transcripts/batches/review_batch_001.jsonl --model qwen3-asr-flash`
- Import external ASR draft results from a JSONL file:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/write_asr_drafts.py import-results --results <results.jsonl>`
- Generate a manual review checklist:
  - `UV_CACHE_DIR=.uv-cache uv run python scripts/generate_review_checklist.py --batch data/derived/transcripts/batches/review_batch_001.jsonl --output data/derived/transcripts/review_tasks/review_batch_001_manual_review.md`

## Environment Variables

The canonical environment inventory is:

- `docs/environment.md`
- `.env.example`

For DashScope ASR with the current script, prefer:

- `DASHSCOPE_API_KEY`
- `OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`

Supported shorthand keys in `.env`:

- `key`
- `baseurl`
- `model`

Do not point the current ASR script at
`https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription`; that is a
different API path than the OpenAI-compatible route used here.

## Docker

Docker is available in the current environment. Containerization work should be added under `infra/docker` and `infra/compose` as the service skeletons are implemented.
