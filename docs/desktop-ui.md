# Desktop UI

The infra-harness desktop UI is a **Tauri** application — cross-platform (macOS, Windows, Linux), ~4 MB binary, using the system webview with a React + Tailwind frontend.

It is **not** the primary action surface. Engineers act through the pi CLI. The UI externalizes the system's model of the infrastructure so humans can understand, validate, and correct it quickly.

---

## Two Kinds of UI

### Fixed Screens

Always-on, data-driven views that read from the context graph, memory engine, and permission store. These are deterministic — they do not depend on the agent being active.

| Screen | Description |
|---|---|
| **Topology** | Service dependency map with alert, deploy, and change overlays |
| **Investigation** | Hypothesis tree, evidence timeline, diagnosis path, and audit trail |
| **Permissions** | Current session capability map, restricted actions, pending approvals |
| **Knowledge** | Durable memory items with confidence, freshness, and source links |

### Agent Canvas

A dedicated panel for **agent-generated UI** — dynamic components emitted by the agent during an active investigation. The agent calls the `render_ui` tool with a typed descriptor, and the Tauri frontend renders it as a React component.

The agent canvas is not a chatbot shell. It is a structured output surface for content that is better shown visually than narrated in text.

---

## Fixed Screen Detail

### Topology Screen

**Purpose:** Understand system shape and blast radius at a glance.

**Content:**
- Force-directed or hierarchical graph of services, dependencies, queues, databases, clusters, and repos
- Nodes: colour-coded by health status (from observability integration)
- Edges: labelled by relationship type (`depends_on`, `deployed_from`, `runs_in`)
- Overlays (toggleable):
  - Active alerts
  - Deployments in the last 24h
  - Config changes
  - Investigation focus (highlights nodes relevant to the current investigation)

**Data source:** Context graph store (read directly by the Tauri Rust backend).

### Investigation Screen

**Purpose:** Turn agent activity into an auditable operational narrative.

**Content:**
- **Hypothesis tree** — root hypothesis with child hypotheses, each labelled `investigating`, `supported`, `refuted`, or `unresolved`
- **Evidence timeline** — chronological list of tool calls, observations, and data points collected
- **Missing evidence** — what the agent flagged as absent or unresolvable
- **Diagnosis** — final structured output: cause, confidence, supporting evidence, recommended next steps
- **Audit trail** — every tool call that was permitted or blocked, with timestamp and operator identity

**Data source:** Investigation entries in the pi session file + audit log (persisted via `pi.appendEntry`).

### Permissions Screen

**Purpose:** Make the trust boundary explicit and inspectable.

**Content:**
- Current session identity (who is this session acting as)
- **Granted capabilities** — what this session can do, with the provider mapping for each
- **Restricted capabilities** — what requires escalation or explicit approval
- **Pending approvals** — tool calls waiting for operator confirmation
- **Audit log** — recent permitted and blocked actions

**Data source:** Permission store (persisted by the broker extension).

### Knowledge Screen

**Purpose:** Let operators understand what the system knows and correct it when wrong.

**Content:**
- List of durable memory items, filterable by entity, environment, confidence, and freshness
- Each item shows: fact text, entity references, evidence source links, timestamp, confidence state, author
- Items marked `stale` or `disputed` are visually highlighted
- Operators can mark items as verified, stale, or disputed directly from this screen

**Data source:** Durable memory entries (from the pi session / memory engine extension).

---

## Agent Canvas

### What it is

A panel that renders structured output from the agent during an active investigation. It lives alongside (or as a tab within) the Investigation screen.

### What the agent can render

The agent calls `render_ui` with a descriptor object. The extension validates and forwards it to the Tauri frontend. The canvas renders it as a React component.

#### Descriptor types

| Type | Rendered as |
|---|---|
| `topology-diff` | Topology graph with added/removed/changed nodes highlighted |
| `evidence-card` | A structured card: claim, source, timestamp, confidence badge |
| `hypothesis-list` | Ranked hypothesis list with status indicators |
| `metric-sparkline` | Inline time-series chart for a metric + anomaly markers |
| `diff-view` | Side-by-side or unified diff for code or config |
| `summary-panel` | Free-form markdown, rendered with full styling |
| `timeline-overlay` | Event markers overlaid on a shared time axis |

New descriptor types are added as the product evolves.

### What it is not

- **Not a chat window.** The agent's raw text responses remain in the pi terminal. The canvas receives only explicitly emitted descriptors.
- **Not autonomous.** The canvas is read-only from the engineer's perspective — descriptors are outputs, not interactive controls.
- **Not required.** If the Tauri UI is not open, `render_ui` gracefully falls back to a TUI summary in the terminal.

---

## Tauri Architecture

```
┌──────────────────────────────────────────────────┐
│             Tauri App (Desktop)                   │
│                                                   │
│  ┌───────────────────────────────────────────┐   │
│  │  React Frontend (system webview)          │   │
│  │                                           │   │
│  │  ┌──────────┐ ┌────────────┐ ┌────────┐  │   │
│  │  │ Topology │ │Investigation│ │Perms   │  │   │
│  │  └──────────┘ └────────────┘ └────────┘  │   │
│  │  ┌──────────┐ ┌────────────────────────┐  │   │
│  │  │Knowledge │ │   Agent Canvas         │  │   │
│  │  └──────────┘ │  (descriptor renderer) │  │   │
│  │               └────────────────────────┘  │   │
│  └────────────────────┬──────────────────────┘   │
│                       │ tauri::command / emit      │
│  ┌────────────────────▼──────────────────────┐   │
│  │  Rust Backend                             │   │
│  │                                           │   │
│  │  • Reads context graph DB (topology)      │   │
│  │  • Reads memory store (knowledge)         │   │
│  │  • Reads permission store (perms)         │   │
│  │  • Manages pi RPC sidecar process         │   │
│  │  • Routes agent canvas descriptors        │   │
│  └────────────────────┬──────────────────────┘   │
└───────────────────────┼──────────────────────────┘
                        │ stdin/stdout JSONL (RPC)
                 ┌──────▼───────┐
                 │  pi sidecar  │
                 │  --mode rpc  │
                 │  + infra-    │
                 │  harness pkg │
                 └──────────────┘
```

### Data flows

| Data | Direction | Transport |
|---|---|---|
| Agent text responses | pi → terminal (pi manages this directly) | — |
| Agent canvas descriptors | pi → Tauri Rust → React | RPC JSONL → tauri::emit |
| Tool calls / results | Tauri Rust ↔ pi | RPC JSONL |
| Topology data | Context graph DB → Rust → React | Tauri command |
| Memory items | Memory store → Rust → React | Tauri command |
| Permission state | Permission store → Rust → React | Tauri command |
| Approval requests | pi → Rust → React → Rust → pi | RPC JSONL + tauri::emit + tauri::command |

---

## Design Principles

1. **The UI never drives the agent.** Engineers prompt the agent from the terminal. The UI is a read surface, except for approvals on the Permissions screen.
2. **Fixed screens are always live.** The topology, knowledge, and permission views reflect current state regardless of whether an investigation is running.
3. **The agent canvas is additive.** It does not replace fixed screens. It adds structured visual context during active investigations.
4. **Lightweight by default.** The UI uses the system webview, avoids heavy charting libraries, and prefers native rendering where possible. Tauri's binary stays small.
