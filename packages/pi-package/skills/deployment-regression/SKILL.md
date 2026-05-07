# Deployment Regression Investigation

Use this skill when a service metric has regressed (latency up, error rate up, throughput down) and a recent deployment may be the cause.

## When to use

The user asks something like:
- "why is X slower since Y time"
- "what caused the p95 spike on service Z"
- "something changed after the deploy yesterday"

## Steps

1. **Identify the service and time window**
   - Confirm the service name and the approximate time the regression started.
   - If not provided, ask the user for the service name and a rough time range.

2. **Fetch the metric to confirm the regression**
   - Use `obs_query_metrics` to pull the relevant metric (p99, p95, error_rate, etc.) for a window covering before and after the reported regression time.
   - Use `render_ui` with a `metric-sparkline` descriptor to visualise the signal.

3. **List recent deployments**
   - Use `github_list_workflow_runs` for the service's repo to find CI runs that completed near the regression window.
   - Use `k8s_list_workloads` to find the current image and replica counts.

4. **Get the commit diff**
   - Use `github_get_diff` between the previous deployed SHA and the current one.
   - Use `render_ui` with a `diff-view` descriptor to show the most significant file changes.

5. **Check correlated infrastructure changes**
   - Use `aws_list_resources` to check if any related cloud resources changed state near the regression time.
   - Use `obs_get_alarms` to find any alarms that fired in the same window.
   - Use `graph_neighbors` to find services that depend on this one (blast radius).

6. **Query operational memory**
   - Use `memory_query` to check if there are prior incidents or lessons about this service and similar symptoms.
   - If matching items found, surface them with `render_ui` using an `evidence-card` descriptor.

7. **Build the hypothesis list**
   - Use `render_ui` with a `hypothesis-list` descriptor, listing candidate causes with status and supporting evidence.

8. **Summarise**
   - Use `render_ui` with a `summary-panel` descriptor containing:
     - Most likely cause
     - Supporting evidence (metric, diff, alarm correlation)
     - Confidence level
     - Recommended next steps (rollback, config change, further investigation)
   - Use `memory_store` to record any new lessons or patterns discovered.

## Notes

- Keep tool calls targeted — fetch only the time window and resources relevant to the investigation.
- If the metric data is inconclusive, say so clearly rather than speculating.
- All actions are read-only. Do not suggest write actions in MVP.
