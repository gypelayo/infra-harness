# UX Design

infra-harness does not force a choice between terminal and dashboard. Each surface has a distinct role.

## CLI — for action

The CLI is the primary surface for asking questions, starting investigations, and approving actions. It is optimized for terse, high-signal commands and prompt compression.

The system resolves the minimum relevant context automatically — engineers should not have to spell out what the system already knows.

### Illustrative Commands

```bash
# Ask a diagnostic question
infra ask why checkout p95 increased since 09:20

# Start a structured investigation
infra investigate deployment-regression checkout --env prod

# Explore the context graph
infra graph checkout --neighbors 2

# Inspect current session permissions
infra perms current-session

# Store a durable operational fact
infra remember "billing-worker queue saturation usually follows partner sync lag"
```

---

## UI — for understanding

The UI externalizes the system's model of the infrastructure so humans can understand, validate, and correct it quickly. It is not a chatbot shell.

### Key Screens

#### 1. Topology
- Services, dependencies, cloud resources, clusters, and repos
- Optional overlays: active alerts, recent deploys, recent config changes
- Purpose: understand system shape and blast radius at a glance

#### 2. Investigation
- Hypothesis tree
- Evidence timeline (commands executed, data retrieved, anomalies observed)
- Missing evidence indicators
- Final diagnosis and resolution path
- Purpose: turn agent activity into an auditable operational narrative

#### 3. Permissions
- Current session identity
- Available capabilities (what is allowed)
- Restricted capabilities (what requires escalation or approval)
- Pending approvals
- Provider mappings (how session identity resolves to each tool's credentials)
- Purpose: make the trust boundary explicit and inspectable

#### 4. Knowledge
- Remembered facts with confidence and freshness scores
- Evidence source links
- Stale or disputed items highlighted
- Purpose: let operators understand what the system "knows" and correct it when wrong

---

## Design Principle

> The CLI is the primary surface for asking questions, starting investigations, and approving actions. The UI is the primary surface for topology, timelines, permissions, and remembered system knowledge.

Neither surface tries to replace the other. The CLI remains composable and scriptable; the UI remains high-density and visual.
