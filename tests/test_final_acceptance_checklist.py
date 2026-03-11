import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKLIST_JSON = ROOT / "docs" / "final_acceptance_checklist.json"
VERIFY_SCRIPT = ROOT / "scripts" / "verify_final_acceptance_assets.py"


def test_final_acceptance_checklist_schema():
    payload = json.loads(CHECKLIST_JSON.read_text(encoding="utf-8"))

    assert payload["scope"] == "step-53 final acceptance checklist"
    assert set(payload["allowed_statuses"]) == {"done", "partial", "blocked"}
    assert len(payload["items"]) >= 10

    item_ids = {item["id"] for item in payload["items"]}
    assert "dual_avatar" in item_ids
    assert "delivery_and_docker" in item_ids


def test_verify_final_acceptance_assets_script():
    result = subprocess.run(
        ["python", str(VERIFY_SCRIPT)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    payload = json.loads(result.stdout)
    assert payload["status"] == "ok"
    assert payload["item_count"] >= 10
