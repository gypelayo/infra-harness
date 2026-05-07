# Memory Model

The memory engine separates ephemeral session state from durable organizational knowledge.

## Memory Types

| Memory type | Description | Retention |
|---|---|---|
| **Session memory** | Temporary conversational state and investigation scratchpad | Short-lived |
| **Working memory** | Active investigation context and current hypotheses | Hours to days |
| **Durable operational memory** | Validated facts, lessons, mappings, runbook knowledge, patterns | Long-lived |
| **User preference memory** | Interaction style, verbosity, favored workflows | Long-lived |

## Durable Memory Item Structure

Each durable memory item must include:

- **Entity references** — which services, resources, or components this fact is about
- **Source evidence** — link to the alert, log, commit, or investigation that produced this fact
- **Timestamp** — when the fact was recorded or last validated
- **Confidence level** — `verified` | `inferred` | `disputed`
- **Freshness score** — how likely this fact is still current
- **Author or validator** — who recorded or approved this knowledge
- **Environment scope** — which environment(s) this fact applies to

## Confidence States

| State | Meaning |
|---|---|
| `verified` | Confirmed by a human operator or by repeated consistent evidence |
| `inferred` | Derived by the agent from observed patterns; not yet confirmed |
| `stale` | Was verified, but may no longer be current given elapsed time or system changes |
| `disputed` | Conflicts with other evidence or was explicitly corrected |

## Design Intent

The memory engine should **not** be a bag of transcripts. It must support:

- **Selective retrieval** — only the most relevant memory slice enters model context for a given task
- **Evidence linking** — every durable fact traces back to observable evidence
- **Decay and revalidation** — freshness scores should degrade over time and trigger revalidation prompts

This structure prevents the system from confidently acting on outdated or contradicted knowledge, and keeps token usage low by surfacing only what is relevant.
