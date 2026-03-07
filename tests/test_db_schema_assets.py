from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SQL_FILE = ROOT / "infra" / "docker" / "postgres" / "init" / "001_base_schema.sql"
SCHEMA_DOC = ROOT / "docs" / "database_schema.md"
VERIFY_SCRIPT = ROOT / "scripts" / "verify_db_schema.py"
COMPOSE_FILE = ROOT / "infra" / "compose" / "docker-compose.yml"


def test_sql_schema_contains_required_tables_and_relationships():
    content = SQL_FILE.read_text(encoding="utf-8")

    for token in [
        "CREATE TABLE IF NOT EXISTS sessions",
        "CREATE TABLE IF NOT EXISTS messages",
        "CREATE TABLE IF NOT EXISTS system_events",
        "CREATE TABLE IF NOT EXISTS evaluation_records",
        "CREATE TABLE IF NOT EXISTS media_indexes",
        "REFERENCES sessions(session_id)",
        "REFERENCES messages(message_id)",
    ]:
        assert token in content


def test_schema_docs_and_runtime_assets_are_wired():
    schema_doc = SCHEMA_DOC.read_text(encoding="utf-8")
    verify_script = VERIFY_SCRIPT.read_text(encoding="utf-8")
    compose = COMPOSE_FILE.read_text(encoding="utf-8")

    assert "001_base_schema.sql" in schema_doc
    assert "sessions" in schema_doc
    assert "messages" in schema_doc
    assert "system_events" in schema_doc
    assert "evaluation_records" in schema_doc
    assert "media_indexes" in schema_doc
    assert "verify_db_schema.py" in schema_doc
    assert "psql" in verify_script
    assert "../docker/postgres/init:/docker-entrypoint-initdb.d:ro" in compose
