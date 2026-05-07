# Tech Stack

This document explains the technology choices for each layer of infra-harness and the rationale behind them.

---

## CLI Harness — pi

**Choice:** [pi](https://shittycodingagent.ai) (`@mariozechner/pi-coding-agent`) as the terminal harness, extended via a custom **pi package**.

### What pi provides

Pi is a minimal, extensible terminal coding agent that ships with four default tools (`read`, `bash`, `edit`, `write`) and a powerful extension system. It is not forked or modified — infra-harness ships **on top of pi** as a published pi package.

Pi's extension API gives us everything needed:

| Need | Pi capability |
|---|---|
| Custom infra tools (AWS, k8s, GitHub, observability) | `pi.registerTool()` in extensions |
| Permission broker (gate tool calls before execution) | `tool_call` event handler returning `{ block: true }` |
| Investigation context injection | `before_agent_start` event to inject memory/graph slices |
| Session-persistent state (memory, graph) | `pi.appendEntry()` + `session_start` reconstruction |
| Investigation recipes | Pi skills (`SKILL.md` files) invoked via `/skill:name` |
| Common query templates | Pi prompt templates (`.md` files, invoked via `/templatename`) |
| Custom commands | `pi.registerCommand()` |
| Real-time UI in the terminal | `ctx.ui.custom()` with TUI components from `@mariozechner/pi-tui` |

### What the infra-harness pi package contains

```
extensions/       TypeScript extensions (tools, permission broker, memory, UI widgets)
skills/           Investigation recipe SKILL.md files
prompts/          Prompt template .md files
```

Published to npm so engineers install it with:

```bash
pi install npm:@infra-harness/pi-package
```

### Why not fork pi

Pi's philosophy is "adapt pi to your workflows, not the other way around." Forking would mean maintaining a diverged codebase and missing upstream improvements. Everything needed can be expressed through the extension API.

---

## Desktop UI — Tauri

**Choice:** [Tauri](https://tauri.app) (Rust backend + system webview) with React and Tailwind CSS on the frontend.

### Why Tauri

| Criterion | Tauri | Electron | Pure web |
|---|---|---|---|
| Binary size | ~4 MB | ~120–200 MB | N/A (needs server) |
| Cross-platform | macOS, Windows, Linux | macOS, Windows, Linux | macOS, Windows, Linux (browser) |
| Performance | Native Rust backend | Node.js backend | Depends on host |
| System webview | Yes (no bundled Chromium) | No (bundles Chromium) | — |
| IPC to subprocess | Shell commands, sidecar API | Shell commands | WebSocket/HTTP |
| Native feel | Strong | Moderate | Weak |

For a developer tool used by infra engineers, binary size and native feel matter. Tauri's Rust backend also gives us a safe, performant layer for spawning and managing the pi subprocess.

### Why React + Tailwind

- React is the dominant UI library with the richest ecosystem of visualization components (D3, React Flow, etc.) needed for the topology and investigation views
- Tailwind provides utility-first styling with no runtime overhead
- Both are well-supported in Tauri's frontend ecosystem

---

## Agent ↔ UI Bridge — pi RPC mode

**Choice:** The Tauri Rust backend spawns pi as a sidecar subprocess in `--mode rpc`. Communication is structured JSONL over stdin/stdout.

### How it works

```
┌─────────────────────────────────────┐
│           Tauri App                 │
│                                     │
│  ┌────────────┐   ┌───────────────┐ │
│  │  Frontend  │◄──│  Rust backend │ │
│  │ (React/TW) │   │               │ │
│  └────────────┘   │  spawns pi    │ │
│                   │  --mode rpc   │ │
│                   └──────┬────────┘ │
└──────────────────────────┼──────────┘
                           │ stdin/stdout (JSONL)
                    ┌──────▼────────┐
                    │      pi       │
                    │  (RPC mode)   │
                    │               │
                    │  + infra-     │
                    │  harness      │
                    │  package      │
                    └───────────────┘
```

The Rust backend:
1. Spawns `pi --mode rpc --no-session` with the infra-harness pi package loaded
2. Sends RPC commands (prompt, tool results) as JSONL to pi's stdin
3. Receives agent events (streaming text, tool calls, custom UI events) from pi's stdout
4. Forwards relevant events to the React frontend via Tauri's IPC (`tauri::command` / `emit`)

### Why RPC mode over the SDK

Pi also exposes a Node.js SDK (`createAgentSession`). RPC mode is preferred here because:
- The Tauri backend is **Rust** — interoperating with a Node.js SDK would require a Node.js sidecar anyway
- RPC mode provides process isolation (pi crash does not crash the UI)
- The JSONL protocol is language-agnostic and well-documented

---

## Agent-Generated UI — Extension + Tauri Canvas

**Choice:** A custom pi extension registers a tool (`render_ui`) that the agent calls to emit structured UI descriptors. These descriptors flow through the RPC channel to the Tauri frontend, which renders them in a dedicated **agent canvas panel**.

### Protocol

```
Agent calls render_ui({ descriptor: { type: "topology-diff", ... } })
    │
    ▼
pi extension serializes descriptor into a custom RPC event
    │
    ▼
Tauri Rust backend receives the event
    │
    ▼
Tauri emits "agent-ui" event to the React frontend
    │
    ▼
React agent canvas renders the descriptor as a component
```

### Descriptor types (planned)

| Type | Description |
|---|---|
| `topology-diff` | Highlight changes on the topology graph |
| `evidence-card` | A structured evidence item with source, timestamp, confidence |
| `hypothesis-list` | Current hypothesis tree with status indicators |
| `metric-sparkline` | Inline metric chart for a specific signal and time range |
| `diff-view` | Side-by-side config or code diff |
| `summary-panel` | Free-form markdown rendered in the canvas |

The set of descriptor types grows as the product evolves. The fixed UI screens (Topology, Permissions, Knowledge, Investigation) are **not** agent-generated — they are always-on, deterministic views driven by the context graph and memory engine.

---

## Summary

```
CLI (terminal)
└── pi + infra-harness pi package
    ├── Extensions: tools, permission broker, memory, graph, agent-canvas emit
    ├── Skills: investigation recipes
    └── Prompt templates: common query starters

Desktop UI (cross-platform app)
└── Tauri (Rust + system webview)
    ├── Frontend: React + Tailwind
    │   ├── Fixed screens: Topology, Investigation, Permissions, Knowledge
    │   └── Agent canvas: dynamic panel for agent-generated UI descriptors
    └── Backend: Rust sidecar manager
        └── pi subprocess in --mode rpc (JSONL over stdin/stdout)
```
