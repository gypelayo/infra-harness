import type { Db } from "./client.js";

/**
 * Decay rates (λ) per entity type and edge type.
 * freshness(t) = freshness₀ × e^(−λ × days)
 *
 * Higher λ = faster staleness.
 */
const ENTITY_DECAY: Record<string, number> = {
  cloud_resource: 0.05,  // decays in ~20 days
  cluster:        0.02,
  namespace:      0.02,
  service:        0.01,  // decays in ~100 days
  repo:           0.005,
  alert:          0.1,   // alerts are very time-sensitive
  incident:       0.1,
  pipeline:       0.03,
  team:           0.001,
  runbook:        0.003,
  knowledge_item: 0.002,
};

const MEMORY_DECAY: Record<string, number> = {
  verified:    0.001,  // very slow decay — operator confirmed
  inferred:    0.01,
  stale:       0,      // already stale, no further decay needed
  disputed:    0,
};

const EDGE_DECAY: Record<string, number> = {
  deployed_from:  0.05,
  runs_in:        0.02,
  depends_on:     0.01,
  associated_with:0.05,
  references:     0.01,
  owned_by:       0.001,
  applies_to:     0.005,
  supported_by:   0.005,
};

const STALE_THRESHOLD = 0.3;

/**
 * Run exponential freshness decay on all entities, edges, and memory items.
 * Called on session_start. Fast (index-backed bulk UPDATE).
 */
export function runFreshnessDecay(db: Db): void {
  const nowMs = Date.now();

  // Entities
  const entities = db.prepare("SELECT id, type, updated_at, freshness FROM entities").all() as Array<{
    id: string; type: string; updated_at: number; freshness: number;
  }>;

  const updateEntity = db.prepare("UPDATE entities SET freshness = ? WHERE id = ?");
  const updateEntities = db.transaction(() => {
    for (const e of entities) {
      const λ = ENTITY_DECAY[e.type] ?? 0.01;
      const days = (nowMs - e.updated_at) / 86_400_000;
      const newFreshness = Math.max(0, e.freshness * Math.exp(-λ * days));
      updateEntity.run(newFreshness, e.id);
    }
  });
  updateEntities();

  // Edges
  const edges = db.prepare("SELECT id, relation, updated_at, freshness FROM edges").all() as Array<{
    id: string; relation: string; updated_at: number; freshness: number;
  }>;

  const updateEdge = db.prepare("UPDATE edges SET freshness = ? WHERE id = ?");
  const updateEdges = db.transaction(() => {
    for (const e of edges) {
      const λ = EDGE_DECAY[e.relation] ?? 0.01;
      const days = (nowMs - e.updated_at) / 86_400_000;
      const newFreshness = Math.max(0, e.freshness * Math.exp(-λ * days));
      updateEdge.run(newFreshness, e.id);
    }
  });
  updateEdges();

  // Memory items
  const items = db.prepare("SELECT id, confidence, updated_at, freshness FROM memory_items").all() as Array<{
    id: string; confidence: string; updated_at: number; freshness: number;
  }>;

  const updateItem = db.prepare("UPDATE memory_items SET freshness = ?, confidence = ? WHERE id = ?");
  const updateItems = db.transaction(() => {
    for (const item of items) {
      const λ = MEMORY_DECAY[item.confidence] ?? 0.01;
      const days = (nowMs - item.updated_at) / 86_400_000;
      const newFreshness = Math.max(0, item.freshness * Math.exp(-λ * days));
      // Downgrade confidence to 'stale' if freshness drops below threshold.
      const newConfidence =
        newFreshness < STALE_THRESHOLD && item.confidence !== "stale" && item.confidence !== "disputed"
          ? "stale"
          : item.confidence;
      updateItem.run(newFreshness, newConfidence, item.id);
    }
  });
  updateItems();
}
