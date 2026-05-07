# Incident Context Assembly

Use this skill when an incident has been declared or an engineer needs to quickly understand the scope and likely affected components of an ongoing issue.

## When to use

- "We have an incident on X, what do I need to know?"
- "Service Y is down, who owns it and what depends on it?"
- "Help me build an incident timeline"

## Steps

1. **Identify the affected service and environment**
   - Confirm service name and environment (prod, staging). Ask if not provided.

2. **Check current alarm state**
   - Use `obs_get_alarms` to list active alarms related to the service.
   - Use `render_ui` with an `evidence-card` descriptor for each firing alarm.

3. **Inspect workload state**
   - Use `k8s_list_workloads` to check replica counts and readiness.
   - Use `k8s_describe_pod` on any non-ready pods to get events and container states.

4. **Map blast radius**
   - Use `graph_neighbors` on the affected service (direction: inbound, hops: 2) to find services that depend on it.
   - Use `render_ui` with a `topology-diff` descriptor showing the affected subgraph.

5. **Find recent changes**
   - Use `github_list_commits` and `github_list_workflow_runs` to find deployments in the last 2 hours.
   - Use `aws_list_resources` to spot any resource state changes.

6. **Fetch relevant logs**
   - Use `aws_get_logs` or `k8s_get_pod_logs` to get recent error logs from the affected service.

7. **Recall prior incidents**
   - Use `memory_query` with the service name and symptom description.
   - If matching incidents found, surface them with `render_ui` using `evidence-card` descriptors.

8. **Assemble the context view**
   - Use `render_ui` with a `summary-panel` containing:
     - Affected service + current state
     - Blast radius (how many services impacted)
     - Active alarms
     - Recent changes that may be causal
     - Team / owner information (from graph)
     - Prior similar incidents and resolutions
   - Use `render_ui` with a `timeline-overlay` of recent events (deploys, alarms, config changes).

## Notes

- Speed matters during incidents. Prioritise breadth first (scope) over depth (root cause) in the first pass.
- Use `render_ui` liberally — during an incident, the desktop canvas is the fastest way to share context with the team.
- Do not attempt any write actions.
