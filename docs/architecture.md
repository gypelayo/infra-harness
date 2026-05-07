# Architecture

infra-harness is composed of five cooperating layers, implemented across two surfaces: the **pi CLI** and the **Tauri desktop UI**.

## System Layers

| Layer | Responsibility | Implementation |
|---|---|---|
| **Harness runtime** | Executes CLI-led investigations and tool calls | pi (terminal harness) + infra-harness pi package |
| **Permission broker** | Unifies identity, scopes, and approvals across integrations | Pi extension — `tool_call` event handler gates all tool calls |
| **Context graph** | Represents services, repos, resources, incidents, and dependencies | Embedded graph store accessed via pi extension tools |
| **Memory engine** | Stores validated facts, lessons, investigations, and patterns | Pi extension — persisted via `pi.appendEntry()`, reconstructed on `session_start` |
| **Visual interface** | Renders topology, permission maps, timelines, and knowledge health | Tauri desktop app (React + Tailwind); agent canvas for dynamic views |

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Engineer                                  │
│                                                             │
│   ┌────────────────────────┐   ┌────────────────────────┐  │
│   │    Terminal (CLI)       │   │   Tauri Desktop UI     │  │
│   │                        │   │                        │  │
│   │  pi + infra-harness    │   │  Fixed screens:        │  │
│   │  pi package            │   │  • Topology            │  │
│   │                        │   │  • Investigation       │  │
│   │  Extensions:           │   │  • Permissions         │  │
│   │  • Infra tools         │   │  • Knowledge           │  │
│   │  • Permission broker   │   │                        │  │
│   │  • Memory engine       │   │  Agent canvas:         │  │
│   │  • Graph tools         │   │  • Descriptor-driven   │  │
│   │  • UI descriptor emit  │   │    dynamic components  │  │
│   │                        │   │                        │  │
│   │  Skills:               │   └───────────┬────────────┘  │
│   │  • Investigation       │               │ Tauri IPC      │
│   │    recipes             │   ┌───────────▼────────────┐  │
│   │                        │   │   Tauri Rust backend   │  │
│   └───────────┬────────────┘   │                        │  │
│               │                │   Spawns & manages pi  │  │
│               │ stdin/stdout   │   as RPC sidecar       │  │
│               └────────────────►                        │  │
│                    JSONL       └────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   External systems  │
              │  AWS • K8s • GitHub │
              │  Observability      │
              │  Internal docs      │
              └─────────────────────┘
```

---

## Component Detail

### Harness Runtime (pi)

Pi is a minimal, extensible terminal coding agent. It is **not forked** — infra-harness ships as a **pi package** that engineers install with `pi install npm:@infra-harness/pi-package`.

Pi provides:
- The interactive terminal loop and message streaming
- Session persistence (JSONL tree format with branching)
- Context compaction and model management
- The extension, skill, and prompt template systems

See [Pi Package](pi-package.md) for the full package structure.

### Permission Broker (pi extension)

Implemented as a pi extension that subscribes to the `tool_call` event. Before any tool executes, the broker:
1. Checks the tool name against the session's capability set
2. Prompts for approval if the capability requires it (`ctx.ui.confirm()`)
3. Returns `{ block: true, reason }` to prevent execution if denied
4. Logs every permitted action to the audit trail

The broker also injects the current session capability set into the system prompt via `before_agent_start` so the model understands what it can and cannot do without guessing.

See [Permission Model](permission-model.md).

### Context Graph (pi extension + graph store)

The context graph is a persistent store of entities (services, repos, clusters, alarms, etc.) and their relationships. It is accessed via registered pi tools:

- `graph.query` — traverse entities and relationships
- `graph.ingest` — add or update entities from tool output
- `graph.neighbors` — return the neighborhood of a given entity

The graph store itself is a local embedded database (SQLite with a graph schema, or a graph-native store like Kuzu). The Tauri UI reads the same store directly for the Topology screen.

See [Data Model](data-model.md).

### Memory Engine (pi extension)

Implemented as a pi extension that:
- Persists durable memory items via `pi.appendEntry()` (they survive session compaction)
- Reconstructs in-memory state from session entries on `session_start`
- Exposes a `memory.store` tool for the agent to write new durable facts
- Injects relevant memory slices into the system prompt via `before_agent_start`

See [Memory Model](memory-model.md).

### Visual Interface (Tauri)

The Tauri desktop app provides two kinds of UI:

**Fixed screens** (always-on, data-driven):
- **Topology** — graph visualization of services, dependencies, and infra resources
- **Investigation** — hypothesis tree, evidence timeline, diagnosis path
- **Permissions** — current session capability map, pending approvals
- **Knowledge** — memory items with confidence, freshness, and source links

**Agent canvas** (dynamic, agent-generated):
- A dedicated panel where the agent emits structured UI descriptors
- Descriptors are rendered as React components (evidence cards, metric sparklines, diff views, etc.)
- The agent emits descriptors by calling the `render_ui` tool; the extension forwards them to the Tauri frontend via the RPC channel

See [Desktop UI](desktop-ui.md) and [Tech Stack](tech-stack.md).

---

## Design Rule

> Anything representable as a widget, state object, or graph edge should not repeatedly consume model tokens.

Token efficiency is an architectural property, not a prompt-tuning afterthought. See [Token Efficiency](token-efficiency.md).
