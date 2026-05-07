import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// better-sqlite3 and sqlite-vec are CommonJS — use createRequire in ESM context.
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof import("better-sqlite3");

const __dirname = dirname(fileURLToPath(import.meta.url));

export type Db = InstanceType<typeof Database>;

let _db: Db | null = null;

export function getDbPath(): string {
  return process.env.INFRA_HARNESS_DB ?? join(homedir(), ".infra-harness", "kb.sqlite");
}

/**
 * Open (or return the cached) SQLite connection.
 * WAL mode + sqlite-vec + FTS5 are enabled on first open.
 */
export function openDb(): Db {
  if (_db) return _db;

  const dbPath = getDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db: Db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  // Load sqlite-vec for vector similarity search.
  // The extension is loaded from the sqlite-vec npm package.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sqliteVec = require("sqlite-vec") as any;
    sqliteVec.load(db);
  } catch (err) {
    console.warn("[infra-harness] sqlite-vec not available — vector search disabled:", err);
  }

  _db = db;
  return db;
}

/**
 * Close and clear the cached connection (mainly for tests).
 */
export function closeDb(): void {
  _db?.close();
  _db = null;
}

/**
 * Run all schema migrations.
 * Safe to call on every startup — each migration is idempotent.
 */
export function migrate(db: Db): void {
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");

  // Split on statement boundaries (double newline before --) and run each block.
  // We run the full schema — all CREATE TABLE IF NOT EXISTS statements are idempotent.
  db.exec(schema);

  // Create the vec0 virtual table after sqlite-vec is loaded.
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
        memory_id   TEXT PARTITION KEY,
        embedding   FLOAT[1536]
      );
    `);
  } catch {
    // sqlite-vec not loaded — vector search will be unavailable.
  }

  // Record schema version if not already set.
  const versionExists = (db.prepare("SELECT 1 FROM schema_version LIMIT 1").get()) != null;
  if (!versionExists) {
    db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(1, Date.now());
  }
}
