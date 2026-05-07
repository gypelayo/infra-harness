import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { randomUUID } from "node:crypto";
import { openDb } from "../../db/client.js";
import { embed, toVecBlob } from "./embeddings.js";

export function registerMemoryTools(pi: ExtensionAPI): void {
  // ── memory_store ──────────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_store",
    label: "Memory Store",
    description: "Store a durable operational fact, lesson, or pattern in long-term memory.",
    promptSnippet: "Store a validated operational fact, lesson, or pattern for future recall",
    parameters: Type.Object({
      content:        Type.String({ description: "The fact, lesson, or pattern to remember" }),
      type:           Type.Union([
        Type.Literal("fact"), Type.Literal("lesson"),
        Type.Literal("pattern"), Type.Literal("runbook_note"),
      ]),
      confidence:     Type.Union([
        Type.Literal("verified"), Type.Literal("inferred"),
      ], { description: "How confident are we in this item?" }),
      env:            Type.Optional(Type.String({ description: "Environment scope (prod, staging, dev)" })),
      entity_names:   Type.Optional(Type.Array(Type.String(), {
        description: "Names of entities this fact is about",
      })),
      evidence:       Type.Optional(Type.Array(Type.Object({
        type:      Type.String({ description: "tool_result | commit | alert | dashboard | url | other" }),
        reference: Type.String({ description: "URI or identifier" }),
        summary:   Type.Optional(Type.String()),
      }))),
    }),

    async execute(_id, params, _signal, _onUpdate, ctx) {
      const db = openDb();
      const now = Date.now();
      const memoryId = randomUUID();

      // Insert the memory item.
      db.prepare(`
        INSERT INTO memory_items (id, content, type, env, confidence, freshness, author, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1.0, ?, ?, ?)
      `).run(
        memoryId, params.content, params.type,
        params.env ?? null, params.confidence,
        process.env.USER ?? "unknown",
        now, now,
      );

      // Link to entities by name.
      if (params.entity_names?.length) {
        const findEntity = db.prepare("SELECT id FROM entities WHERE name LIKE ? LIMIT 1");
        const linkEntity = db.prepare(
          "INSERT OR IGNORE INTO memory_entity_refs (memory_id, entity_id) VALUES (?, ?)"
        );
        for (const name of params.entity_names) {
          const entity = findEntity.get(`%${name}%`) as { id: string } | undefined;
          if (entity) linkEntity.run(memoryId, entity.id);
        }
      }

      // Store evidence links.
      if (params.evidence?.length) {
        const insertEvidence = db.prepare(`
          INSERT INTO memory_evidence (id, memory_id, type, reference, summary, captured_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const ev of params.evidence) {
          insertEvidence.run(randomUUID(), memoryId, ev.type, ev.reference, ev.summary ?? null, now);
        }
      }

      // Store embedding via rowid+map (vec0 v0.1.9 has no TEXT partition key).
      const embedding = await embed(params.content);
      if (embedding) {
        try {
          const vecRowid = db.prepare("INSERT INTO memory_vectors(embedding) VALUES (?)").run(toVecBlob(embedding)).lastInsertRowid;
          db.prepare("INSERT OR REPLACE INTO memory_vector_map(vec_rowid, memory_id) VALUES (?, ?)").run(vecRowid, memoryId);
        } catch {
          // sqlite-vec not loaded or table not ready — skip.
        }
      }

      return {
        content: [{ type: "text", text: `Stored memory item: "${params.content.slice(0, 80)}${params.content.length > 80 ? "…" : ""}"` }],
        details: { memory_id: memoryId, confidence: params.confidence },
      };
    },
  });

  // ── memory_query ──────────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_query",
    label: "Memory Query",
    description: "Retrieve relevant memory items by keyword search or semantic similarity.",
    promptSnippet: "Search long-term operational memory for facts, lessons, and patterns",
    parameters: Type.Object({
      query:       Type.String({ description: "Search query (keyword or semantic)" }),
      env:         Type.Optional(Type.String({ description: "Filter by environment" })),
      type:        Type.Optional(Type.String({ description: "Filter by memory type" })),
      confidence:  Type.Optional(Type.String({ description: "Filter by confidence level" })),
      limit:       Type.Optional(Type.Number({ description: "Max results (default 10)" })),
      mode:        Type.Optional(Type.Union([
        Type.Literal("fts"),
        Type.Literal("vector"),
        Type.Literal("hybrid"),
      ], { description: "Search mode: fts (keyword), vector (semantic), hybrid (default)" })),
    }),

    async execute(_id, params) {
      const db = openDb();
      const limit = params.limit ?? 10;
      const mode = params.mode ?? "hybrid";

      const conditions: string[] = ["1=1"];
      const bindings: unknown[] = [];
      if (params.env)        { conditions.push("m.env = ?");        bindings.push(params.env); }
      if (params.type)       { conditions.push("m.type = ?");       bindings.push(params.type); }
      if (params.confidence) { conditions.push("m.confidence = ?"); bindings.push(params.confidence); }
      const filter = conditions.join(" AND ");

      let ftsIds: string[] = [];
      let vecIds: string[] = [];

      // FTS search.
      if (mode === "fts" || mode === "hybrid") {
        try {
          const ftsRows = db.prepare(`
            SELECT m.id, bm25(memory_fts) AS score
            FROM memory_fts
            JOIN memory_items m ON m.rowid = memory_fts.rowid
            WHERE memory_fts MATCH ? AND ${filter}
            ORDER BY score LIMIT ?
          `).all(params.query, ...bindings, limit) as Array<{ id: string }>;
          ftsIds = ftsRows.map((r) => r.id);
        } catch {
          // FTS might fail on special characters — fall back gracefully.
        }
      }

      // Vector search.
      if ((mode === "vector" || mode === "hybrid") && ftsIds.length < limit) {
        try {
          const embedding = await embed(params.query);
          if (embedding) {
            const vecRows = db.prepare(`
              SELECT map.memory_id, vec_distance_cosine(v.embedding, ?) AS dist
              FROM memory_vectors v
              JOIN memory_vector_map map ON map.vec_rowid = v.rowid
              JOIN memory_items m ON m.id = map.memory_id
              WHERE ${filter.replace(/m\./g, "m.")}
              ORDER BY dist LIMIT ?
            `).all(toVecBlob(embedding), ...bindings, limit) as Array<{ memory_id: string }>;
            vecIds = vecRows.map((r) => r.memory_id);
          }
        } catch {
          // sqlite-vec not available.
        }
      }

      // Merge and deduplicate IDs, FTS first.
      const allIds = [...new Set([...ftsIds, ...vecIds])].slice(0, limit);

      if (!allIds.length) {
        // Fall back to recency if no search hits.
        const recent = db.prepare(`
          SELECT id, content, type, env, confidence, freshness, created_at
          FROM memory_items WHERE ${filter}
          ORDER BY updated_at DESC LIMIT ?
        `).all(...bindings, limit);
        return {
          content: [{ type: "text", text: JSON.stringify(recent, null, 2) }],
          details: { items: recent, mode: "recency_fallback" } as Record<string,unknown>,
        };
      }

      const placeholders = allIds.map(() => "?").join(",");
      const items = db.prepare(`
        SELECT id, content, type, env, confidence, freshness, created_at, updated_at
        FROM memory_items WHERE id IN (${placeholders})
      `).all(...allIds);

      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
        details: { items, mode, fts_hits: ftsIds.length, vec_hits: vecIds.length } as Record<string,unknown>,
      };
    },
  });
}
