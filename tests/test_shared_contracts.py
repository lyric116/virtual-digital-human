from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_DOC = ROOT / "docs" / "shared_contracts.md"
README = ROOT / "README.md"
LIBS_README = ROOT / "libs" / "README.md"
SCHEMA_README = ROOT / "libs" / "shared-schema" / "README.md"

REQUIRED_HEADINGS = [
    "## Naming Rules",
    "## Cross-Cutting Identifiers",
    "## Session Object",
    "## Event Envelope",
    "## Event Names",
    "## Text Input Request",
    "## Transcript Result",
    "## Dialogue Result",
    "## Avatar Command",
    "## Error Response",
]

REQUIRED_FIELDS = [
    "trace_id",
    "session_id",
    "message_id",
    "record_id",
    "dataset",
    "canonical_role",
    "segment_id",
    "event_id",
    "event_type",
    "schema_version",
    "source_service",
    "emitted_at",
    "payload",
    "content_text",
    "transcript_kind",
    "reply",
    "emotion",
    "risk_level",
    "stage",
    "next_action",
    "knowledge_refs",
    "avatar_style",
    "avatar_id",
    "audio_url",
    "viseme_seq",
    "expression",
    "gesture",
    "error_code",
    "retryable",
    "details",
]

DISALLOWED_CAMEL_CASE = [
    "traceId",
    "sessionId",
    "messageId",
    "recordId",
    "eventType",
    "riskLevel",
    "avatarId",
]


def test_shared_contracts_cover_required_sections_and_fields():
    content = CONTRACT_DOC.read_text(encoding="utf-8")

    missing_headings = [heading for heading in REQUIRED_HEADINGS if heading not in content]
    missing_fields = [field for field in REQUIRED_FIELDS if f"`{field}`" not in content]

    assert not missing_headings, f"missing headings in shared_contracts.md: {missing_headings}"
    assert not missing_fields, f"missing fields in shared_contracts.md: {missing_fields}"


def test_shared_contracts_avoid_camel_case_aliases():
    content = CONTRACT_DOC.read_text(encoding="utf-8")
    collisions = [field for field in DISALLOWED_CAMEL_CASE if field in content]
    assert not collisions, f"unexpected camelCase field aliases in shared_contracts.md: {collisions}"


def test_readmes_point_to_shared_contracts():
    readme = README.read_text(encoding="utf-8")
    libs_readme = LIBS_README.read_text(encoding="utf-8")
    schema_readme = SCHEMA_README.read_text(encoding="utf-8")

    assert "docs/shared_contracts.md" in readme
    assert "shared-schema" in libs_readme
    assert "docs/shared_contracts.md" in schema_readme
