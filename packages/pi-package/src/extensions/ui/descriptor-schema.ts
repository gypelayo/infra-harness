import { Type, type Static } from "@sinclair/typebox";

// ── Shared sub-schemas ────────────────────────────────────────────────────────

const ConfidenceBadge = Type.Union([
  Type.Literal("verified"), Type.Literal("inferred"),
  Type.Literal("stale"),    Type.Literal("disputed"),
]);

// ── Descriptor types ──────────────────────────────────────────────────────────

export const EvidenceCardSchema = Type.Object({
  type:        Type.Literal("evidence-card"),
  claim:       Type.String(),
  source_type: Type.String({ description: "tool_result | commit | alert | dashboard | url" }),
  reference:   Type.String(),
  timestamp:   Type.Optional(Type.String()),
  confidence:  ConfidenceBadge,
  summary:     Type.Optional(Type.String()),
});

export const HypothesisListSchema = Type.Object({
  type:        Type.Literal("hypothesis-list"),
  hypotheses:  Type.Array(Type.Object({
    label:     Type.String(),
    status:    Type.Union([
      Type.Literal("investigating"), Type.Literal("supported"),
      Type.Literal("refuted"),       Type.Literal("unresolved"),
    ]),
    evidence:  Type.Optional(Type.String()),
    confidence:Type.Optional(Type.Number({ description: "0-1" })),
  })),
});

export const MetricSparklineSchema = Type.Object({
  type:        Type.Literal("metric-sparkline"),
  title:       Type.String(),
  metric_name: Type.String(),
  unit:        Type.Optional(Type.String()),
  timestamps:  Type.Array(Type.String()),
  values:      Type.Array(Type.Number()),
  anomaly_at:  Type.Optional(Type.Array(Type.String(), { description: "ISO timestamps of anomalies to highlight" })),
  baseline:    Type.Optional(Type.Number({ description: "Expected baseline value" })),
});

export const DiffViewSchema = Type.Object({
  type:    Type.Literal("diff-view"),
  title:   Type.String(),
  path:    Type.Optional(Type.String()),
  base:    Type.Optional(Type.String({ description: "Base ref label" })),
  head:    Type.Optional(Type.String({ description: "Head ref label" })),
  patch:   Type.String({ description: "Unified diff patch text" }),
  lang:    Type.Optional(Type.String({ description: "Syntax highlighting language hint" })),
});

export const SummaryPanelSchema = Type.Object({
  type:    Type.Literal("summary-panel"),
  title:   Type.String(),
  content: Type.String({ description: "Markdown content" }),
});

export const TopologyDiffSchema = Type.Object({
  type:    Type.Literal("topology-diff"),
  title:   Type.Optional(Type.String()),
  added:   Type.Optional(Type.Array(Type.String(), { description: "Entity names added" })),
  removed: Type.Optional(Type.Array(Type.String(), { description: "Entity names removed" })),
  changed: Type.Optional(Type.Array(Type.String(), { description: "Entity names changed" })),
  focus:   Type.Optional(Type.String({ description: "Entity name to focus/center" })),
});

export const TimelineOverlaySchema = Type.Object({
  type:   Type.Literal("timeline-overlay"),
  title:  Type.Optional(Type.String()),
  events: Type.Array(Type.Object({
    timestamp: Type.String(),
    label:     Type.String(),
    category:  Type.Optional(Type.String({ description: "deploy | alert | config_change | incident | other" })),
  })),
});

// Union of all descriptor types.
export const UiDescriptorSchema = Type.Union([
  EvidenceCardSchema,
  HypothesisListSchema,
  MetricSparklineSchema,
  DiffViewSchema,
  SummaryPanelSchema,
  TopologyDiffSchema,
  TimelineOverlaySchema,
]);

export type UiDescriptor = Static<typeof UiDescriptorSchema>;
