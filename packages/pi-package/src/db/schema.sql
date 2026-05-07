-- infra-harness knowledge base schema
-- SQLite with WAL mode, FTS5, and sqlite-vec

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

--------------------------------------------------------------------------------
-- Schema versioning
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER NOT NULL,
    applied_at  INTEGER NOT NULL
);

--------------------------------------------------------------------------------
-- Context graph: entities
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entities (
    id          TEXT    PRIMARY KEY,
    type        TEXT    NOT NULL CHECK(type IN (
                    'service','repo','cluster','namespace','cloud_resource',
                    'pipeline','alert','incident','team','runbook','knowledge_item'
                )),
    name        TEXT    NOT NULL,
    env         TEXT,                       -- prod | staging | dev | null = cross-env
    provider    TEXT,                       -- aws | k8s | github | null
    external_id TEXT,                       -- provider-native identifier
    metadata    TEXT    DEFAULT '{}',       -- JSON blob
    ingested_at INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    freshness   REAL    NOT NULL DEFAULT 1.0 CHECK(freshness >= 0.0 AND freshness <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_entities_type      ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_env       ON entities(env);
CREATE INDEX IF NOT EXISTS idx_entities_provider  ON entities(provider);
CREATE INDEX IF NOT EXISTS idx_entities_name      ON entities(name);

--------------------------------------------------------------------------------
-- Context graph: edges (typed relationships)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS edges (
    id          TEXT    PRIMARY KEY,
    from_id     TEXT    NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    to_id       TEXT    NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation    TEXT    NOT NULL CHECK(relation IN (
                    'deployed_from','runs_in','depends_on','associated_with',
                    'references','owned_by','applies_to','supported_by'
                )),
    metadata    TEXT    DEFAULT '{}',       -- JSON blob
    confidence  REAL    NOT NULL DEFAULT 1.0 CHECK(confidence >= 0.0 AND confidence <= 1.0),
    ingested_at INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    freshness   REAL    NOT NULL DEFAULT 1.0 CHECK(freshness >= 0.0 AND freshness <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_edges_from     ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to       ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation);

--------------------------------------------------------------------------------
-- Memory engine: durable operational facts
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS memory_items (
    id               TEXT    PRIMARY KEY,
    content          TEXT    NOT NULL,
    type             TEXT    NOT NULL CHECK(type IN ('fact','lesson','pattern','runbook_note')),
    env              TEXT,
    confidence       TEXT    NOT NULL DEFAULT 'inferred'
                     CHECK(confidence IN ('verified','inferred','stale','disputed')),
    freshness        REAL    NOT NULL DEFAULT 1.0 CHECK(freshness >= 0.0 AND freshness <= 1.0),
    author           TEXT,
    session_id       TEXT,
    investigation_id TEXT,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_env        ON memory_items(env);
CREATE INDEX IF NOT EXISTS idx_memory_confidence ON memory_items(confidence);
CREATE INDEX IF NOT EXISTS idx_memory_freshness  ON memory_items(freshness);

--------------------------------------------------------------------------------
-- Memory engine: entity references (memory_item ↔ entity, many-to-many)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS memory_entity_refs (
    memory_id   TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
    entity_id   TEXT NOT NULL REFERENCES entities(id)     ON DELETE CASCADE,
    PRIMARY KEY (memory_id, entity_id)
);

--------------------------------------------------------------------------------
-- Memory engine: evidence links
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS memory_evidence (
    id          TEXT    PRIMARY KEY,
    memory_id   TEXT    NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL CHECK(type IN ('tool_result','commit','alert','dashboard','url','other')),
    reference   TEXT    NOT NULL,           -- URI or structured ID
    summary     TEXT,
    captured_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_memory ON memory_evidence(memory_id);

--------------------------------------------------------------------------------
-- Memory engine: full-text search (FTS5)
--------------------------------------------------------------------------------

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    content,
    content='memory_items',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory_items BEGIN
    INSERT INTO memory_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE ON memory_items BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO memory_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory_items BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

--------------------------------------------------------------------------------
-- Memory engine: vector embeddings (sqlite-vec)
-- Loaded at connection time: db.loadExtension('sqlite-vec') / SqliteVec.load(db)
-- Created after the extension is loaded — handled in migrate.ts
--------------------------------------------------------------------------------

-- CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
--     memory_id   TEXT PARTITION KEY,
--     embedding   FLOAT[1536]
-- );
-- ^ Uncommented programmatically after sqlite-vec is loaded (see migrate.ts)

--------------------------------------------------------------------------------
-- Audit log (permission broker)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT    PRIMARY KEY,
    session_id  TEXT    NOT NULL,
    capability  TEXT    NOT NULL,
    tool_name   TEXT    NOT NULL,
    tool_args   TEXT    DEFAULT '{}',       -- JSON blob
    outcome     TEXT    NOT NULL CHECK(outcome IN ('permitted','blocked','approved')),
    reason      TEXT,
    operator    TEXT,
    occurred_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_session    ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_capability ON audit_log(capability);
CREATE INDEX IF NOT EXISTS idx_audit_outcome    ON audit_log(outcome);
