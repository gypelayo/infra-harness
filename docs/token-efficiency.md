# Token Efficiency

Token efficiency is an **architectural property**, not a prompt-tuning afterthought.

## Core Rule

> Anything representable as a widget, state object, or graph edge should not repeatedly consume model tokens.

## Techniques

| Technique | How it helps |
|---|---|
| Store topology, permissions, and history in structured storage | Avoids pasting the same system description into every prompt |
| Normalize tool outputs into schemas | The model consumes concise structured facts rather than raw CLI noise |
| Render graphs, tables, and timelines directly in the UI | The model does not narrate information that is better shown visually |
| Retrieve only the relevant entity neighborhood and memory slice | Only the context needed for the current task enters the prompt |
| Use investigation recipes for common workflows | Pre-structures context collection so the model starts from a compact known state |

## Implication for Architecture

Every layer should be designed with token budget in mind:

- **Context graph** — topology lives in the graph, not in prompts
- **Memory engine** — only matching memory slices are injected; not the full knowledge base
- **Permission broker** — current session capabilities are a structured object, not a paragraph of explanation
- **Visual interface** — UI renders state directly; the model is not asked to regenerate descriptions of things it already emitted

## Anti-patterns to Avoid

- Dumping full kubectl or AWS CLI output into the prompt without normalization
- Re-describing service topology each session because no graph exists
- Storing investigations as plain chat transcripts and replaying them wholesale
- Asking the model to "draw" a dependency map in text form when a visual is available
