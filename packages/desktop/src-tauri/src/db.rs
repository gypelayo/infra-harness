use rusqlite::{Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::env;

fn db_path() -> PathBuf {
    if let Ok(p) = env::var("INFRA_HARNESS_DB") {
        return PathBuf::from(p);
    }
    let mut p = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push(".infra-harness");
    p.push("kb.sqlite");
    p
}

pub fn open_db() -> SqlResult<Connection> {
    let path = db_path();
    // Ensure directory exists.
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(&path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

// ── Types ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct Entity {
    pub id: String,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub name: String,
    pub env: Option<String>,
    pub provider: Option<String>,
    pub freshness: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EdgeRow {
    pub id: String,
    pub from_id: String,
    pub to_id: String,
    pub relation: String,
    pub confidence: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryItem {
    pub id: String,
    pub content: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub env: Option<String>,
    pub confidence: String,
    pub freshness: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub capability: String,
    pub tool_name: String,
    pub outcome: String,
    pub reason: Option<String>,
    pub occurred_at: i64,
}

// ── Queries ───────────────────────────────────────────────────────────────────

pub fn get_entities(env_filter: Option<&str>) -> SqlResult<Vec<Entity>> {
    let conn = open_db()?;
    let mut result = Vec::new();
    if let Some(env) = env_filter {
        let mut stmt = conn.prepare(
            "SELECT id, type, name, env, provider, freshness FROM entities WHERE env = ?1 ORDER BY type, name LIMIT 500"
        )?;
        let rows = stmt.query_map([env], |row| Ok(Entity {
            id: row.get(0)?, entity_type: row.get(1)?, name: row.get(2)?,
            env: row.get(3)?, provider: row.get(4)?, freshness: row.get(5)?,
        }))?;
        for row in rows { result.push(row?); }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, type, name, env, provider, freshness FROM entities ORDER BY type, name LIMIT 500"
        )?;
        let rows = stmt.query_map([], |row| Ok(Entity {
            id: row.get(0)?, entity_type: row.get(1)?, name: row.get(2)?,
            env: row.get(3)?, provider: row.get(4)?, freshness: row.get(5)?,
        }))?;
        for row in rows { result.push(row?); }
    }
    Ok(result)
}

pub fn get_all_edges() -> SqlResult<Vec<EdgeRow>> {
    let conn = open_db()?;
    let mut stmt = conn.prepare(
        "SELECT id, from_id, to_id, relation, confidence FROM edges LIMIT 2000"
    )?;
    let rows = stmt.query_map([], |row| Ok(EdgeRow {
        id: row.get(0)?, from_id: row.get(1)?, to_id: row.get(2)?,
        relation: row.get(3)?, confidence: row.get(4)?,
    }))?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}

pub fn get_memory_items(confidence_filter: Option<&str>) -> SqlResult<Vec<MemoryItem>> {
    let conn = open_db()?;
    let mut result = Vec::new();
    if let Some(conf) = confidence_filter {
        let mut stmt = conn.prepare(
            "SELECT id, content, type, env, confidence, freshness, created_at, updated_at FROM memory_items WHERE confidence = ?1 ORDER BY updated_at DESC LIMIT 200"
        )?;
        let rows = stmt.query_map([conf], |row| Ok(MemoryItem {
            id: row.get(0)?, content: row.get(1)?, item_type: row.get(2)?,
            env: row.get(3)?, confidence: row.get(4)?, freshness: row.get(5)?,
            created_at: row.get(6)?, updated_at: row.get(7)?,
        }))?;
        for row in rows { result.push(row?); }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, content, type, env, confidence, freshness, created_at, updated_at FROM memory_items ORDER BY updated_at DESC LIMIT 200"
        )?;
        let rows = stmt.query_map([], |row| Ok(MemoryItem {
            id: row.get(0)?, content: row.get(1)?, item_type: row.get(2)?,
            env: row.get(3)?, confidence: row.get(4)?, freshness: row.get(5)?,
            created_at: row.get(6)?, updated_at: row.get(7)?,
        }))?;
        for row in rows { result.push(row?); }
    }
    Ok(result)
}

pub fn get_audit_log(limit: i64) -> SqlResult<Vec<AuditEntry>> {
    let conn = open_db()?;
    let mut stmt = conn.prepare(
        "SELECT id, capability, tool_name, outcome, reason, occurred_at FROM audit_log ORDER BY occurred_at DESC LIMIT ?1"
    )?;
    let rows = stmt.query_map([limit], |row| Ok(AuditEntry {
        id: row.get(0)?, capability: row.get(1)?, tool_name: row.get(2)?,
        outcome: row.get(3)?, reason: row.get(4)?, occurred_at: row.get(5)?,
    }))?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}
