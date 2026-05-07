# infra-harness

> A CLI-led AI system that lets engineers talk to their infrastructure using durable operational memory, unified permissions, and visual system understanding.

---

## What is this?

**infra-harness** is an AI-native infrastructure tool for engineers who need to diagnose incidents, understand system topology, and investigate regressions — without rebuilding context from scratch every session.

It is **not** a generic DevOps copilot. It is a governed operational context system that combines:

- A **CLI-first execution harness** for asking questions and running investigations
- A **unified permission broker** that maps one session identity to many tools
- A **persistent knowledge layer** (context graph + memory engine) that retains what the system has learned
- A **visual interface** for topology, investigations, permission scopes, and knowledge health

The core promise: reduce time from question or alert to justified diagnosis, while preserving operator control and minimizing token waste.

---

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | System layers, components, and how they cooperate |
| [Data Model](docs/data-model.md) | Entities, relationships, and the context graph |
| [Memory Model](docs/memory-model.md) | Session, working, durable, and preference memory |
| [Permission Model](docs/permission-model.md) | Capability-based permissions and the broker layer |
| [UX](docs/ux.md) | CLI and UI experience design |
| [Token Efficiency](docs/token-efficiency.md) | Architectural strategies for minimizing token usage |
| [MVP Scope](docs/mvp-scope.md) | What's in and out of the first version |
| [Roadmap](docs/roadmap.md) | Phase 1 → Phase 3 plan |
| [Metrics](docs/metrics.md) | Product and business success metrics |
| [Risks](docs/risks.md) | Product, technical, and adoption risks |

---

## Problem

Modern infrastructure work is spread across many surfaces: cloud providers, Kubernetes clusters, repositories, CI pipelines, observability tools, internal documentation, and tribal knowledge. Three gaps are especially acute:

- **Permissions fragmentation** — each CLI or service has its own auth model, scopes, and role assumptions
- **Knowledge rediscovery** — operational facts, prior incidents, and environment-specific quirks are not consolidated into reusable structured memory
- **Weak visual comprehension** — infrastructure is relational, but existing harnesses are largely text-centric

## Target Users

- Senior software engineers debugging distributed systems
- Platform and infrastructure engineers working across AWS, Kubernetes, CI/CD, and repositories
- SREs and on-call responders who need faster path-to-cause analysis with auditable evidence

**Ideal customer profile**: a cloud-native company with 20–200 engineers, a meaningful production footprint in AWS and Kubernetes, and an existing but fragmented tool stack spanning GitHub, Terraform, observability, and internal docs.

---

## Core Principles

1. **CLI for action, UI for understanding** — the terminal is the primary action surface; the UI externalizes topology, timelines, and system knowledge
2. **Hard permissions, not prompt permissions** — capabilities are enforced below the model through a brokered permission layer
3. **Memory as structured operational knowledge** — not chat logs; queryable entities, relationships, lessons, and operator-approved interpretations
4. **Visualization is a product feature, not decoration** — dependency maps, blast radius views, and investigation timelines reduce token usage and improve human understanding
5. **Token efficiency is architectural** — topology, permissions, and memory live outside the prompt; only relevant slices enter model context

---

## Positioning

> AI infrastructure harness / operational context system — not a generic DevOps copilot.

Observability vendors, security vendors, and coding harnesses validate the components individually. The specific combination of CLI-native execution, persistent operational knowledge, unified capabilities, visualization, and token-efficient architecture remains underbuilt in the market.
