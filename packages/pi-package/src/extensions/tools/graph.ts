import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { randomUUID } from "node:crypto";
import { openDb } from "../../db/client.js";

export function registerGraphTools(pi: ExtensionAPI): void {
  // ── graph_query ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "graph_query",
    label: "Graph Query",
    description: "Query entities and relationships in the infrastructure context graph.",
    promptSnippet: "Query services, repos, clusters, and their relationships in the context graph",
    parameters: Type.Object({
      type:     Type.Optional(Type.String({ description: "Entity type filter (service, repo, cluster, etc.)" })),
      env:      Type.Optional(Type.String({ description: "Environment filter (prod, staging, dev)" })),
      name:     Type.Optional(Type.String({ description: "Partial name match" })),
      relation: Type.Optional(Type.String({ description: "Filter by relationship type (depends_on, deployed_from, etc.)" })),
      limit:    Type.Optional(Type.Number({ description: "Max entities to return (default 50)" })),
    }),

    async execute(_id, params) {
      const db = openDb();
      const conditions: string[] = [];
      const bindings: unknown[] = [];

      if (params.type)  { conditions.push("type = ?");        bindings.push(params.type); }
      if (params.env)   { conditions.push("env = ?");         bindings.push(params.env); }
      if (params.name)  { conditions.push("name LIKE ?");     bindings.push(`%${params.name}%`); }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = params.limit ?? 50;

      const entities = db.prepare(`
        SELECT id, type, name, env, provider, external_id, metadata, freshness, updated_at
        FROM entities ${where} LIMIT ?
      `).all(...bindings, limit);

      // If a relation filter is specified, also fetch relevant edges.
      let edges: unknown[] = [];
      if (params.relation) {
        const entityIds = (entities as Array<{ id: string }>).map((e) => e.id);
        if (entityIds.length) {
          const placeholders = entityIds.map(() => "?").join(",");
          edges = db.prepare(`
            SELECT id, from_id, to_id, relation, confidence, freshness
            FROM edges
            WHERE relation = ? AND (from_id IN (${placeholders}) OR to_id IN (${placeholders}))
          `).all(params.relation, ...entityIds, ...entityIds);
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ entities, edges }, null, 2) }],
        details: { entities, edges },
      };
    },
  });

  // ── graph_neighbors ───────────────────────────────────────────────────────
  pi.registerTool({
    name: "graph_neighbors",
    label: "Graph Neighbors",
    description: "Return all entities reachable from a given entity within N hops, following typed relationships.",
    promptSnippet: "Traverse the infrastructure graph from a service or resource to find its dependencies and dependents",
    parameters: Type.Object({
      entity_name: Type.String({ description: "Name of the starting entity" }),
      hops:        Type.Optional(Type.Number({ description: "Maximum hops (default 2, max 4)" })),
      relation:    Type.Optional(Type.String({ description: "Restrict traversal to a specific relation type" })),
      direction:   Type.Optional(Type.Union([
        Type.Literal("outbound"),
        Type.Literal("inbound"),
        Type.Literal("both"),
      ], { description: "Traversal direction (default: both)" })),
    }),

    async execute(_id, params) {
      const db = openDb();
      const hops = Math.min(params.hops ?? 2, 4);
      const dir = params.direction ?? "both";

      // Find the starting entity.
      const start = db.prepare("SELECT id, name, type FROM entities WHERE name LIKE ? LIMIT 1")
        .get(`%${params.entity_name}%`) as { id: string; name: string; type: string } | undefined;

      if (!start) {
        return {
          content: [{ type: "text", text: `No entity found matching "${params.entity_name}".` }],
          details: { found: false } as Record<string,unknown>,
        };
      }

      // Recursive CTE traversal.
      const relationFilter = params.relation ? "AND e.relation = @relation" : "";
      const dirClause =
        dir === "outbound" ? "e.from_id = n.id" :
        dir === "inbound"  ? "e.to_id   = n.id" :
                             "(e.from_id = n.id OR e.to_id = n.id)";

      const neighborSql = `
        WITH RECURSIVE neighbors(id, depth, path) AS (
          SELECT @startId, 0, @startId
          UNION ALL
          SELECT
            CASE WHEN e.from_id = n.id THEN e.to_id ELSE e.from_id END,
            n.depth + 1,
            n.path || ',' || CASE WHEN e.from_id = n.id THEN e.to_id ELSE e.from_id END
          FROM edges e
          JOIN neighbors n ON ${dirClause}
          WHERE n.depth < @hops
            AND instr(n.path, CASE WHEN e.from_id = n.id THEN e.to_id ELSE e.from_id END) = 0
            ${relationFilter}
        )
        SELECT DISTINCT ent.id, ent.type, ent.name, ent.env, ent.freshness, neighbors.depth
        FROM entities ent
        JOIN neighbors ON ent.id = neighbors.id
        WHERE ent.id != @startId
        ORDER BY neighbors.depth, ent.type, ent.name
      `;

      const nodeBindings: Record<string, unknown> = { startId: start.id, hops };
      if (params.relation) nodeBindings.relation = params.relation;
      const nodes = db.prepare(neighborSql).all(nodeBindings);

      return {
        content: [{ type: "text", text: JSON.stringify({ start, neighbors: nodes }, null, 2) }],
        details: { start, neighbors: nodes } as Record<string,unknown>,
      };
    },
  });

  // ── graph_ingest ──────────────────────────────────────────────────────────
  pi.registerTool({
    name: "graph_ingest",
    label: "Graph Ingest",
    description: "Add or update entities and relationships in the infrastructure context graph.",
    promptSnippet: "Store discovered services, resources, and relationships in the context graph",
    parameters: Type.Object({
      entities: Type.Optional(Type.Array(Type.Object({
        id:          Type.Optional(Type.String()),
        type:        Type.String(),
        name:        Type.String(),
        env:         Type.Optional(Type.String()),
        provider:    Type.Optional(Type.String()),
        external_id: Type.Optional(Type.String()),
        metadata:    Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }))),
      edges: Type.Optional(Type.Array(Type.Object({
        from_name: Type.String({ description: "Name of the source entity" }),
        to_name:   Type.String({ description: "Name of the target entity" }),
        relation:  Type.String(),
        metadata:  Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }))),
    }),

    async execute(_id, params) {
      const db = openDb();
      const now = Date.now();
      let entitiesUpserted = 0;
      let edgesUpserted = 0;

      const upsertEntity = db.prepare(`
        INSERT INTO entities (id, type, name, env, provider, external_id, metadata, ingested_at, updated_at, freshness)
        VALUES (@id, @type, @name, @env, @provider, @external_id, @metadata, @now, @now, 1.0)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, env=excluded.env, provider=excluded.provider,
          external_id=excluded.external_id, metadata=excluded.metadata,
          updated_at=excluded.updated_at, freshness=1.0
      `);

      const ingestEntities = db.transaction(() => {
        for (const e of params.entities ?? []) {
          upsertEntity.run({
            id:          e.id ?? randomUUID(),
            type:        e.type,
            name:        e.name,
            env:         e.env ?? null,
            provider:    e.provider ?? null,
            external_id: e.external_id ?? null,
            metadata:    JSON.stringify(e.metadata ?? {}),
            now,
          });
          entitiesUpserted++;
        }
      });
      ingestEntities();

      if (params.edges?.length) {
        const findEntity = db.prepare("SELECT id FROM entities WHERE name = ? LIMIT 1");
        const upsertEdge = db.prepare(`
          INSERT INTO edges (id, from_id, to_id, relation, metadata, ingested_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata, updated_at=excluded.updated_at, freshness=1.0
        `);

        const ingestEdges = db.transaction(() => {
          for (const e of params.edges ?? []) {
            const from = findEntity.get(e.from_name) as { id: string } | undefined;
            const to   = findEntity.get(e.to_name)   as { id: string } | undefined;
            if (!from || !to) continue;
            upsertEdge.run(
              randomUUID(), from.id, to.id, e.relation,
              JSON.stringify(e.metadata ?? {}), now, now,
            );
            edgesUpserted++;
          }
        });
        ingestEdges();
      }

      return {
        content: [{ type: "text", text: `Ingested ${entitiesUpserted} entities and ${edgesUpserted} edges.` }],
        details: { entitiesUpserted, edgesUpserted },
      };
    },
  });
}
