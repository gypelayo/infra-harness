# Seeding the Knowledge Base

The knowledge base has two layers that need seeding before investigations become useful. They are seeded differently.

---

## Layer 1 — Context graph (automated)

The context graph stores what exists in your infrastructure: services, repos, clusters, cloud resources, alarms, teams, and the relationships between them.

This is seeded by a script that crawls your AWS, Kubernetes, and GitHub accounts directly.

### 1. Create your config

```bash
mkdir -p ~/.infra-harness
cp scripts/config.example.json ~/.infra-harness/config.json
```

Edit `~/.infra-harness/config.json`:

```json
{
  "aws": {
    "regions": ["us-east-1"],
    "role_arn": null,
    "resource_types": ["ec2_instances", "rds_clusters", "sqs_queues", "albs", "ecs_services", "lambda_functions"]
  },
  "kubernetes": {
    "contexts": ["prod-cluster"],
    "namespaces": ["production", "default"]
  },
  "github": {
    "org": "your-org",
    "max_repos": 100
  },
  "observability": {
    "provider": "cloudwatch"
  },
  "relationship_hints": {
    "repo_to_service_pattern": "^(.*)-service$",
    "service_label_keys": ["app", "app.kubernetes.io/name"]
  },
  "env": "prod"
}
```

### 2. Set credentials

```bash
# AWS — standard SDK credential chain (env vars, ~/.aws/credentials, instance role)
export AWS_DEFAULT_REGION=us-east-1
export AWS_PROFILE=my-profile   # or use role assumption via role_arn in config

# GitHub
export GITHUB_TOKEN=ghp_...

# Kubernetes — uses KUBECONFIG or ~/.kube/config automatically
```

### 3. Run the seed script

```bash
cd /path/to/infra-harness
pnpm install
node --import=tsx/esm scripts/seed.ts
```

Or with explicit paths:

```bash
node --import=tsx/esm scripts/seed.ts \
  --config ~/.infra-harness/config.json \
  --env prod
```

The script will print a summary of what was discovered:

```
infra-harness seed
  config: ~/.infra-harness/config.json
  db:     ~/.infra-harness/kb.sqlite
  env:    prod

▶ AWS
  region: us-east-1
  EC2: 12 instances
  RDS: 3 clusters
  SQS: 8 queues
  ECS: 2 clusters, 14 services
  CloudWatch alarms: 31

▶ Kubernetes
  context: prod-cluster
  production: 18 deployments
  default: 3 deployments

▶ GitHub
  47 repos ingested
  6 teams ingested

▶ Relationship inference
  Linked 14 deployments to GitHub repos

▶ Summary
     18  service (k8s)
     14  cloud_resource (aws)
      8  cloud_resource (aws) [sqs]
     ...
  Edges: 67
```

### 4. Re-run to refresh

Run the seed script again whenever your infrastructure changes significantly, or on a cron to keep freshness scores high:

```bash
# Weekly refresh (add to crontab)
0 6 * * 1 node --import=tsx/esm /path/to/scripts/seed.ts
```

---

## Layer 2 — Operational memory (interactive)

The memory engine stores validated operational knowledge that only humans can provide: known failure patterns, incident lessons, runbook notes, and environment quirks. Automated discovery cannot produce this.

### Run the seed-memory skill

```bash
# Start pi with the infra-harness package loaded
pi -e packages/pi-package/extensions/index.ts

# In pi, invoke the seed-memory skill
/skill:seed-memory
```

The skill walks you through five categories:

1. **Known failure patterns** — "what breaks, under what conditions, and what's the fix"
2. **Incident lessons** — "root cause, why it was hard to diagnose, what to check first next time"
3. **Runbook notes** — undocumented procedures your team relies on
4. **Service quirks** — ownership and known gotchas per service
5. **Environment gotchas** — prod-specific facts an engineer needs to know

Each answer is stored as a `memory_item` with confidence=`verified`, linked to the relevant service entities in the graph.

**Budget about 30–60 minutes for a team of 3–5 engineers.** The most valuable sessions involve the engineers who have been on-call the longest.

### Re-seed after incidents

After any significant incident, run `/skill:seed-memory` focused on what was learned:

```
> what did we learn from the checkout outage last week?
  [agent prompts for details and stores the lesson]
```

Or directly:

```
/remember
```

---

## Verification

After seeding, open the desktop UI:

```bash
cd packages/desktop
INFRA_HARNESS_DB=~/.infra-harness/kb.sqlite pnpm tauri dev
```

- **Topology screen** should show your services, repos, clusters, and their relationships
- **Knowledge screen** should show the memory items from the `/skill:seed-memory` session
- **Permissions screen** shows the default read-only capability set

Then run a test investigation in pi:

```bash
pi -e packages/pi-package/extensions/index.ts
> graph_neighbors checkout --hops 2
> memory_query "latency"
```

---

## What auto-populates over time

You do not need to re-run the seed script after every investigation. The pi extension **auto-ingests** new entities as tools are called:

- Running `k8s_list_workloads` → deployments added to graph
- Running `github_list_commits` → repo entity refreshed
- Running `aws_list_resources` → EC2/RDS/SQS entities added

Freshness scores also update automatically on each tool call. The seed script is for **initial bulk discovery** and **periodic full refreshes** — not for day-to-day use.
