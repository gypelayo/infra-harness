# Data Model

The context graph is the system's persistent relational model of the infrastructure environment.

## Core Entities

| Entity | Description |
|---|---|
| Service | A deployable application or workload |
| Repository | Source code repository |
| Environment | prod, staging, dev, etc. |
| Cluster | Kubernetes cluster |
| Namespace | Kubernetes namespace |
| Cloud resource | AWS resource (RDS, SQS, S3, ALB, etc.) |
| Pipeline | CI/CD pipeline |
| Alert | Monitoring alert or alarm rule |
| Incident | A declared operational incident |
| Investigation | An agent-led diagnostic session |
| Team | An engineering team |
| Runbook | Documented operational procedure |
| Knowledge item | A durable validated fact or lesson |
| Permission capability | A scoped action the session may perform |
| Tool adapter | Integration with an external system |

## Core Relationships

| From | Relationship | To |
|---|---|---|
| Service | `deployed_from` | Repository |
| Service | `runs_in` | Cluster |
| Service | `depends_on` | Queue / Database / Service |
| Alert | `associated_with` | Service |
| Investigation | `references` | Alert / Deployment / Commit / Dashboard |
| Knowledge item | `supported_by` | Evidence |
| Capability | `applies_to` | Tool adapter |
| Team | `owns` | Service |

## Design Notes

- The graph must support multi-hop traversal — blast radius analysis, for example, requires following `depends_on` edges across many service boundaries.
- Relationships should carry metadata: timestamps, confidence, source of ingestion.
- Freshness decay on edges (e.g., `deployed_from` resolves to a specific image digest that becomes stale after a deploy) should be tracked.
