# UX Design

infra-harness does not force a choice between terminal and dashboard. Each surface has a distinct, non-overlapping role.

## CLI (pi) — for action

The CLI is the primary surface for asking questions, starting investigations, and approving actions. It is powered by **pi** — a minimal, extensible terminal coding agent.

Engineers install the infra-harness pi package and interact with it through pi's standard interface, extended with infra-specific commands, skills, and tools.

The system resolves the minimum relevant context automatically — engineers should not have to spell out what the system already knows.

### Illustrative CLI interactions

```bash
# Natural language question (pi resolves tools automatically)
pi
> why is checkout p95 up since 09:20?

# Start a structured investigation using a skill
> /skill:deployment-regression

# Use a prompt template
> /investigate service=checkout env=prod description="p95 latency spike"

# Explore the context graph
> show me checkout's dependencies

# Store a durable operational fact
> /remember

# Check what this session is allowed to do
> /perms

# Browse prior sessions
> /resume
```

### What pi provides to the CLI experience

| Feature | How pi provides it |
|---|---|
| Streaming agent responses | Built-in — pi streams tool calls and text in real time |
| Session persistence + branching | Built-in — JSONL tree format, `/tree` to navigate, `/fork` to branch |
| Context compaction | Built-in — auto-compaction prevents context window exhaustion |
| Model switching | Built-in — `Ctrl+L` or `/model` |
| Thinking level control | Built-in — `Shift+Tab` cycles thinking levels |
| File references in prompts | Built-in — `@filename` includes file content |
| Investigation recipes | Infra-harness skills (`/skill:deployment-regression`, etc.) |
| Prompt templates | Infra-harness templates (`/investigate`, `/remember`, `/ask`) |
| Infra tools | Infra-harness extensions (`aws_*`, `k8s_*`, `github_*`, `obs_*`) |
| Permission gating | Infra-harness permission broker extension |
| Durable memory | Infra-harness memory engine extension |
| Agent canvas (when Tauri is open) | Infra-harness `render_ui` tool + UI descriptor extension |

---

## UI (Tauri) — for understanding

The Tauri desktop UI externalizes the system's model of the infrastructure. It is not a chatbot shell. It does not drive the agent — engineers still interact through the terminal.

See [Desktop UI](desktop-ui.md) for the full screen-by-screen design.

### Fixed screens (always-on, data-driven)

#### Topology
- Service dependency graph with alert, deploy, and change overlays
- Colour-coded node health from the observability integration
- Blast radius analysis: highlight the transitive neighborhood of any node
- Toggle overlays: active alerts, recent deploys, recent config changes

#### Investigation
- Hypothesis tree with status indicators (`investigating`, `supported`, `refuted`)
- Evidence timeline: tool calls, observations, anomalies — in chronological order
- Missing evidence flags: what the agent could not find
- Final diagnosis: cause, confidence, recommendations
- Audit trail: every permitted or blocked tool call

#### Permissions
- Current session identity and capability set
- Restricted capabilities and escalation paths
- Pending approvals with tool call detail
- Audit log of recent actions

#### Knowledge
- Durable memory items filterable by entity, environment, confidence, freshness
- Evidence source links for each item
- Operators can mark items verified, stale, or disputed from this screen

### Agent canvas (dynamic, agent-driven)

A dedicated panel where the agent emits structured UI descriptors during an active investigation. Renders as typed React components:
- Topology diffs (changed/added/removed nodes highlighted)
- Evidence cards (claim, source, timestamp, confidence)
- Hypothesis lists (ranked, with status badges)
- Metric sparklines (time-series with anomaly markers)
- Diff views (code or config, side-by-side or unified)
- Markdown summary panels

The agent canvas is additive — it appears alongside the fixed Investigation screen and does not replace it.

---

## Design Principle

> The CLI is the primary surface for asking questions, starting investigations, and approving actions. The UI is the primary surface for topology, timelines, permissions, and remembered system knowledge.

Neither surface tries to replace the other. The terminal remains composable and scriptable; the UI remains high-density and visual.
