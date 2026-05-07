# Knowledge Base

The knowledge base is the persistent store that backs both the **context graph** and the **memory engine**. It is a single embedded **SQLite** file with two extensions: `sqlite-vec` for vector similarity search and `FTS5` for full-text search (FTS5 is built into SQLite by default).

---

## Why SQLite

The store has strict constraints:

| Constraint | Requirement |
|---|---|
| Embedded | No server process. Engineers run this on a laptop or in a container. |
| Cross-platform | macOS, Windows, Linux — same file format everywhere. |
| Dual-process access | pi (Node.js extension) writes; Tauri (Rust backend) reads. |
| Graph traversal | Entities and typed relationships, multi-hop queries. |
| Semantic similarity | Known-pattern recall requires vector nearest-neighbour search. |
| Full-text search | Memory item retrieval by keyword. |
| Lightweight | Small binary footprint; no additional runtime dependency. |

SQLite satisfies all of them:

- **Node.js**: `better-sqlite3` (synchronous, fast, well-maintained — v12.9.0)
- **Rust**: `rusqlite` (ergonomic wrapper — v0.39.0)
- **Vector search**: `sqlite-vec` extension (v0.1.9, loadable from both Node.js and Rust)
- **Full-text search**: FTS5 is built into SQLite — no extension needed
- **Concurrent access**: WAL mode allows one writer and many readers simultaneously

No other embedded store satisfies all constraints. Kuzu (embedded graph DB with Cypher) is promising but has immature multi-language binding support. LanceDB excels at vector search but is not a graph store. Everything needed fits naturally in SQLite.

---

## File Layout

```
~/.infra-harness/
└── kb.sqlite          ← single knowledge base file (WAL mode)
    ├── WAL journal    (kb.sqlite-wal)
    └── shared memory  (kb.sqlite-shm)
```

The file path is configurable. In a team environment, the knowledge base can be shared via a networked filesystem or replicated via a sync mechanism (future work).

---

## Schema

### Context Graph

#### `entities`

Stores every node in the infrastructure graph.

```sql
CREATE TABLE entities (
    id          TEXT PRIMARY KEY,           -- stable UUID
    type        TEXT NOT NULL,              -- service | repo | cluster | namespace |
                                            -- cloud_resource | pipeline | alert |
                                            -- incident | team | runbook | knowledge_item
    name        TEXT NOT NULL,
    env         TEXT,                       -- prod | staging | dev | null (cross-env)
    provider    TEXT,                       -- aws | k8s | github | null
    external_id TEXT,                       -- provider-native identifier
    metadata    JSON,                       -- arbitrary provider-specific fields
    ingested_at INTEGER NOT NULL,           -- unix ms
    updated_at  INTEGER NOT NULL,
    freshness   REAL DEFAULT 1.0            -- 0.0 (stale) → 1.0 (fresh), decays over time
);

CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_env  ON entities(env);
```

#### `edges`

Stores every typed relationship between entities.

```sql
CREATE TABLE edges (
    id           TEXT PRIMARY KEY,
    from_id      TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    to_id        TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation     TEXT NOT NULL,             -- deployed_from | runs_in | depends_on |
                                            -- associated_with | references | owned_by |
                                            -- applies_to | supported_by
    metadata     JSON,                      -- e.g. { "since": "2025-01-01", "image": "sha256:..." }
    confidence   REAL DEFAULT 1.0,          -- 0.0 → 1.0
    ingested_at  INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    freshness    REAL DEFAULT 1.0
);

CREATE INDEX idx_edges_from     ON edges(from_id);
CREATE INDEX idx_edges_to       ON edges(to_id);
CREATE INDEX idx_edges_relation ON edges(relation);
```

#### Graph traversal

Multi-hop traversal uses recursive CTEs — no graph extension needed:

```sql
-- All entities reachable from 'checkout' within 2 hops via depends_on
WITH RECURSIVE neighbors(id, depth) AS (
    SELECT 'checkout-service-id', 0
    UNION ALL
    SELECT e.to_id, n.depth + 1
    FROM edges e
    JOIN neighbors n ON e.from_id = n.id
    WHERE e.relation = 'depends_on' AND n.depth < 2
)
SELECT entities.* FROM entities JOIN neighbors ON entities.id = neighbors.id;
```

---

### Memory Engine

#### `memory_items`

Durable operational facts, lessons, and validated patterns.

```sql
CREATE TABLE memory_items (
    id              TEXT PRIMARY KEY,
    content         TEXT NOT NULL,          -- the fact, lesson, or pattern in plain text
    type            TEXT NOT NULL,          -- fact | lesson | pattern | runbook_note
    env             TEXT,                   -- environment scope (null = all envs)
    confidence      TEXT NOT NULL           -- verified | inferred | stale | disputed
                    CHECK(confidence IN ('verified','inferred','stale','disputed')),
    freshness       REAL DEFAULT 1.0,       -- decays over time; revalidation raises it
    author          TEXT,                   -- who recorded or last validated this
    session_id      TEXT,                   -- pi session that produced this item
    investigation_id TEXT,                  -- investigation that produced this item
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
```

