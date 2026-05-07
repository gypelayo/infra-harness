import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, useCallback } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  type Node, type Edge,
} from "reactflow";
import "reactflow/dist/style.css";

interface Entity {
  id: string; type: string; name: string; env: string | null;
  provider: string | null; freshness: number;
}
interface EdgeRow {
  id: string; from_id: string; to_id: string; relation: string; confidence: number;
}

const nodeColor: Record<string, string> = {
  service:        "#3b82f6",
  repo:           "#8b5cf6",
  cluster:        "#06b6d4",
  cloud_resource: "#f59e0b",
  alert:          "#ef4444",
  incident:       "#f97316",
  team:           "#10b981",
  default:        "#6b7280",
};

export function TopologyScreen() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [envFilter, setEnvFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entities = await invoke<Entity[]>("get_entities", { env: envFilter === "all" ? null : envFilter });
      const edgeRows = await invoke<EdgeRow[]>("get_all_edges");

      const flowNodes: Node[] = entities.map((e, i) => ({
        id: e.id,
        data: { label: `${e.name}\n${e.type}` },
        position: { x: (i % 8) * 180, y: Math.floor(i / 8) * 120 },
        style: {
          background: nodeColor[e.type] ?? nodeColor.default,
          color: "#fff",
          border: e.freshness < 0.3 ? "2px dashed #ffffff60" : "none",
          borderRadius: 8,
          fontSize: 11,
          padding: "6px 10px",
          opacity: 0.4 + e.freshness * 0.6,
        },
      }));

      const flowEdges: Edge[] = edgeRows.map((r) => ({
        id: r.id,
        source: r.from_id,
        target: r.to_id,
        label: r.relation.replace(/_/g, " "),
        style: { stroke: "#ffffff30" },
        labelStyle: { fill: "#ffffff60", fontSize: 10 },
        animated: r.relation === "depends_on",
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err) {
      console.error("topology load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [envFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
        <span className="text-sm font-medium text-white/70">Topology</span>
        <div className="ml-auto flex gap-2">
          {["all", "prod", "staging", "dev"].map((e) => (
            <button
              key={e}
              onClick={() => setEnvFilter(e)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                envFilter === e ? "bg-blue-600 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {e}
            </button>
          ))}
          <button onClick={load} className="ml-2 text-xs text-white/30 hover:text-white/60">↻ Refresh</button>
        </div>
      </div>
      <div className="flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-white/30">Loading…</div>
        ) : nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/20">
            <p className="text-sm">No entities in the context graph yet.</p>
            <p className="text-xs">Run an investigation to populate the graph.</p>
          </div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} fitView>
            <Background color="#ffffff10" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(n) => (n.style?.background as string) ?? "#6b7280"}
              style={{ background: "#0f0f1a" }}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
