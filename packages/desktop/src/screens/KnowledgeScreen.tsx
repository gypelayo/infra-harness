import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface MemoryItem {
  id: string; content: string; type: string; env: string | null;
  confidence: string; freshness: number; created_at: number; updated_at: number;
}

const confidenceStyle: Record<string, { badge: string; border: string }> = {
  verified: { badge: "bg-green-900/50 text-green-300",  border: "border-green-800/50" },
  inferred: { badge: "bg-blue-900/50 text-blue-300",    border: "border-blue-800/50"  },
  stale:    { badge: "bg-yellow-900/50 text-yellow-300",border: "border-yellow-800/50"},
  disputed: { badge: "bg-red-900/50 text-red-300",      border: "border-red-800/50"   },
};

export function KnowledgeScreen() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    invoke<MemoryItem[]>("get_memory_items", { confidence: filter === "all" ? null : filter })
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  const staleCount = items.filter((i) => i.confidence === "stale").length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
        <span className="text-sm font-medium text-white/70">Knowledge</span>
        {staleCount > 0 && (
          <span className="rounded bg-yellow-900/40 border border-yellow-700/50 px-2 py-0.5 text-xs text-yellow-300">
            {staleCount} stale
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {["all", "verified", "inferred", "stale", "disputed"].map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                filter === c ? "bg-blue-600 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="py-8 text-center text-sm text-white/30">Loading…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-white/20">
            <p className="text-sm">No memory items yet.</p>
            <p className="text-xs">Use <code className="font-mono">memory_store</code> or <code className="font-mono">/remember</code> to add durable facts.</p>
          </div>
        ) : (
          items.map((item) => {
            const style = confidenceStyle[item.confidence] ?? confidenceStyle.inferred;
            return (
              <div key={item.id} className={`rounded-lg border p-4 ${style.border} bg-white/5`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="flex-1 text-sm text-white">{item.content}</p>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                      {item.confidence}
                    </span>
                    <span className="text-xs text-white/30 font-mono">{item.type}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {/* Freshness bar */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-white/30">freshness</span>
                    <div className="h-1 w-20 rounded-full bg-white/10">
                      <div
                        className="h-1 rounded-full transition-all"
                        style={{
                          width: `${item.freshness * 100}%`,
                          background: item.freshness > 0.6 ? "#22c55e" : item.freshness > 0.3 ? "#eab308" : "#ef4444",
                        }}
                      />
                    </div>
                    <span className="text-xs text-white/20">{Math.round(item.freshness * 100)}%</span>
                  </div>
                  {item.env && (
                    <span className="text-xs text-white/30">{item.env}</span>
                  )}
                  <span className="ml-auto text-xs text-white/20">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
