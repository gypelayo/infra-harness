# Architecture

infra-harness is composed of five cooperating layers.

## System Layers

| Layer | Responsibility | Why it exists |
|---|---|---|
| **Harness runtime** | Executes CLI-led investigations and tool calls | Keeps the UX fast, scriptable, and native to infra work |
| **Permission broker** | Unifies identity, scopes, and approvals across integrations | Solves fragmented auth and makes capabilities explicit |
| **Context graph** | Represents services, repos, resources, incidents, and dependencies | Gives the system a persistent relational model of the environment |
| **Memory engine** | Stores validated facts, lessons, investigations, and patterns | Prevents rediscovery and improves continuity across sessions |
| **Visual interface** | Renders topology, permission maps, timelines, and knowledge health | Improves comprehension while saving tokens |

---

## Component Detail

### Harness Runtime

The interactive entry point. Supports question-driven workflows such as:

- _"Why is checkout slower than yesterday?"_
- _"What changed before the worker crash loop started?"_

Orchestrates tool calls, collects evidence, and builds a compact **investigation state** rather than relying on long conversational transcripts.

### Permission Broker

Exposes a single session identity and translates it into provider-specific access for AWS, Kubernetes, GitHub, Terraform, and observability systems.

Instead of handing the model raw CLI availability, the broker surfaces typed capabilities (`read.logs`, `list.deployments`, `diff.iac`, `open.pr`, `restart.workload`) with explicit approval requirements and audit trails.

See [Permission Model](permission-model.md) for the full capability taxonomy.

### Context Graph

Stores entities (services, repos, cloud resources, clusters, namespaces, queues, alarms, pipelines, feature flags, dashboards, teams, documents) and their relationships.

Examples:
- `service A` → `deploys_from` → `repo B`
- `worker C` → `depends_on` → `queue D`
- `runbook E` → `applies_to` → `alarm F`

The graph is the agent's navigable map of the system. A graph database or graph-like relational model fits this structure because diagnosis often requires traversing many system boundaries.

See [Data Model](data-model.md) for the full entity and relationship catalog.

### Memory Engine

Distinguishes between ephemeral session state and durable organizational knowledge. Durable memory is evidence-linked and confidence-scored — facts are marked as `verified`, `inferred`, `stale`, or `disputed` rather than treated as equally trustworthy.

See [Memory Model](memory-model.md) for memory types and retention policies.

### Visual Interface

Not a generic chatbot shell. Dedicated screens for:

- **Topology** — service dependency map with alert and deploy overlays
- **Investigation** — hypothesis tree, evidence timeline, and diagnosis path
- **Permissions** — current session scopes, dangerous capabilities, approval boundaries
- **Knowledge** — remembered facts, confidence, freshness, and source links

See [UX](ux.md) for screen-by-screen design intent.

---

## Design Rule

> Anything representable as a widget, state object, or graph edge should not repeatedly consume model tokens.

Token efficiency is an architectural property, not a prompt-tuning afterthought. See [Token Efficiency](token-efficiency.md).
