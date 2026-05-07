#!/usr/bin/env node
/**
 * infra-harness seed script
 *
 * Crawls AWS, Kubernetes, and GitHub and populates the context graph.
 * Run once to bootstrap; re-run periodically to refresh freshness.
 *
 * Usage:
 *   node --import=tsx/esm scripts/seed.ts [--config ~/.infra-harness/config.json] [--env prod]
 *
 * Prerequisites:
 *   - AWS credentials in env / ~/.aws (standard SDK chain)
 *   - GITHUB_TOKEN env var
 *   - kubeconfig at ~/.kube/config or KUBECONFIG env var
 *   - pnpm install run from repo root
 */

import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const Database = require("../packages/pi-package/node_modules/better-sqlite3");
const sqliteVec = require("../packages/pi-package/node_modules/sqlite-vec");

// ── Config ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const configPath =
  args[args.indexOf("--config") + 1] ??
  process.env.INFRA_HARNESS_CONFIG ??
  join(homedir(), ".infra-harness", "config.json");

const envOverride = args[args.indexOf("--env") + 1] ?? null;

if (!existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  console.error(`Copy scripts/config.example.json to ${configPath} and edit it.`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf-8"));
const ENV = envOverride ?? config.env ?? "prod";

// ── DB ────────────────────────────────────────────────────────────────────────

const dbPath = process.env.INFRA_HARNESS_DB ?? join(homedir(), ".infra-harness", "kb.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
try { sqliteVec.load(db); } catch { /* optional */ }

// Apply schema
const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "../packages/pi-package/src/db/schema.sql");
db.exec(readFileSync(schemaPath, "utf-8"));
try {
  db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(embedding FLOAT[1536])");
  db.exec(`CREATE TABLE IF NOT EXISTS memory_vector_map (
    vec_rowid INTEGER PRIMARY KEY,
    memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE
  )`);
} catch { /* sqlite-vec not available */ }

// ── Helpers ───────────────────────────────────────────────────────────────────

const upsertEntity = db.prepare(`
  INSERT INTO entities (id, type, name, env, provider, external_id, metadata, ingested_at, updated_at, freshness)
  VALUES (@id, @type, @name, @env, @provider, @external_id, @metadata, @now, @now, 1.0)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, env=excluded.env, provider=excluded.provider,
    external_id=excluded.external_id, metadata=excluded.metadata,
    updated_at=excluded.updated_at, freshness=1.0
`);

const upsertEdge = db.prepare(`
  INSERT INTO edges (id, from_id, to_id, relation, metadata, ingested_at, updated_at, freshness)
  VALUES (@id, @from_id, @to_id, @relation, @metadata, @now, @now, 1.0)
  ON CONFLICT(id) DO UPDATE SET
    metadata=excluded.metadata, updated_at=excluded.updated_at, freshness=1.0
`);

const findEntity = db.prepare("SELECT id FROM entities WHERE name = ? LIMIT 1");

const now = Date.now();

function entityId(provider: string, kind: string, name: string) {
  return `${provider}:${kind}:${name}`;
}

function ingest(entity: {
  id: string; type: string; name: string; env?: string;
  provider?: string; external_id?: string; metadata?: object;
}) {
  upsertEntity.run({
    id: entity.id, type: entity.type, name: entity.name,
    env: entity.env ?? ENV, provider: entity.provider ?? null,
    external_id: entity.external_id ?? null,
    metadata: JSON.stringify(entity.metadata ?? {}), now,
  });
}

function edge(fromId: string, toId: string, relation: string, metadata: object = {}) {
  const id = `edge:${fromId}:${relation}:${toId}`;
  upsertEdge.run({ id, from_id: fromId, to_id: toId, relation, metadata: JSON.stringify(metadata), now });
}

function log(msg: string) { process.stdout.write(`  ${msg}\n`); }
function section(title: string) { console.log(`\n▶ ${title}`); }

// ── AWS ───────────────────────────────────────────────────────────────────────

async function seedAws() {
  section("AWS");

  const { EC2Client, DescribeInstancesCommand } = await import("@aws-sdk/client-ec2");
  const { RDSClient, DescribeDBClustersCommand, DescribeDBInstancesCommand } = await import("@aws-sdk/client-rds");
  const { SQSClient, ListQueuesCommand, GetQueueAttributesCommand } = await import("@aws-sdk/client-sqs");
  const { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTargetGroupsCommand } = await import("@aws-sdk/client-elastic-load-balancing-v2");
  const { ECSClient, ListClustersCommand, ListServicesCommand, DescribeServicesCommand } = await import("@aws-sdk/client-ecs");
  const { LambdaClient, ListFunctionsCommand } = await import("@aws-sdk/client-lambda");
  const { CloudWatchClient, DescribeAlarmsCommand } = await import("@aws-sdk/client-cloudwatch");

  for (const region of (config.aws?.regions ?? ["us-east-1"])) {
    log(`region: ${region}`);
    const opts = { region };

    const resourceTypes: string[] = config.aws?.resource_types ?? [];

    // ── EC2 instances ──────────────────────────────────────────────────────
    if (resourceTypes.includes("ec2_instances")) {
      try {
        const ec2 = new EC2Client(opts);
        const res = await ec2.send(new DescribeInstancesCommand({ MaxResults: 200 }));
        const instances = res.Reservations?.flatMap(r => r.Instances ?? []) ?? [];
        const txn = db.transaction(() => {
          for (const i of instances) {
            if (!i.InstanceId) continue;
            const name = i.Tags?.find(t => t.Key === "Name")?.Value ?? i.InstanceId;
            const id = entityId("aws", "ec2", i.InstanceId);
            ingest({ id, type: "cloud_resource", name, provider: "aws", external_id: i.InstanceId,
              metadata: { instance_type: i.InstanceType, state: i.State?.Name, az: i.Placement?.AvailabilityZone, region } });
          }
        });
        txn();
        log(`EC2: ${instances.length} instances`);
      } catch (e: any) { log(`EC2 skipped: ${e.message}`); }
    }

    // ── RDS ────────────────────────────────────────────────────────────────
    if (resourceTypes.includes("rds_clusters")) {
      try {
        const rds = new RDSClient(opts);
        const clusters = (await rds.send(new DescribeDBClustersCommand({}))).DBClusters ?? [];
        const instances = (await rds.send(new DescribeDBInstancesCommand({}))).DBInstances ?? [];
        const txn = db.transaction(() => {
          for (const c of clusters) {
            if (!c.DBClusterIdentifier) continue;
            const id = entityId("aws", "rds-cluster", c.DBClusterIdentifier);
            ingest({ id, type: "cloud_resource", name: c.DBClusterIdentifier, provider: "aws",
              external_id: c.DBClusterIdentifier,
              metadata: { engine: c.Engine, engine_version: c.EngineVersion, status: c.Status, region } });
          }
          for (const i of instances.filter(i => !i.DBClusterIdentifier)) {
            if (!i.DBInstanceIdentifier) continue;
            const id = entityId("aws", "rds", i.DBInstanceIdentifier);
            ingest({ id, type: "cloud_resource", name: i.DBInstanceIdentifier, provider: "aws",
              external_id: i.DBInstanceIdentifier,
              metadata: { engine: i.Engine, instance_class: i.DBInstanceClass, status: i.DBInstanceStatus, region } });
          }
        });
        txn();
        log(`RDS: ${clusters.length} clusters, ${instances.length} instances`);
      } catch (e: any) { log(`RDS skipped: ${e.message}`); }
    }

    // ── SQS queues ─────────────────────────────────────────────────────────
    if (resourceTypes.includes("sqs_queues")) {
      try {
        const sqs = new SQSClient(opts);
        const urls = (await sqs.send(new ListQueuesCommand({ MaxResults: 200 }))).QueueUrls ?? [];
        const txn = db.transaction(() => {
          for (const url of urls) {
            const name = url.split("/").at(-1) ?? url;
            const id = entityId("aws", "sqs", name);
            ingest({ id, type: "cloud_resource", name, provider: "aws", external_id: url,
              metadata: { url, region } });
          }
        });
        txn();
        log(`SQS: ${urls.length} queues`);
      } catch (e: any) { log(`SQS skipped: ${e.message}`); }
    }

    // ── ALBs ───────────────────────────────────────────────────────────────
    if (resourceTypes.includes("albs")) {
      try {
        const elb = new ElasticLoadBalancingV2Client(opts);
        const lbs = (await elb.send(new DescribeLoadBalancersCommand({}))).LoadBalancers ?? [];
        const txn = db.transaction(() => {
          for (const lb of lbs) {
            if (!lb.LoadBalancerName) continue;
            const id = entityId("aws", "alb", lb.LoadBalancerName);
            ingest({ id, type: "cloud_resource", name: lb.LoadBalancerName, provider: "aws",
              external_id: lb.LoadBalancerArn,
              metadata: { dns: lb.DNSName, scheme: lb.Scheme, state: lb.State?.Code, region } });
          }
        });
        txn();
        log(`ALB: ${lbs.length} load balancers`);
      } catch (e: any) { log(`ALB skipped: ${e.message}`); }
    }

    // ── ECS services ───────────────────────────────────────────────────────
    if (resourceTypes.includes("ecs_services")) {
      try {
        const ecs = new ECSClient(opts);
        const clusterArns = (await ecs.send(new ListClustersCommand({}))).clusterArns ?? [];
        let svcCount = 0;
        for (const clusterArn of clusterArns) {
          const clusterName = clusterArn.split("/").at(-1)!;
          const clusterId = entityId("aws", "ecs-cluster", clusterName);
          ingest({ id: clusterId, type: "cluster", name: clusterName, provider: "aws",
            external_id: clusterArn, metadata: { region } });

          const svcArns = (await ecs.send(new ListServicesCommand({ cluster: clusterArn, maxResults: 100 }))).serviceArns ?? [];
          if (!svcArns.length) continue;
          const described = (await ecs.send(new DescribeServicesCommand({ cluster: clusterArn, services: svcArns }))).services ?? [];
          const txn = db.transaction(() => {
            for (const svc of described) {
              if (!svc.serviceName) continue;
              const svcId = entityId("aws", "ecs-service", svc.serviceName);
              ingest({ id: svcId, type: "service", name: svc.serviceName, provider: "aws",
                external_id: svc.serviceArn,
                metadata: { task_definition: svc.taskDefinition, desired: svc.desiredCount, running: svc.runningCount, region } });
              edge(svcId, clusterId, "runs_in");
              svcCount++;
            }
          });
          txn();
        }
        log(`ECS: ${clusterArns.length} clusters, ${svcCount} services`);
      } catch (e: any) { log(`ECS skipped: ${e.message}`); }
    }

    // ── Lambda ─────────────────────────────────────────────────────────────
    if (resourceTypes.includes("lambda_functions")) {
      try {
        const lambda = new LambdaClient(opts);
        const fns = (await lambda.send(new ListFunctionsCommand({ MaxItems: 200 }))).Functions ?? [];
        const txn = db.transaction(() => {
          for (const fn of fns) {
            if (!fn.FunctionName) continue;
            const id = entityId("aws", "lambda", fn.FunctionName);
            ingest({ id, type: "service", name: fn.FunctionName, provider: "aws",
              external_id: fn.FunctionArn,
              metadata: { runtime: fn.Runtime, memory: fn.MemorySize, timeout: fn.Timeout, region } });
          }
        });
        txn();
        log(`Lambda: ${fns.length} functions`);
      } catch (e: any) { log(`Lambda skipped: ${e.message}`); }
    }

    // ── CloudWatch alarms ──────────────────────────────────────────────────
    try {
      const cw = new CloudWatchClient(opts);
      const alarms = (await cw.send(new DescribeAlarmsCommand({ MaxRecords: 100 }))).MetricAlarms ?? [];
      const txn = db.transaction(() => {
        for (const a of alarms) {
          if (!a.AlarmName) continue;
          const id = entityId("aws", "alarm", a.AlarmName);
          ingest({ id, type: "alert", name: a.AlarmName, provider: "aws",
            external_id: a.AlarmArn,
            metadata: { state: a.StateValue, metric: a.MetricName, namespace: a.Namespace,
              threshold: a.Threshold, region } });
        }
      });
      txn();
      log(`CloudWatch alarms: ${alarms.length}`);
    } catch (e: any) { log(`CloudWatch alarms skipped: ${e.message}`); }
  }
}

// ── Kubernetes ────────────────────────────────────────────────────────────────

async function seedKubernetes() {
  section("Kubernetes");

  const k8s = await import("@kubernetes/client-node");
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  const contexts: string[] = config.kubernetes?.contexts ?? [kc.getCurrentContext()];
  const namespacesConfig: string[] = config.kubernetes?.namespaces ?? ["default"];

  for (const ctx of contexts) {
    log(`context: ${ctx}`);
    try {
      kc.setCurrentContext(ctx);
      const appsApi = kc.makeApiClient(k8s.AppsV1Api);
      const coreApi = kc.makeApiClient(k8s.CoreV1Api);

      // Ingest the cluster itself
      const clusterId = entityId("k8s", "cluster", ctx);
      ingest({ id: clusterId, type: "cluster", name: ctx, provider: "k8s" });

      for (const ns of namespacesConfig) {
        // Namespace entity
        const nsId = entityId("k8s", "namespace", `${ctx}/${ns}`);
        ingest({ id: nsId, type: "namespace", name: ns, provider: "k8s",
          metadata: { cluster: ctx } });
        edge(nsId, clusterId, "runs_in");

        // Deployments → services
        try {
          const deps = (await appsApi.listNamespacedDeployment({ namespace: ns })).items ?? [];
          const txn = db.transaction(() => {
            for (const d of deps) {
              const name = d.metadata?.name;
              if (!name) continue;
              const id = entityId("k8s", "deployment", `${ctx}/${ns}/${name}`);
              const labelKey = config.relationship_hints?.service_label_keys?.[0] ?? "app";
              const appLabel = d.spec?.selector?.matchLabels?.[labelKey] ?? name;
              ingest({ id, type: "service", name, provider: "k8s",
                external_id: `${ctx}/${ns}/${name}`,
                metadata: {
                  cluster: ctx, namespace: ns,
                  replicas: d.spec?.replicas, ready: d.status?.readyReplicas,
                  image: d.spec?.template.spec?.containers.map(c => c.image).join(","),
                  app_label: appLabel,
                } });
              edge(id, nsId, "runs_in");
            }
          });
          txn();
          log(`  ${ns}: ${deps.length} deployments`);
        } catch (e: any) { log(`  ${ns} deployments skipped: ${e.message}`); }

        // k8s Services (for ALB linkage later)
        try {
          const svcs = (await coreApi.listNamespacedService({ namespace: ns })).items ?? [];
          const txn = db.transaction(() => {
            for (const s of svcs) {
              const name = s.metadata?.name;
              if (!name || name === "kubernetes") continue;
              // Link k8s service -> deployment with same app label
              const selector = s.spec?.selector?.["app"] ?? s.spec?.selector?.["app.kubernetes.io/name"];
              if (selector) {
                const deployId = entityId("k8s", "deployment", `${ctx}/${ns}/${selector}`);
                const existing = db.prepare("SELECT id FROM entities WHERE id = ?").get(deployId);
                if (existing) {
                  edge(deployId, entityId("k8s", "deployment", `${ctx}/${ns}/${selector}`), "associated_with",
                    { service_name: name });
                }
              }
            }
          });
          txn();
        } catch { /* optional */ }
      }
    } catch (e: any) { log(`context ${ctx} skipped: ${e.message}`); }
  }
}

// ── GitHub ────────────────────────────────────────────────────────────────────

async function seedGithub() {
  section("GitHub");

  const token = process.env.GITHUB_TOKEN;
  if (!token) { log("GITHUB_TOKEN not set — skipping"); return; }

  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: token });

  const org: string = config.github?.org;
  if (!org) { log("github.org not configured — skipping"); return; }

  try {
    const repos = await octokit.paginate(octokit.repos.listForOrg, {
      org, per_page: 100, type: "all",
    });
    const limit = config.github?.max_repos ?? 100;
    const filtered = repos.slice(0, limit);

    const txn = db.transaction(() => {
      for (const repo of filtered) {
        const id = entityId("github", "repo", repo.full_name);
        ingest({ id, type: "repo", name: repo.name, provider: "github",
          external_id: repo.full_name,
          metadata: { full_name: repo.full_name, default_branch: repo.default_branch,
            language: repo.language, archived: repo.archived } });

        // Infer service linkage by name pattern
        const pattern = config.relationship_hints?.repo_to_service_pattern;
        if (pattern) {
          const match = repo.name.match(new RegExp(pattern));
          if (match) {
            const serviceName = match[1];
            const serviceEntity = findEntity.get(serviceName) as { id: string } | undefined;
            if (serviceEntity) {
              edge(serviceEntity.id, id, "deployed_from");
            }
          }
        }

        // Also try exact name match (repo name == deployment name)
        const exactMatch = findEntity.get(repo.name) as { id: string } | undefined;
        if (exactMatch) {
          edge(exactMatch.id, id, "deployed_from");
        }
      }
    });
    txn();
    log(`${filtered.length} repos ingested`);

    // Teams
    try {
      const teams = await octokit.paginate(octokit.teams.list, { org, per_page: 100 });
      const teamTxn = db.transaction(() => {
        for (const team of teams) {
          const id = entityId("github", "team", `${org}/${team.slug}`);
          ingest({ id, type: "team", name: team.name, provider: "github",
            external_id: String(team.id), metadata: { slug: team.slug, org } });
        }
      });
      teamTxn();
      log(`${teams.length} teams ingested`);
    } catch { /* teams may not be accessible */ }

  } catch (e: any) { log(`GitHub skipped: ${e.message}`); }
}

