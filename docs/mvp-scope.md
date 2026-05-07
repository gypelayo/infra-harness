# MVP Scope

The MVP is narrow and optimized for one painful workflow: **read-only investigation** across AWS, Kubernetes, GitHub, and one observability source, focused on diagnosing regressions and incidents.

## Integrations

| Integration | Status |
|---|---|
| AWS | In scope |
| Kubernetes | In scope |
| GitHub | In scope |
| Datadog or CloudWatch (one) | In scope |
| Internal docs / runbook source | In scope |

## Workflows

### 1. Deployment Regression Diagnosis
Correlate recent deploys, code changes, metrics anomalies, and infrastructure changes to surface the likely cause of a performance or availability regression.

### 2. Service Incident Context Assembly
Build a consolidated view of likely affected components, owners, relevant alerts, and evidence — without requiring the engineer to manually query five different tools.

### 3. Known-Pattern Recall
Surface prior similar incidents and validated lessons from durable memory to accelerate diagnosis.

## Explicit Exclusions

- Write actions into production
- Broad security or compliance automation
- Full multi-cloud support beyond the first provider set
- Generic free-form assistant behavior without explicit investigation state
- Full autonomous remediation without approvals

## Positioning Note

The MVP should start as an **orchestration and understanding layer** above existing systems — not a complete control plane replacement. The value is faster, more justified diagnosis, not autonomous action.
