# MVP Task List

Read-only investigation across AWS, Kubernetes, GitHub, and one observability source (CloudWatch). Three workflows: deployment regression diagnosis, incident context assembly, known-pattern recall.

Status markers: `[ ]` not started · `[~]` in progress · `[x]` done

---

## 1. Repo & Monorepo Structure

- [ ] Scaffold monorepo: `packages/pi-package/` and `packages/desktop/`
- [ ] Root `package.json` with workspaces
- [ ] Root `tsconfig.json` shared base
- [ ] `.gitignore` (node_modules, dist, target, *.sqlite)
- [ ] `AGENTS.md` for pi (project conventions for the agent working on this codebase)

---

## 2. Knowledge Base

- [ ] `packages/pi-package/src/db/schema.sql` — full SQLite schema (entities, edges, memory_items, memory_entity_refs, memory_evidence, FTS5 virtual table, triggers)
- [ ] `packages/pi-package/src/db/migrate.ts` — run schema migrations on first open, version-tracked
- [ ] `packages/pi-package/src/db/client.ts` — `better-sqlite3` wrapper: open with WAL mode, load `sqlite-vec`, expose typed query helpers
- [ ] `packages/pi-package/src/db/freshness.ts` — exponential decay job, run on `session_start`
- [ ] `packages/desktop/src-tauri/src/db.rs` — `rusqlite` read-only client for Tauri backend (WAL, load sqlite-vec)
- [ ] Shared DB file path resolution: `~/.infra-harness/kb.sqlite` (configurable via env var)

---

## 3. Pi Package — Project Scaffolding

- [ ] `packages/pi-package/package.json` with `pi` manifest (`extensions`, `skills`, `prompts`)
- [ ] `packages/pi-package/extensions/index.ts` — main extension entry, registers all sub-extensions
- [ ] TypeScript build config (`tsconfig.json`, no compilation needed — pi uses jiti)
- [ ] Confirm `pi install` works locally: `pi install git:github.com/gypelayo/infra-harness` pointed at `packages/pi-package`

---

## 4. Pi Package — Permission Broker

- [ ] `extensions/broker/capability-map.ts` — maps each tool name to a capability string (`k8s.read.logs`, etc.)
- [ ] `extensions/broker/session-caps.ts` — load/store session capability set (from config file or env)
- [ ] `extensions/broker/audit-log.ts` — append permitted/blocked actions via `pi.appendEntry`
- [ ] `extensions/broker/index.ts` — `tool_call` handler: check capability → prompt approval if required → log → block or allow
- [ ] `extensions/broker/index.ts` — `before_agent_start` handler: inject current capability set into system prompt

---

## 5. Pi Package — Tool Adapters (read-only)

### AWS (`cloud.read.*`)
- [ ] `extensions/tools/aws.ts` — `aws_list_resources`: list resources by type and region (uses AWS SDK v3)
- [ ] `extensions/tools/aws.ts` — `aws_get_metrics`: fetch CloudWatch metrics for a resource + time range
- [ ] `extensions/tools/aws.ts` — `aws_get_logs`: fetch CloudWatch Logs events for a log group + filter
- [ ] AWS credential resolution: role assumption, env vars, `~/.aws/credentials` — delegate to AWS SDK default chain

### Kubernetes (`k8s.read.*`)
- [ ] `extensions/tools/kubernetes.ts` — `k8s_list_workloads`: list deployments, replicasets, daemonsets in a namespace
- [ ] `extensions/tools/kubernetes.ts` — `k8s_get_pod_logs`: fetch logs from a pod/container (tail N lines, optional since timestamp)
- [ ] `extensions/tools/kubernetes.ts` — `k8s_describe_pod`: describe pod status, conditions, and events
- [ ] Kubeconfig resolution: `KUBECONFIG` env var, `~/.kube/config`, current context

### GitHub (`repo.read.*`)
- [ ] `extensions/tools/github.ts` — `github_list_commits`: recent commits for a repo with author, message, timestamp
- [ ] `extensions/tools/github.ts` — `github_get_diff`: diff between two refs (commit SHAs, tags, branches)
- [ ] `extensions/tools/github.ts` — `github_list_workflow_runs`: recent CI run statuses for a repo + optional branch filter
- [ ] GitHub auth: `GITHUB_TOKEN` env var

### CloudWatch observability (`cloud.read.metrics`)
- [ ] `extensions/tools/observability.ts` — `obs_query_metrics`: query CloudWatch metrics with namespace, metric name, dimensions, stat, period
- [ ] `extensions/tools/observability.ts` — `obs_get_alarms`: list CloudWatch alarms and their current states