#### `memory_entity_refs`

Links memory items to the entities they describe (many-to-many).

```sql
CREATE TABLE memory_entity_refs (
    memory_id   TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
    entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE SET NULL,
    PRIMARY KEY (memory_id, entity_id)
);
```

#### `memory_evidence`

Links memory items to their supporting evidence (tool call results, commits, alerts, etc.).

```sql
CREATE TABLE memory_evidence (
    id          TEXT PRIMARY KEY,
    memory_id   TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,              -- tool_result | commit | alert | dashboard | url
    reference   TEXT NOT NULL,             -- URI or structured ID
    summary     TEXT,                      -- short human-readable description
    captured_at INTEGER NOT NULL
);
```

#### `memory_fts` — full-text search

FTS5 virtual table for keyword retrieval of memory items.

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
    content,
    content='memory_items',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

-- Keep in sync via triggers
CREATE TRIGGER memory_fts_insert AFTER INSERT ON memory_items BEGIN
    INSERT INTO memory_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER memory_fts_update AFTER UPDATE ON memory_items BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO memory_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER memory_fts_delete AFTER DELETE ON memory_items BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;
```

#### `memory_vectors` — vector similarity search

`sqlite-vec` virtual table for semantic nearest-neighbour retrieval (used by the `known-patterns` skill).

```sql
-- Load sqlite-vec extension at connection time
-- Node.js: db.loadExtension('sqlite-vec')
-- Rust:    conn.load_extension("sqlite-vec", None)?

CREATE VIRTUAL TABLE memory_vectors USING vec0(
    memory_id   TEXT PARTITION KEY,
    embedding   FLOAT[1536]                 -- OpenAI text-embedding-3-small dimensions
);
```

Embeddings are generated when a new memory item is stored (via the memory engine extension). At query time, the agent's current investigation context is embedded and the top-k nearest items are retrieved and injected into the prompt.

---

### Session and Working Memory

Session memory and working memory are **not stored in SQLite**. They use pi's native storage:

| Memory type | Storage |
|---|---|
| Session memory | pi's JSONL session file (handled by pi itself) |
| Working memory | In-memory in the pi extension; reconstructed from session entries on `session_start` |
| User preferences | `~/.infra-harness/preferences.json` (simple JSON, no DB needed) |

This keeps SQLite focused on long-lived knowledge and avoids write contention during fast-moving investigation sessions.

---

## Access Patterns

### pi extension (Node.js) — writer

```typescript
import Database from "better-sqlite3";
import { SqliteVec } from "sqlite-vec";

const db = new Database("~/.infra-harness/kb.sqlite");
db.pragma("journal_mode = WAL");
SqliteVec.load(db);

// Ingest an entity
db.prepare(`
  INSERT INTO entities (id, type, name, env, ingested_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at
`).run(id, type, name, env, now, now);

// Store a memory item
db.prepare(`
  INSERT INTO memory_items (id, content, type, env, confidence, author, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(id, content, type, env, confidence, author, now, now);
```

### Tauri backend (Rust) — reader

```rust
use rusqlite::{Connection, Result};

let conn = Connection::open("~/.infra-harness/kb.sqlite")?;
conn.pragma_update(None, "journal_mode", "WAL")?;
// Load sqlite-vec for vector queries on the knowledge screen
unsafe { conn.load_extension("sqlite-vec", None)?; }

// Fetch topology for the Topology screen
let mut stmt = conn.prepare("SELECT * FROM entities WHERE env = ?1")?;
let entities = stmt.query_map(["prod"], |row| { ... })?;
```

---

## Freshness Decay

Both entities and memory items carry a `freshness` score (0.0 → 1.0). A background job (run by the pi extension on `session_start`) applies exponential decay based on time since last validation:

```
freshness(t) = freshness₀ × e^(−λt)
```

Where λ is set per entity type:
- Cloud resources: faster decay (infra changes frequently)
- Service dependency edges: moderate decay
- Durable memory facts marked `verified`: slow decay
- Facts marked `inferred`: faster decay

Items below a freshness threshold (e.g. 0.3) are surfaced on the Knowledge screen as stale and flagged for revalidation.

---

## Summary

| Component | Technology |
|---|---|
| Storage engine | SQLite (WAL mode) |
| Context graph | Entity table + edge table + recursive CTE traversal |
| Memory items | `memory_items` table + `memory_entity_refs` + `memory_evidence` |
| Full-text search | FTS5 (built-in, no extension) |
| Vector similarity | `sqlite-vec` extension (v0.1.9) |
| Node.js access | `better-sqlite3` (v12.9.0) |
| Rust access | `rusqlite` (v0.39.0) |
| Session/working memory | pi native JSONL session file |
| User preferences | `~/.infra-harness/preferences.json` |
