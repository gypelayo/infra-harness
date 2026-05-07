import type { UiDescriptor } from "../store";
import ReactMarkdown from "react-markdown";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ── Evidence Card ─────────────────────────────────────────────────────────────

function EvidenceCard({ d }: { d: UiDescriptor }) {
  const colors: Record<string, string> = {
    verified: "bg-green-900/40 border-green-500",
    inferred: "bg-blue-900/40 border-blue-500",
    stale:    "bg-yellow-900/40 border-yellow-500",
    disputed: "bg-red-900/40 border-red-500",
  };
  const conf = (d.confidence as string) ?? "inferred";
  return (
    <div className={`rounded-lg border p-3 text-sm ${colors[conf] ?? colors.inferred}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-white">{d.claim as string}</p>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-mono uppercase text-white/70 bg-white/10">
          {conf}
        </span>
      </div>
      {typeof d.summary === "string" && <p className="mt-1 text-white/60">{d.summary}</p>}
      <a
        href={d.reference as string}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block truncate text-xs text-blue-400 hover:underline"
      >
        {d.reference as string}
      </a>
    </div>
  );
}

// ── Hypothesis List ───────────────────────────────────────────────────────────

function HypothesisList({ d }: { d: UiDescriptor }) {
  const hyps = (d.hypotheses as Array<{ label: string; status: string; evidence?: string; confidence?: number }>) ?? [];
  const statusIcon: Record<string, string> = {
    investigating: "⟳", supported: "✓", refuted: "✗", unresolved: "·",
  };
  const statusColor: Record<string, string> = {
    investigating: "text-yellow-400", supported: "text-green-400",
    refuted: "text-red-400", unresolved: "text-white/40",
  };
  return (
    <div className="space-y-1.5">
      {hyps.map((h, i) => (
        <div key={i} className="flex items-start gap-2 rounded bg-white/5 px-3 py-2 text-sm">
          <span className={`mt-0.5 text-base ${statusColor[h.status] ?? "text-white/40"}`}>
            {statusIcon[h.status] ?? "·"}
          </span>
          <div className="flex-1">
            <span className="text-white">{h.label}</span>
            {h.evidence && <p className="mt-0.5 text-xs text-white/50">{h.evidence}</p>}
          </div>
          {h.confidence != null && (
            <span className="shrink-0 text-xs text-white/40">{Math.round(h.confidence * 100)}%</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Metric Sparkline ──────────────────────────────────────────────────────────

function MetricSparkline({ d }: { d: UiDescriptor }) {
  const timestamps = (d.timestamps as string[]) ?? [];
  const values = (d.values as number[]) ?? [];
  const anomalySet = new Set((d.anomaly_at as string[]) ?? []);
  const data = timestamps.map((t, i) => ({
    t: new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    v: values[i] ?? null,
    anomaly: anomalySet.has(t),
  }));
  const baseline = d.baseline as number | undefined;

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-white">{d.title as string}</p>
      <p className="mb-2 text-xs text-white/40">{d.metric_name as string}{d.unit ? ` (${d.unit})` : ""}</p>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data}>
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#ffffff40" }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "#ffffff40" }} width={40} />
          <Tooltip
            contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff20", fontSize: 12 }}
            labelStyle={{ color: "#ffffff80" }}
          />
          {baseline != null && (
            <ReferenceLine y={baseline} stroke="#ffffff30" strokeDasharray="4 2" />
          )}
          <Line type="monotone" dataKey="v" stroke="#60a5fa" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Diff View ─────────────────────────────────────────────────────────────────

function DiffView({ d }: { d: UiDescriptor }) {
  const lines = (d.patch as string ?? "").split("\n");
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-white">{d.title as string}</p>
      {typeof d.path === "string" && <p className="mb-2 font-mono text-xs text-white/40">{d.path}</p>}
      <div className="max-h-64 overflow-auto rounded bg-black/40 p-2 font-mono text-xs">
        {lines.map((line, i) => {
          const color =
            line.startsWith("+") ? "text-green-400" :
            line.startsWith("-") ? "text-red-400" :
            line.startsWith("@@") ? "text-blue-400" : "text-white/60";
          return <div key={i} className={color}>{line || " "}</div>;
        })}
      </div>
    </div>
  );
}

// ── Summary Panel ─────────────────────────────────────────────────────────────

function SummaryPanel({ d }: { d: UiDescriptor }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-white">{d.title as string}</p>
      <div className="prose prose-sm prose-invert max-w-none text-white/80">
        <ReactMarkdown>{d.content as string}</ReactMarkdown>
      </div>
    </div>
  );
}

// ── Topology Diff ─────────────────────────────────────────────────────────────

function TopologyDiff({ d }: { d: UiDescriptor }) {
  const added   = (d.added   as string[]) ?? [];
  const removed = (d.removed as string[]) ?? [];
  const changed = (d.changed as string[]) ?? [];
  return (
    <div className="space-y-2 text-sm">
      {typeof d.title === "string" && <p className="font-medium text-white">{d.title}</p>}
      {added.length > 0 && (
        <div>
          <span className="text-xs text-green-400 uppercase tracking-wide">+ Added</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {added.map((n) => <span key={n} className="rounded bg-green-900/40 border border-green-700 px-2 py-0.5 text-xs text-green-300">{n}</span>)}
          </div>
        </div>
      )}
      {removed.length > 0 && (
        <div>
          <span className="text-xs text-red-400 uppercase tracking-wide">− Removed</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {removed.map((n) => <span key={n} className="rounded bg-red-900/40 border border-red-700 px-2 py-0.5 text-xs text-red-300">{n}</span>)}
          </div>
        </div>
      )}
      {changed.length > 0 && (
        <div>
          <span className="text-xs text-yellow-400 uppercase tracking-wide">~ Changed</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {changed.map((n) => <span key={n} className="rounded bg-yellow-900/40 border border-yellow-700 px-2 py-0.5 text-xs text-yellow-300">{n}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline Overlay ──────────────────────────────────────────────────────────

function TimelineOverlay({ d }: { d: UiDescriptor }) {
  const events = (d.events as Array<{ timestamp: string; label: string; category?: string }>) ?? [];
  const catColor: Record<string, string> = {
    deploy: "bg-blue-500", alert: "bg-red-500",
    config_change: "bg-yellow-500", incident: "bg-orange-500", other: "bg-white/30",
  };
  return (
    <div>
      {typeof d.title === "string" && <p className="mb-2 text-sm font-medium text-white">{d.title}</p>}
      <div className="relative border-l border-white/20 pl-4 space-y-3">
        {events.map((e, i) => (
          <div key={i} className="relative">
            <div className={`absolute -left-[1.3rem] mt-1.5 h-2 w-2 rounded-full ${catColor[e.category ?? "other"] ?? catColor.other}`} />
            <p className="text-xs text-white/40">{new Date(e.timestamp).toLocaleTimeString()}</p>
            <p className="text-sm text-white">{e.label}</p>
            {e.category && <span className="text-xs text-white/30">{e.category}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Registry ──────────────────────────────────────────────────────────────────

export function DescriptorRenderer({ descriptor }: { descriptor: UiDescriptor }) {
  switch (descriptor.type) {
    case "evidence-card":     return <EvidenceCard d={descriptor} />;
    case "hypothesis-list":   return <HypothesisList d={descriptor} />;
    case "metric-sparkline":  return <MetricSparkline d={descriptor} />;
    case "diff-view":         return <DiffView d={descriptor} />;
    case "summary-panel":     return <SummaryPanel d={descriptor} />;
    case "topology-diff":     return <TopologyDiff d={descriptor} />;
    case "timeline-overlay":  return <TimelineOverlay d={descriptor} />;
    default:
      return (
        <div className="rounded bg-white/5 p-3 font-mono text-xs text-white/40">
          Unknown descriptor: {descriptor.type}
        </div>
      );
  }
}
