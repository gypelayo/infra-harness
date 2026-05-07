import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { UiDescriptorSchema, type UiDescriptor } from "./descriptor-schema.js";

/**
 * Set by the Tauri backend when pi is running as a sidecar.
 * The extension uses this to decide between RPC forwarding and TUI fallback.
 */
const TAURI_SIDECAR = process.env.INFRA_HARNESS_TAURI_SIDECAR === "1";

/**
 * Emit a UI descriptor as a structured RPC event on stdout.
 * The Tauri Rust backend reads this line and forwards it to the React frontend.
 */
function emitToTauri(descriptor: UiDescriptor): void {
  const event = JSON.stringify({
    type:       "infra_harness_ui",
    descriptor,
    timestamp:  new Date().toISOString(),
  });
  // Emit as a bare JSONL line (LF-terminated) outside the normal RPC framing.
  // The Tauri sidecar manager watches for lines with type === "infra_harness_ui".
  process.stdout.write(event + "\n");
}

/**
 * Render a TUI summary of a descriptor when running standalone (no Tauri).
 */
function tuiFallback(descriptor: UiDescriptor): string {
  switch (descriptor.type) {
    case "evidence-card":
      return `📎 Evidence [${descriptor.confidence}]: ${descriptor.claim}\n   Source: ${descriptor.reference}`;
    case "hypothesis-list":
      return descriptor.hypotheses
        .map((h) => {
          const icon = h.status === "supported" ? "✓" : h.status === "refuted" ? "✗" : h.status === "investigating" ? "?" : "·";
          return `  ${icon} [${h.status}] ${h.label}`;
        })
        .join("\n");
    case "metric-sparkline": {
      const vals = descriptor.values;
      const min = Math.min(...vals).toFixed(2);
      const max = Math.max(...vals).toFixed(2);
      const last = vals[vals.length - 1]?.toFixed(2) ?? "N/A";
      return `📈 ${descriptor.title} (${descriptor.metric_name}): min=${min} max=${max} latest=${last} ${descriptor.unit ?? ""}`;
    }
    case "diff-view":
      return `📄 Diff: ${descriptor.title}${descriptor.path ? ` (${descriptor.path})` : ""}\n${descriptor.patch.slice(0, 500)}${descriptor.patch.length > 500 ? "\n…" : ""}`;
    case "summary-panel":
      return `📋 ${descriptor.title}\n${descriptor.content}`;
    case "topology-diff":
      return [
        descriptor.title ? `🗺  ${descriptor.title}` : "🗺  Topology change",
        descriptor.added?.length   ? `  + Added:   ${descriptor.added.join(", ")}` : "",
        descriptor.removed?.length ? `  - Removed: ${descriptor.removed.join(", ")}` : "",
        descriptor.changed?.length ? `  ~ Changed: ${descriptor.changed.join(", ")}` : "",
      ].filter(Boolean).join("\n");
    case "timeline-overlay":
      return [
        descriptor.title ? `⏱  ${descriptor.title}` : "⏱  Timeline",
        ...descriptor.events.map((e) => `  [${e.timestamp}] ${e.label}${e.category ? ` (${e.category})` : ""}`),
      ].join("\n");
    default:
      return `🖼  UI: ${JSON.stringify(descriptor).slice(0, 200)}`;
  }
}

export function registerUiTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "render_ui",
    label: "Render UI",
    description: "Emit a structured visual component to the infra-harness desktop UI agent canvas. " +
      "Use this to show evidence cards, hypothesis lists, metric sparklines, diffs, topology changes, and summaries.",
    promptSnippet: "Emit structured visual components to the agent canvas (evidence, hypotheses, metrics, diffs)",
    parameters: Type.Object({
      descriptor: UiDescriptorSchema,
    }),

    async execute(_id, params) {
      const descriptor = params.descriptor as UiDescriptor;

      if (TAURI_SIDECAR) {
        emitToTauri(descriptor);
        return {
          content: [{ type: "text", text: `[UI: ${descriptor.type} emitted to desktop canvas]` }],
          details: { descriptor },
        };
      } else {
        // Terminal fallback — render a human-readable summary.
        const summary = tuiFallback(descriptor);
        return {
          content: [{ type: "text", text: summary }],
          details: { descriptor },
        };
      }
    },
  });
}