---

## 6. Pi Package — Context Graph Tools

- [ ] `extensions/tools/graph.ts` — `graph_query`: query entities by type/env, with optional relationship traversal (n hops, relation filter)
- [ ] `extensions/tools/graph.ts` — `graph_ingest`: upsert entity + edges from structured input; called by tool adapters after each tool result
- [ ] `extensions/tools/graph.ts` — `graph_neighbors`: return the n-hop neighborhood of a named entity
- [ ] Auto-ingest wiring: `tool_result` event handler that parses AWS, k8s, and GitHub tool results and calls `graph_ingest` automatically

---

## 7. Pi Package — Memory Engine

- [ ] `extensions/memory/store.ts` — `memory_store` tool: write a durable fact with confidence, env scope, entity refs, evidence
- [ ] `extensions/memory/query.ts` — `memory_query` tool: retrieve by FTS keyword match OR vector nearest-neighbour
- [ ] `extensions/memory/embeddings.ts` — generate embeddings via OpenAI `text-embedding-3-small`; store in `memory_vectors` via sqlite-vec
- [ ] `extensions/memory/inject.ts` — `before_agent_start` handler: embed the current prompt, retrieve top-k relevant memory items, inject as a compact system prompt block
- [ ] `extensions/memory/index.ts` — `session_start` handler: reconstruct working memory from session entries

---

## 8. Pi Package — Agent Canvas Tool

- [ ] `extensions/ui/descriptor-schema.ts` — TypeBox schemas for all descriptor types (`evidence-card`, `metric-sparkline`, `diff-view`, `summary-panel`, `topology-diff`)
- [ ] `extensions/ui/render-ui.ts` — `render_ui` tool: validate descriptor, detect if Tauri sidecar is active (env var), emit RPC event OR render TUI fallback via `@mariozechner/pi-tui`
- [ ] TUI fallback renderers for each descriptor type (summary text using pi-tui `Text`, `Markdown`, `Box`)

---

## 9. Pi Package — Skills

- [ ] `skills/deployment-regression/SKILL.md` — step-by-step recipe: list deploys → fetch metric window → get commit diff → check infra changes → query memory → summarise
- [ ] `skills/incident-context/SKILL.md` — recipe: identify affected entities → list active alerts → get recent changes → assemble owner + evidence view
- [ ] `skills/known-patterns/SKILL.md` — recipe: embed incident description → recall top memory matches → present with confidence and source

---

## 10. Pi Package — Prompt Templates

- [ ] `prompts/ask.md` — terse single-question template
- [ ] `prompts/investigate.md` — structured investigation starter (service, env, description)
- [ ] `prompts/remember.md` — store a durable operational fact

---

## 11. Tauri App — Scaffolding

- [ ] `packages/desktop/` — `pnpm create tauri-app` (React + TypeScript + Tailwind)
- [ ] Tauri sidecar config: declare pi binary as an allowed sidecar in `tauri.conf.json`
- [ ] Tauri capability config: allow shell sidecar execution, filesystem access to `~/.infra-harness/`
- [ ] Rust workspace setup in `src-tauri/Cargo.toml` (`rusqlite`, `serde`, `tauri`)

---

## 12. Tauri App — Pi RPC Sidecar Manager (Rust)

- [ ] `src-tauri/src/sidecar.rs` — spawn `pi --mode rpc` as a Tauri sidecar process
- [ ] JSONL reader/writer over stdin/stdout (LF-delimited, strict split per pi RPC spec)
- [ ] Route inbound events: agent text → ignore (terminal handles it), `render_ui` descriptor → emit to frontend, approval request → emit to frontend
- [ ] Tauri commands: `send_prompt`, `send_approval`, `get_sidecar_status`
- [ ] Reconnect/restart logic if pi process exits unexpectedly

---

## 13. Tauri App — Rust DB Reader

- [ ] `src-tauri/src/db.rs` — open `kb.sqlite` in read-only WAL mode, load sqlite-vec
- [ ] Tauri commands for Topology screen: `get_entities(env, type_filter)`, `get_edges(from_id)`, `get_neighbors(entity_id, hops)`
- [ ] Tauri commands for Knowledge screen: `get_memory_items(filter)`, `get_memory_evidence(memory_id)`
- [ ] Tauri commands for Permissions screen: `get_audit_log(limit)`, `get_session_capabilities()`
- [ ] Tauri commands for Investigation screen: `get_investigation(session_id)`

---

## 14. Tauri App — Topology Screen

