# Seed Operational Memory

Use this skill to interactively build the initial operational knowledge base for a new environment. This is the human-in-the-loop step that automated discovery cannot replace.

## When to use

Run this once after the seed script has populated the context graph, and again after any major incident or architectural change.

## Procedure

Walk the user through each category below. For each item they provide, use `memory_store` with the appropriate type and confidence. Be concise — one memory item per fact.

---

### 1. Known failure patterns

Ask the user:
> "What are the most common failure modes you've seen in production? For each service, what breaks, under what conditions, and what's the usual fix?"

For each answer, store as `type: "pattern"`, `confidence: "verified"`.

Examples to prompt with if the user is unsure:
- "Does any service degrade when a downstream queue backs up?"
- "Is there a service that becomes unstable after a certain number of pod restarts?"
- "Any services that fail silently without firing an alarm?"

---

### 2. Incident lessons

Ask the user:
> "What are the two or three most painful incidents you've had in the last year? For each one: what was the root cause, what made it hard to diagnose, and what do you now check first when you see similar symptoms?"

For each answer, store as `type: "lesson"`, `confidence: "verified"`, with evidence linking to the incident if a URL or ID is available.

---

### 3. Runbook notes

Ask the user:
> "Are there any procedures that aren't in your official runbooks but that your team relies on? Things like 'always check X before restarting Y' or 'this alarm is noisy and can usually be ignored unless Z is also firing'?"

For each answer, store as `type: "runbook_note"`, `confidence: "verified"`.

---

### 4. Service ownership and quirks

Ask the user:
> "For each of your critical services, who owns it and are there any known quirks? For example: 'the billing service has a memory leak that requires a weekly restart' or 'the search index rebuild takes 40 minutes and blocks writes'."

For each answer, store as `type: "fact"`, `confidence: "verified"`, linked to the relevant service entity.

---

### 5. Environment-specific gotchas

Ask the user:
> "Is there anything specific to your production environment that an engineer would need to know when debugging? For example: 'prod uses a different VPC than staging', 'the prod database has connection pooling disabled', or 'CloudWatch metrics are delayed by 5 minutes in this account'."

For each answer, store as `type: "fact"`, `confidence: "verified"`, with `env: "prod"`.

---

## After each section

- Confirm what was stored with a brief summary.
- Ask: "Anything else in this category before we move on?"
- Use `graph_query` to check if the mentioned services exist in the graph. If not, use `graph_ingest` to add them first, then link the memory item.

## Closing

When all sections are done:
- Use `memory_query` with a broad query to show the user a summary of what was stored.
- Tell them: "Re-run this skill after any major incident or architectural change to keep the knowledge base current."
