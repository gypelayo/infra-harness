# Permission Model

Permissions in infra-harness are **capability-based**, not tool-name-based.

Instead of "the model can use the AWS CLI," the system knows exactly which operations are permitted and under which conditions.

## Capability Taxonomy

### Cloud / AWS
| Capability | Description |
|---|---|
| `cloud.read.resources` | List and describe cloud resources |
| `cloud.read.metrics` | Read metrics and alarms |

### Kubernetes
| Capability | Description |
|---|---|
| `k8s.read.workloads` | List deployments, pods, replicasets |
| `k8s.read.logs` | Stream or fetch pod logs |
| `k8s.restart.workload` | Rollout restart a deployment (approval required) |

### Repository
| Capability | Description |
|---|---|
| `repo.read.code` | Read source code and history |
| `repo.create.patch` | Generate a patch or PR (approval required) |

### Infrastructure as Code
| Capability | Description |
|---|---|
| `iac.diff.plan` | Run a Terraform plan and diff |

### Operations
| Capability | Description |
|---|---|
| `deploy.restart.workload` | Restart a running workload (approval required) |
| `incident.create.timeline` | Write to incident timeline |

## Permission Mechanics

1. A session receives a **scoped identity** at startup.
2. **Tool adapters** translate that identity into provider-specific credentials (IAM role assumption, kubeconfig context, GitHub token, etc.).
3. Sensitive capabilities (marked above as "approval required") require explicit human approval or a short-lived escalation token.
4. Every action is **auditable and attributed** — who, what, when, under which capability.
5. The **Permissions UI screen** shows what the current session can and cannot do at all times.

## Design Intent

The goal is a single conceptual permission model for the operator, even when the underlying systems remain heterogeneous. Engineers should never have to mentally track which env var or credential file controls which tool — the broker handles that translation, and the UI makes the resulting capability set visible and auditable.

Permissions are enforced **below the model layer** — natural-language instructions alone cannot grant access to restricted capabilities.
