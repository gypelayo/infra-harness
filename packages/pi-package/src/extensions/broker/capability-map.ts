/**
 * Maps tool names to the capability string they require.
 * Tools not listed here are blocked by default.
 */
export const TOOL_CAPABILITY_MAP: Record<string, string> = {
  // AWS
  aws_list_resources: "cloud.read.resources",
  aws_get_metrics:    "cloud.read.metrics",
  aws_get_logs:       "cloud.read.logs",

  // Kubernetes
  k8s_list_workloads: "k8s.read.workloads",
  k8s_get_pod_logs:   "k8s.read.logs",
  k8s_describe_pod:   "k8s.read.workloads",

  // GitHub
  github_list_commits:      "repo.read.code",
  github_get_diff:          "repo.read.code",
  github_list_workflow_runs:"repo.read.code",

  // Observability (CloudWatch)
  obs_query_metrics: "cloud.read.metrics",
  obs_get_alarms:    "cloud.read.metrics",

  // Internal (always permitted — no external side effects)
  graph_query:     "_internal",
  graph_ingest:    "_internal",
  graph_neighbors: "_internal",
  memory_store:    "_internal",
  memory_query:    "_internal",
  render_ui:       "_internal",
};

/**
 * Capabilities that require explicit operator approval before executing.
 * (None in MVP read-only scope — reserved for Phase 3 write capabilities.)
 */
export const APPROVAL_REQUIRED: Set<string> = new Set([
  // "deploy.restart.workload",
  // "repo.create.patch",
]);

export type Capability = string;

export function toolToCapability(toolName: string): Capability | null {
  return TOOL_CAPABILITY_MAP[toolName] ?? null;
}

export function requiresApproval(capability: Capability): boolean {
  return APPROVAL_REQUIRED.has(capability);
}
