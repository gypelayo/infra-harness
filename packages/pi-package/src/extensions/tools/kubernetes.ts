import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as k8s from "@kubernetes/client-node";

function getClient(): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault(); // respects KUBECONFIG env var and ~/.kube/config
  return kc;
}

export function registerKubernetesTools(pi: ExtensionAPI): void {
  // ── k8s_list_workloads ────────────────────────────────────────────────────
  pi.registerTool({
    name: "k8s_list_workloads",
    label: "k8s List Workloads",
    description: "List Kubernetes deployments, replicasets, and daemonsets in a namespace.",
    promptSnippet: "List Kubernetes workloads (deployments, replicasets, daemonsets) in a namespace",
    parameters: Type.Object({
      namespace: Type.String({ description: "Kubernetes namespace (use 'default' if unsure)" }),
      kind:      Type.Optional(Type.Union([
        Type.Literal("deployments"),
        Type.Literal("replicasets"),
        Type.Literal("daemonsets"),
      ], { description: "Workload kind to list (default: deployments)" })),
      context:   Type.Optional(Type.String({ description: "Kubeconfig context to use" })),
    }),

    async execute(_id, params, signal) {
      const kc = getClient();
      if (params.context) kc.setCurrentContext(params.context);
      const appsApi = kc.makeApiClient(k8s.AppsV1Api);
      const kind = params.kind ?? "deployments";
      const ns = params.namespace;

      let items: unknown[];
      if (kind === "deployments") {
        const res = await appsApi.listNamespacedDeployment({ namespace: ns });
        items = (res.items ?? []).map((d) => ({
          name:      d.metadata?.name,
          namespace: d.metadata?.namespace,
          replicas:  d.spec?.replicas,
          ready:     d.status?.readyReplicas ?? 0,
          image:     d.spec?.template.spec?.containers.map((c) => c.image).join(", "),
          created:   d.metadata?.creationTimestamp,
        }));
      } else if (kind === "replicasets") {
        const res = await appsApi.listNamespacedReplicaSet({ namespace: ns });
        items = (res.items ?? []).map((r) => ({
          name:      r.metadata?.name,
          namespace: r.metadata?.namespace,
          replicas:  r.spec?.replicas,
          ready:     r.status?.readyReplicas ?? 0,
          owner:     r.metadata?.ownerReferences?.[0]?.name,
        }));
      } else {
        const res = await appsApi.listNamespacedDaemonSet({ namespace: ns });
        items = (res.items ?? []).map((d) => ({
          name:        d.metadata?.name,
          namespace:   d.metadata?.namespace,
          desired:     d.status?.desiredNumberScheduled,
          ready:       d.status?.numberReady,
        }));
      }

      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
        details: { items, kind, namespace: ns },
      };
    },
  });

  // ── k8s_get_pod_logs ──────────────────────────────────────────────────────
  pi.registerTool({
    name: "k8s_get_pod_logs",
    label: "k8s Get Pod Logs",
    description: "Fetch logs from a Kubernetes pod/container. Returns last N lines.",
    promptSnippet: "Fetch logs from a Kubernetes pod or container",
    parameters: Type.Object({
      namespace:     Type.String(),
      pod:           Type.String({ description: "Pod name" }),
      container:     Type.Optional(Type.String({ description: "Container name (default: first container)" })),
      tail_lines:    Type.Optional(Type.Number({ description: "Number of lines from the end (default 100)" })),
      since_seconds: Type.Optional(Type.Number({ description: "Only return logs newer than N seconds" })),
      context:       Type.Optional(Type.String()),
    }),

    async execute(_id, params, signal) {
      const kc = getClient();
      if (params.context) kc.setCurrentContext(params.context);
      const coreApi = kc.makeApiClient(k8s.CoreV1Api);

      const res = await coreApi.readNamespacedPodLog({
        name:         params.pod,
        namespace:    params.namespace,
        container:    params.container,
        tailLines:    params.tail_lines ?? 100,
        sinceSeconds: params.since_seconds,
      });

      const logs = typeof res === "string" ? res : JSON.stringify(res);
      return {
        content: [{ type: "text", text: logs || "(no logs)" }],
        details: { pod: params.pod, namespace: params.namespace, lines: logs.split("\n").length },
      };
    },
  });

  // ── k8s_describe_pod ──────────────────────────────────────────────────────
  pi.registerTool({
    name: "k8s_describe_pod",
    label: "k8s Describe Pod",
    description: "Describe a Kubernetes pod: status, conditions, events, and container states.",
    promptSnippet: "Describe a Kubernetes pod status, conditions, and recent events",
    parameters: Type.Object({
      namespace: Type.String(),
      pod:       Type.String({ description: "Pod name" }),
      context:   Type.Optional(Type.String()),
    }),

    async execute(_id, params, signal) {
      const kc = getClient();
      if (params.context) kc.setCurrentContext(params.context);
      const coreApi = kc.makeApiClient(k8s.CoreV1Api);

      const podRes = await coreApi.readNamespacedPod({ name: params.pod, namespace: params.namespace });
      const eventsRes = await coreApi.listNamespacedEvent({ namespace: params.namespace,
        fieldSelector: `involvedObject.name=${params.pod}` });

      const pod = podRes;
      const summary = {
        name:       pod.metadata?.name,
        namespace:  pod.metadata?.namespace,
        phase:      pod.status?.phase,
        node:       pod.spec?.nodeName,
        startTime:  pod.status?.startTime,
        conditions: pod.status?.conditions?.map((c) => ({ type: c.type, status: c.status, reason: c.reason })),
        containers: pod.status?.containerStatuses?.map((cs) => ({
          name:         cs.name,
          ready:        cs.ready,
          restartCount: cs.restartCount,
          state:        JSON.stringify(cs.state),
          image:        cs.image,
        })),
        events: eventsRes.items?.slice(-20).map((e) => ({
          type:    e.type,
          reason:  e.reason,
          message: e.message,
          count:   e.count,
          time:    e.lastTimestamp,
        })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        details: summary,
      };
    },
  });
}
