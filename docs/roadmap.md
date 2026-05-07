# Roadmap

## Phase 1 — Investigate and Map

- Build CLI harness
- Add read-only adapters for AWS, Kubernetes, GitHub, and one observability source
- Create graph ingestion for core entities and relationships
- Ship topology and permissions UI

## Phase 2 — Remember and Explain

- Add durable memory with confidence and freshness fields
- Build investigation timeline view
- Add known-pattern recall and similarity search
- Introduce investigation recipes

## Phase 3 — Govern and Assist

- Add approval flows for sensitive capabilities
- Expand provider coverage
- Add PR generation or remediation proposal surfaces
- Improve auditability and policy controls

---

## Open Questions

These remain unresolved and should inform discovery work before or during Phase 1:

- Which single investigation workflow is painful enough to anchor the MVP?
- Which first customer profile feels this pain most intensely?
- How much of the permission broker should be built versus delegated to existing policy products?
- Should the first release remain read-only, or include approval-gated write proposals?
- What graph and memory storage model best balances latency, cost, and explainability?
