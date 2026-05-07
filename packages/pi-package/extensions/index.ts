import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { openDb, migrate } from "../src/db/client.js";
import { runFreshnessDecay } from "../src/db/freshness.js";
import { registerBroker } from "../src/extensions/broker/index.js";
import { registerAwsTools } from "../src/extensions/tools/aws.js";
import { registerKubernetesTools } from "../src/extensions/tools/kubernetes.js";
import { registerGithubTools } from "../src/extensions/tools/github.js";
import { registerObservabilityTools } from "../src/extensions/tools/observability.js";
import { registerGraphTools } from "../src/extensions/tools/graph.js";
import { registerMemoryTools } from "../src/extensions/memory/tools.js";
import { registerMemoryInjection } from "../src/extensions/memory/inject.js";
import { registerUiTool } from "../src/extensions/ui/render-ui.js";

export default function (pi: ExtensionAPI) {
  // ── Bootstrap: open DB, run migrations, decay freshness ──────────────────
  pi.on("session_start", async (_event, _ctx) => {
    try {
      const db = openDb();
      migrate(db);
      runFreshnessDecay(db);
    } catch (err) {
      console.error("[infra-harness] DB bootstrap failed:", err);
    }
  });

  // ── Permission broker (gates all tool calls) ─────────────────────────────
  registerBroker(pi);

  // ── Infra tool adapters ───────────────────────────────────────────────────
  registerAwsTools(pi);
  registerKubernetesTools(pi);
  registerGithubTools(pi);
  registerObservabilityTools(pi);

  // ── Context graph tools ───────────────────────────────────────────────────
  registerGraphTools(pi);

  // ── Memory engine ─────────────────────────────────────────────────────────
  registerMemoryTools(pi);
  registerMemoryInjection(pi);

  // ── Agent canvas ──────────────────────────────────────────────────────────
  registerUiTool(pi);

  // ── Auto-ingest: parse tool results and update the context graph ──────────
  pi.on("tool_result", async (event, _ctx) => {
    if (!event.details || event.isError) return;

    try {
      const db = openDb();
      const now = Date.now();

      // AWS EC2 instances → entity ingest
      const details = event.details as any;
      if (event.toolName === "aws_list_resources" && details?.instances) {
        const upsert = db.prepare(`
          INSERT INTO entities (id, type, name, env, provider, external_id, metadata, ingested_at, updated_at, freshness)
          VALUES (?, 'cloud_resource', ?, NULL, 'aws', ?, ?, ?, ?, 1.0)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, external_id=excluded.external_id,
            metadata=excluded.metadata, updated_at=excluded.updated_at, freshness=1.0
        `);
        const ingest = db.transaction(() => {
          for (const inst of details.instances) {
            if (!inst.id) continue;
            upsert.run(
              `aws:ec2:${inst.id}`,
              inst.name ?? inst.id,
              inst.id,
              JSON.stringify({ type: inst.type, state: inst.state, az: inst.az }),
              now, now,
            );
          }
        });
        ingest();
      }

      // Kubernetes workloads → entity ingest
      if (["k8s_list_workloads", "k8s_describe_pod"].includes(event.toolName) && details?.items) {
        const upsert = db.prepare(`
          INSERT INTO entities (id, type, name, env, provider, external_id, metadata, ingested_at, updated_at, freshness)
          VALUES (?, 'service', ?, NULL, 'k8s', ?, ?, ?, ?, 1.0)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, metadata=excluded.metadata,
            updated_at=excluded.updated_at, freshness=1.0
        `);
        const ingest = db.transaction(() => {
          for (const item of details.items) {
            if (!item.name) continue;
            upsert.run(
              `k8s:${item.namespace ?? "default"}:${item.name}`,
              item.name,
              item.name,
              JSON.stringify({ namespace: item.namespace, replicas: item.replicas, ready: item.ready }),
              now, now,
            );
          }
        });
        ingest();
      }

      // GitHub repos → entity ingest
      if (["github_list_commits", "github_list_workflow_runs"].includes(event.toolName) && details?.repo) {
        const repoName = details.repo as string;
        db.prepare(`
          INSERT INTO entities (id, type, name, env, provider, ingested_at, updated_at, freshness, metadata)
          VALUES (?, 'repo', ?, NULL, 'github', ?, ?, 1.0, '{}')
          ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, freshness=1.0
        `).run(`github:${repoName}`, repoName, now, now);
      }
    } catch (err) {
      // Auto-ingest failures are non-fatal.
      console.error("[infra-harness] Auto-ingest error:", err);
    }
  });

  // ── Startup notification ──────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("infra-harness loaded", "info");
  });
}
