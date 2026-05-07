# Known Pattern Recall

Use this skill to surface prior incidents, lessons, and validated patterns from operational memory that match the current situation.

## When to use

- "Have we seen this before?"
- "Is there a known pattern for X failing when Y happens?"
- "What did we learn from the last checkout incident?"

## Steps

1. **Understand the current situation**
   - Identify the service, symptom, and environment from the conversation context.

2. **Query by symptom description**
   - Use `memory_query` with the symptom description as the query string.
   - Use mode: "hybrid" to get both keyword and semantic matches.

3. **Query by service name**
   - Use `memory_query` filtering by the service name (use entity_names or include in query).

4. **Query by pattern type**
   - Use `memory_query` with type: "pattern" to find recurring failure patterns.

5. **Surface results**
   - For each high-confidence match, use `render_ui` with an `evidence-card` descriptor:
     - claim: the lesson or pattern
     - confidence: from the memory item
     - reference: the session/investigation that produced it
     - summary: relevance to the current situation

6. **Synthesise**
   - Use `render_ui` with a `summary-panel` describing:
     - Which patterns match the current situation
     - What worked in the past
     - What to watch out for
     - Gaps (no prior pattern found = note this explicitly)

7. **Update memory if new findings emerge**
   - If this investigation surfaces a new pattern, use `memory_store` to record it with confidence: "inferred".

## Notes

- Be explicit about confidence. An inferred match is not the same as a verified one.
- If no relevant memory found, say so clearly — do not hallucinate patterns.
- Low freshness items should be flagged as potentially outdated.