- [ ] Install React Flow (graph layout + interaction)
- [ ] `TopologyScreen` component: fetch entities + edges via Tauri command, render graph
- [ ] Node types: service (circle), repo (square), cluster (hexagon), cloud resource (diamond), alert (triangle)
- [ ] Node colour coding: healthy (green), degraded (yellow), alerting (red), unknown (grey)
- [ ] Edge labels by relation type
- [ ] Overlay toggles: active alerts, recent deploys (last 24h), recent config changes
- [ ] Click node → side panel with entity detail + linked memory items
- [ ] Blast radius mode: highlight n-hop neighborhood from selected node

---

## 15. Tauri App — Investigation Screen

- [ ] `InvestigationScreen` component: load investigation from DB + live updates from RPC sidecar
- [ ] Hypothesis tree: collapsible nodes with status badges (`investigating`, `supported`, `refuted`, `unresolved`)
- [ ] Evidence timeline: chronological list of tool calls, observations, anomalies
- [ ] Missing evidence panel: items the agent flagged as absent
- [ ] Diagnosis panel: final cause, confidence meter, recommendations
- [ ] Audit trail tab: permitted/blocked tool calls with timestamp and capability used
- [ ] Agent canvas panel (see task 17)

---

## 16. Tauri App — Permissions Screen

- [ ] `PermissionsScreen` component
- [ ] Session identity card: who this session is acting as
- [ ] Capability grid: granted (green) vs restricted (grey) vs requires approval (yellow)
- [ ] Provider mappings: show how session identity resolves to each tool's credentials
- [ ] Pending approvals list: tool call detail + Approve / Deny buttons → `send_approval` Tauri command
- [ ] Audit log table: filterable by capability, action, outcome

---

## 17. Tauri App — Knowledge Screen

- [ ] `KnowledgeScreen` component
- [ ] Memory items list: filterable by entity, env, confidence, freshness
- [ ] Confidence badge: `verified` (green), `inferred` (blue), `stale` (yellow), `disputed` (red)
- [ ] Freshness bar per item
- [ ] Evidence source links (clickable)
- [ ] Inline edit: mark item as verified / stale / disputed → write back via pi `memory_store`

---

## 18. Tauri App — Agent Canvas

- [ ] `AgentCanvas` panel component (lives inside Investigation screen)
- [ ] Descriptor renderer registry: maps descriptor `type` to a React component
- [ ] `EvidenceCard` renderer
- [ ] `MetricSparkline` renderer (use Recharts or Victory — lightweight)
- [ ] `DiffView` renderer (unified diff with syntax highlighting)
- [ ] `SummaryPanel` renderer (Markdown with react-markdown)
- [ ] `TopologyDiff` renderer (delta overlay on a mini topology graph)
- [ ] `HypothesisList` renderer
- [ ] Live update: append new descriptors as they arrive from the RPC sidecar

---

## 19. Auth & Configuration

- [ ] `~/.infra-harness/config.json` schema: db path, AWS region/role, k8s context, GitHub token source, observability source + key
- [ ] Config loader in pi extension (read on `session_start`)
- [ ] Config loader in Tauri Rust backend
- [ ] `/infra-config` pi command: interactive config setup using `ctx.ui` select/input
- [ ] Tauri settings screen (or defer to CLI-only config for MVP)

---

## 20. End-to-End Workflow Tests

- [ ] E2E test: deployment regression — run `/skill:deployment-regression`, assert tool calls, assert graph ingestion, assert diagnosis output
- [ ] E2E test: incident context assembly — run `/skill:incident-context`, assert entity neighborhood retrieval, assert evidence card emitted to canvas
- [ ] E2E test: known-pattern recall — store two memory items, run `/skill:known-patterns`, assert top-k retrieval matches expected items
- [ ] Permission broker test: attempt a write-capability tool call, assert it is blocked

---

## 21. Packaging & Distribution

- [ ] `packages/pi-package` — publish to npm as `@infra-harness/pi-package`
- [ ] Tauri build pipeline: macOS (universal), Windows, Linux (AppImage + deb)
- [ ] GitHub Actions: build + test on push to main
- [ ] `docs/install.md` — installation instructions (pi package install + desktop app download)
- [ ] `docs/quickstart.md` — first investigation walkthrough

---

## Deferred (post-MVP)

- Write capabilities (restart workload, open PR) with approval flow
- Datadog adapter (alternative to CloudWatch)
- Internal docs / runbook source ingestion
- Knowledge base sync across team members
- Terraform / IaC diff tools
- Tauri auto-update
