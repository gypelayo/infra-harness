# Risks

## Product Risks

| Risk | Description |
|---|---|
| Scope drift | The product drifts into generic AIOps positioning and loses focus on the governed operational context workflow |
| Incumbent response | Large observability vendors add overlapping AI workflow features |
| Autonomy over-promise | The system implies more autonomous capability than the permission and trust model can responsibly support |

## Technical Risks

| Risk | Description |
|---|---|
| Permission normalization complexity | Normalizing auth across AWS, Kubernetes, GitHub, and observability tools may be more complex than expected |
| Graph freshness decay | Memory quality and graph accuracy may degrade without strong ingestion, validation, and freshness decay flows |
| Token savings erosion | If tool outputs remain verbose and unstructured, prompt injection will grow and offset architectural savings |

## Adoption Risks

| Risk | Description |
|---|---|
| Operator distrust | Operators may reject recommendations unless evidence and permission scope are highly visible and auditable |
| Dashboard fatigue | Teams may resist yet another dashboard unless the CLI and existing terminal workflows remain central |

## Mitigations

- Keep Phase 1 read-only and evidence-heavy to build operator trust before introducing any write capabilities
- Prioritize CLI ergonomics — the UI should complement, not replace, the terminal
- Build normalization and freshness decay into the graph from day one, not as a later addition
- Track token cost per investigation from the start to catch erosion early