// ── Relationship inference pass ───────────────────────────────────────────────

async function inferRelationships() {
  section("Relationship inference");

  // Match k8s deployments to GitHub repos by name
  const deployments = db.prepare(
    "SELECT id, name FROM entities WHERE type = 'service' AND provider = 'k8s'"
  ).all() as Array<{ id: string; name: string }>;

  const repos = db.prepare(
    "SELECT id, name FROM entities WHERE type = 'repo' AND provider = 'github'"
  ).all() as Array<{ id: string; name: string }>;

  const repoByName = new Map(repos.map(r => [r.name.toLowerCase(), r.id]));
  let linked = 0;

  const txn = db.transaction(() => {
    for (const dep of deployments) {
      // Exact match
      const repoId = repoByName.get(dep.name.toLowerCase())
        ?? repoByName.get(`${dep.name.toLowerCase()}-service`)
        ?? repoByName.get(dep.name.toLowerCase().replace(/-service$/, ""));
      if (repoId) {
        const edgeId = `edge:${dep.id}:deployed_from:${repoId}`;
        const existing = db.prepare("SELECT id FROM edges WHERE id = ?").get(edgeId);
        if (!existing) {
          edge(dep.id, repoId, "deployed_from", { inferred: true });
          linked++;
        }
      }
    }

    // Match CloudWatch alarms to services by name prefix
    const alarms = db.prepare(
      "SELECT id, name FROM entities WHERE type = 'alert' AND provider = 'aws'"
    ).all() as Array<{ id: string; name: string }>;

    const services = db.prepare(
      "SELECT id, name FROM entities WHERE type = 'service'"
    ).all() as Array<{ id: string; name: string }>;

    for (const alarm of alarms) {
      for (const svc of services) {
        if (alarm.name.toLowerCase().includes(svc.name.toLowerCase())) {
          const edgeId = `edge:${alarm.id}:associated_with:${svc.id}`;
          const existing = db.prepare("SELECT id FROM edges WHERE id = ?").get(edgeId);
          if (!existing) {
            edge(alarm.id, svc.id, "associated_with", { inferred: true });
          }
        }
      }
    }
  });
  txn();

  log(`Linked ${linked} deployments to GitHub repos`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary() {
  section("Summary");

  const counts = db.prepare(`
    SELECT type, provider, COUNT(*) as n
    FROM entities
    GROUP BY type, provider
    ORDER BY n DESC
  `).all() as Array<{ type: string; provider: string; n: number }>;

  const edgeCount = (db.prepare("SELECT COUNT(*) as n FROM edges").get() as any).n;

  console.log("\n  Entities:");
  for (const row of counts) {
    console.log(`    ${String(row.n).padStart(4)}  ${row.type} (${row.provider ?? "–"})`);
  }
  console.log(`\n  Edges: ${edgeCount}`);
  console.log(`\n  DB: ${dbPath}`);
  console.log(`\n  Next steps:`);
  console.log(`    1. Open the desktop UI — Topology screen should now show your infrastructure`);
  console.log(`    2. Run pi and use /skill:seed-memory to add operational knowledge`);
  console.log(`    3. Start an investigation: pi -e packages/pi-package/extensions/index.ts`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\ninfra-harness seed`);
console.log(`  config: ${configPath}`);
console.log(`  db:     ${dbPath}`);
console.log(`  env:    ${ENV}`);

try {
  await seedAws();
} catch (e: any) { console.error("AWS seed error:", e.message); }

try {
  await seedKubernetes();
} catch (e: any) { console.error("k8s seed error:", e.message); }

try {
  await seedGithub();
} catch (e: any) { console.error("GitHub seed error:", e.message); }

try {
  await inferRelationships();
} catch (e: any) { console.error("Relationship inference error:", e.message); }

printSummary();
