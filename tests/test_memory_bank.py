from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]


def test_memory_bank_markers_exist():
    progress = (ROOT / "memory-bank" / "progress.md").read_text(encoding="utf-8")
    architecture = (ROOT / "memory-bank" / "architecture.md").read_text(encoding="utf-8")

    assert "<!-- progress:entries:start -->" in progress
    assert "<!-- progress:entries:end -->" in progress
    assert "<!-- architecture:insights:start -->" in architecture
    assert "<!-- architecture:insights:end -->" in architecture


def test_update_memory_bank_script_appends_entries():
    script = ROOT / "scripts" / "update_memory_bank.py"

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        progress = tmp / "progress.md"
        architecture = tmp / "architecture.md"
        progress.write_text(
            "# Progress\n\n<!-- progress:entries:start -->\n<!-- progress:entries:end -->\n",
            encoding="utf-8",
        )
        architecture.write_text(
            "# Architecture\n\n<!-- architecture:insights:start -->\n<!-- architecture:insights:end -->\n",
            encoding="utf-8",
        )

        source = script.read_text(encoding="utf-8")
        source = source.replace('MEMORY_BANK = ROOT / "memory-bank"', f'MEMORY_BANK = ROOT / "{tmp.name}"')
        source = source.replace('PROGRESS_PATH = MEMORY_BANK / "progress.md"', f'PROGRESS_PATH = Path(r"{progress}")')
        source = source.replace(
            'ARCHITECTURE_PATH = MEMORY_BANK / "architecture.md"',
            f'ARCHITECTURE_PATH = Path(r"{architecture}")',
        )
        patched = tmp / "update_memory_bank.py"
        patched.write_text(source, encoding="utf-8")

        subprocess.run(
            [
                "python",
                str(patched),
                "append-progress",
                "--title",
                "Test Entry",
                "--scope",
                "scope text",
                "--output",
                "file_a",
                "--check",
                "check_a",
                "--next-step",
                "next_a",
            ],
            check=True,
            cwd=ROOT,
        )
        subprocess.run(
            [
                "python",
                str(patched),
                "append-architecture",
                "--title",
                "Insight Entry",
                "--insight",
                "insight_a",
            ],
            check=True,
            cwd=ROOT,
        )

        progress_text = progress.read_text(encoding="utf-8")
        architecture_text = architecture.read_text(encoding="utf-8")

        assert "Test Entry" in progress_text
        assert "scope text" in progress_text
        assert "file_a" in progress_text
        assert "Insight Entry" in architecture_text
        assert "insight_a" in architecture_text
