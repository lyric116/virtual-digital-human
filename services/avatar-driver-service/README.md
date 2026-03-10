# Avatar Driver Service

## Purpose

This service covers implementation plan step 35A:

- read enterprise `3D_FV_files`
- validate offline timing alignment against emotion CSV rows
- emit a deterministic avatar-driver result structure for evaluation

## Files

- `main.py`
  - FastAPI app, offline 3D feature loading, alignment checks, and sampled driver output

## Endpoints

- `GET /health`
- `POST /internal/avatar/offline-drive`

## Local Run

From repository root:

- `UV_CACHE_DIR=.uv-cache uv run uvicorn --app-dir services/avatar-driver-service main:app --host 0.0.0.0 --port 8050`

## Notes

- This is an offline evaluation boundary, not an online rendering dependency.
- The service reads `face3d_path` and optional `emotion_path` from `data/`.
- `3D_FV_files/*_full.npy` remains out of the V1 path unless explicitly selected later.
- The current driver output is a sampled parameter structure for validation, not a final
  production animation rig.
