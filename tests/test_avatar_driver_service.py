from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SERVICE_MAIN = ROOT / "services" / "avatar-driver-service" / "main.py"
SERVICE_README = ROOT / "services" / "avatar-driver-service" / "README.md"


def load_avatar_driver_module():
    spec = importlib.util.spec_from_file_location("avatar_driver_main_test", SERVICE_MAIN)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load avatar-driver-service module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_avatar_driver_normalizes_face3d_and_builds_frames():
    module = load_avatar_driver_module()
    face3d = np.arange(4 * 1 * 58, dtype=float).reshape(4, 1, 58)

    normalized = module.normalize_face3d_array(face3d)
    frames = module.build_driver_frames(normalized, sample_stride=2, max_output_frames=4)

    assert normalized.shape == (4, 58)
    assert len(frames) >= 2
    assert frames[0].frame_index == 0
    assert frames[-1].frame_index == 3


def test_avatar_driver_offline_route_returns_alignment_summary(tmp_path):
    module = load_avatar_driver_module()
    app = module.create_app()
    route = next(route for route in app.routes if route.path == "/internal/avatar/offline-drive")

    assets_dir = ROOT / "data" / "derived" / "test_avatar_driver_assets" / tmp_path.name
    assets_dir.mkdir(parents=True, exist_ok=True)
    face3d_path = assets_dir / "sample.npy"
    emotion_path = assets_dir / "sample.csv"
    np.save(face3d_path, np.ones((6, 1, 58), dtype=float))
    emotion_path.write_text(
        "AU1,valence,arousal,Neutral,Happy,Sad,Surprise,Fear,Disgust,Anger,Contempt\n"
        "0.0,0.2,0.1,0.8,0.1,0.02,0.01,0.01,0.01,0.04,0.01\n"
        "0.0,0.1,0.2,0.7,0.2,0.03,0.01,0.01,0.01,0.03,0.01\n",
        encoding="utf-8",
    )

    payload = route.endpoint(
        module.OfflineAvatarDriveRequest(
            record_id="test/record/001",
            avatar_id="coach_male_01",
            face3d_path=str(face3d_path.relative_to(ROOT)),
            emotion_path=str(emotion_path.relative_to(ROOT)),
            sample_stride=2,
            max_output_frames=4,
        )
    )

    assert payload.record_id == "test/record/001"
    assert payload.avatar_id == "coach_male_01"
    assert payload.frame_count == 6
    assert payload.feature_dim == 58
    assert payload.emotion_row_count == 2
    assert payload.alignment_status == "mismatch"
    assert payload.mismatch_steps == 4
    assert payload.driver_summary.dominant_emotion == "Neutral"
    assert len(payload.driver_frames) >= 2


def test_avatar_driver_service_readme_documents_endpoint():
    module = load_avatar_driver_module()
    app = module.create_app()
    content = SERVICE_README.read_text(encoding="utf-8")
    paths = {route.path for route in app.routes}

    assert "/health" in paths
    assert "/internal/avatar/offline-drive" in paths
    assert "POST /internal/avatar/offline-drive" in content
