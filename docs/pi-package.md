# Pi Package

The infra-harness CLI ships as a **pi package** — a published npm package that engineers install into their pi installation:

```bash
pi install npm:@infra-harness/pi-package
```

Pi is the terminal harness. The infra-harness pi package extends it with infra-specific tools, an investigation memory layer, a permission broker, investigation recipes, and common query templates — without forking pi.

---

## Package Structure

```
@infra-harness/pi-package
├── package.json               (pi package manifest)
├── extensions/
│   ├── index.ts               (main extension entry point)
│   ├── tools/
│   │   ├── aws.ts             (AWS read tools: resources, metrics, logs)
│   │   ├── kubernetes.ts      (k8s read tools: workloads, pods, logs)
│   │   ├── github.ts          (GitHub read tools: commits, PRs, actions)
│   │   ├── observability.ts   (metrics, traces, dashboards adapter)
│   │   └── graph.ts           (context graph query/ingest tools)
│   ├── broker/
│   │   └── permission-broker.ts  (tool_call gate + audit log)
│   ├── memory/
│   │   └── memory-engine.ts   (durable fact store via pi.appendEntry)
│   └── ui/
│       └── ui-descriptor.ts   (render_ui tool + RPC forward for Tauri canvas)
├── skills/
│   ├── deployment-regression/
│   │   └── SKILL.md           (investigation recipe for deploy regressions)
│   ├── incident-context/
│   │   └── SKILL.md           (incident context assembly recipe)
│   └── known-patterns/
│       └── SKILL.md           (known-pattern recall from durable memory)
└── prompts/
    ├── ask.md                 (template: infra ask <question>)
    ├── investigate.md         (template: start structured investigation)
    └── remember.md            (template: store a durable operational fact)
```

---

## Extensions

### Infra Tools

Tools are registered via `pi.registerTool()`. Each tool maps to a typed capability in the permission model.

#### AWS tools (`cloud.read.*`)
- `aws_list_resources` — list and describe AWS resources by type and region
- `aws_get_metrics` — fetch CloudWatch metrics for a resource
- `aws_get_logs` — fetch CloudWatch log events

#### Kubernetes tools (`k8s.read.*`)
- `k8s_list_workloads` — list deployments, replicasets, daemonsets in a namespace
- `k8s_get_pod_logs` — fetch logs from a pod/container
- `k8s_describe_pod` — describe pod status and events

#### GitHub tools (`repo.read.*`)
- `github_list_commits` — recent commits for a repo with metadata
- `github_get_diff` — diff between two refs
- `github_list_workflow_runs` — recent CI run statuses

#### Observability tools (`cloud.read.metrics`)
- `obs_query_metrics` — query metrics from the configured observability source (Datadog, CloudWatch)
- `obs_get_dashboard` — retrieve a dashboard definition or snapshot

#### Graph tools (internal)
- `graph_query` — query entities and relationships from the context graph
- `graph_ingest` — add or update entities discovered from tool output
- `graph_neighbors` — return the entity neighborhood (n hops) for a given node

#### Memory tools (internal)
- `memory_store` — write a durable operational fact with confidence and evidence references
- `memory_query` — retrieve memory items relevant to the current investigation context

#### UI descriptor tool (internal)
- `render_ui` — emit a structured UI descriptor to the Tauri agent canvas

### Permission Broker

The broker extension subscribes to `tool_call`:

```typescript
pi.on("tool_call", async (event, ctx) => {
  const capability = toolToCapability(event.toolName);

  if (!sessionHasCapability(capability)) {
    return { block: true, reason: `Capability ${capability} not granted for this session.` };
  }

  if (requiresApproval(capability)) {
    const ok = await ctx.ui.confirm(
      `Approval required`,
      `Allow: ${capability}\nTool: ${event.toolName}\nArgs: ${JSON.stringify(event.input, null, 2)}`
    );
    if (!ok) return { block: true, reason: "Denied by operator." };
  }

  auditLog(capability, event);
});
```

Every permitted action is logged to the audit trail (stored via `pi.appendEntry`).

### Memory Engine

On `session_start`, the memory engine reconstructs in-memory state from session entries. It injects relevant memory slices into the system prompt via `before_agent_start` — only the facts with high relevance to the current prompt are injected, keeping token usage low.

### UI Descriptor Emitter

When the agent calls `render_ui`, the extension:
1. Validates the descriptor schema
2. If running inside the Tauri sidecar (detected via an env var set by Tauri), emits a structured RPC event to stdout that the Tauri Rust backend picks up
3. If running standalone in a terminal, renders a TUI summary of the descriptor using `@mariozechner/pi-tui` components

---

## Skills

Pi skills are SKILL.md files that give the agent structured instructions for a specific investigation type. Engineers invoke them with `/skill:deployment-regression` or the agent loads them automatically when it recognises the pattern.

### `deployment-regression`

```
# Deployment Regression Investigation

Use this skill when: a service metric regressed and a recent deployment may be the cause.

## Steps
1. List recent deployments for the service (github_list_workflow_runs, k8s_list_workloads)
2. Fetch the relevant metric for the window before and after the deploy (obs_query_metrics)
3. Retrieve the commit diff for the deploy (github_get_diff)
4. Check for correlated infra changes (aws_list_resources, graph_neighbors)
5. Query memory for prior regressions on this service (memory_query)
6. Summarise: likely cause, supporting evidence, confidence, next steps
```

### `incident-context`

Assembles a consolidated view of affected components, owners, relevant alerts, and evidence for a live incident.

### `known-patterns`

Surfaces prior similar incidents and validated lessons from durable memory. Uses `memory_query` with semantic similarity on incident descriptions.

---

## Prompt Templates

Templates expand when an engineer types `/ask`, `/investigate`, or `/remember` in pi.

### `ask.md`

```markdown
Answer the following infrastructure question using available tools.
Retrieve only what is needed. Be concise and evidence-linked.

Question: {{question}}
```

### `investigate.md`

```markdown
Start a structured investigation for: {{description}}

Environment: {{env}}
Service: {{service}}

Load relevant memory and graph context first, then collect evidence systematically.
```

### `remember.md`

```markdown
Store the following as a durable operational fact:

"{{fact}}"

Environment scope: {{env}}
Confidence: {{confidence}}
```

---

## Example CLI Session

```bash
# Ask a direct question
infra ask "why is checkout p95 up since 09:20"

# Start a structured investigation using a skill
/skill:deployment-regression

# Browse the context graph for a service
graph_query service=checkout neighbors=2

# Store a lesson
/remember

# Check what this session can do
/perms
```

In practice, engineers just talk to pi naturally. The skills and prompt templates are available as shortcuts, but the agent can also respond to free-form questions using the registered tools directly.
