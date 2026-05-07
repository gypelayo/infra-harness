import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { openDb } from "../../db/client.js";
import { embed } from "./embeddings.js";

const INJECT_LIMIT = 5;
const FRESHNESS_THRESHOLD = 0.2; // Don't inject very stale items.

/**
 * On before_agent_start: embed the user's prompt, retrieve top-k relevant
 * memory items, and inject them as a compact block at the end of the system prompt.
 */
export function registerMemoryInjection(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event, ctx) => {
    const db = openDb();
    const prompt = event.prompt;
    if (!prompt?.trim()) return;

    let items: Array<{ id: string; content: string; type: string; confidence: string; env: string | null }> = [];

    // Try vector search first.
    try {
      const embedding = await embed(prompt);
      if (embedding) {
        const { toVecBlob } = await import("./embeddings.js");
        const rows = db.prepare(`
          SELECT m.id, m.content, m.type, m.confidence, m.env
          FROM memory_vectors v
          JOIN memory_vector_map map ON map.vec_rowid = v.rowid
          JOIN memory_items m ON m.id = map.memory_id
          WHERE m.freshness >= ? AND m.confidence != 'disputed'
          ORDER BY vec_distance_cosine(v.embedding, ?) ASC
          LIMIT ?
        `).all(FRESHNESS_THRESHOLD, toVecBlob(embedding), INJECT_LIMIT) as typeof items;
        items = rows;
      }
    } catch {
      // sqlite-vec unavailable — fall through to FTS.
    }

    // Fall back to FTS if vector search yielded nothing.
    if (!items.length) {
      try {
        // Use first 10 words as FTS query.
        const ftsQuery = prompt.trim().split(/\s+/).slice(0, 10).join(" ");
        const rows = db.prepare(`
          SELECT m.id, m.content, m.type, m.confidence, m.env
          FROM memory_fts
          JOIN memory_items m ON m.rowid = memory_fts.rowid
          WHERE memory_fts MATCH ? AND m.freshness >= ? AND m.confidence != 'disputed'
          LIMIT ?
        `).all(ftsQuery, FRESHNESS_THRESHOLD, INJECT_LIMIT) as typeof items;
        items = rows;
      } catch {
        // FTS query failed — skip injection.
      }
    }

    if (!items.length) return;

    const block = items
      .map((item, i) =>
        `${i + 1}. [${item.confidence}${item.env ? `, ${item.env}` : ""}] ${item.content}`
      )
      .join("\n");

    return {
      systemPrompt:
        ctx.getSystemPrompt() +
        `\n\n## Relevant operational memory\n\nThe following facts from prior investigations may be relevant:\n\n${block}\n\nUse these as context but verify with live tool data before drawing conclusions.`,
    };
  });
}
