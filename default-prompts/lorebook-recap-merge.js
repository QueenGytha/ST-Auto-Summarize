// MACROS: {{existing_content}}, {{new_content}}, {{entry_name}}, {{user}}

export const auto_lorebook_recap_merge_prompt = `TASK: Merge new content items into existing entry. Output should be TIGHTER, not longer.

================================================================================
INPUT
================================================================================

ENTRY NAME: {{entry_name}}
USER CHARACTER: {{user}}

EXISTING CONTENT:
<EXISTING>
{{existing_content}}
</EXISTING>

NEW CONTENT:
<NEW>
{{new_content}}
</NEW>

================================================================================
MERGE RULES
================================================================================

SUPERSEDE (newer replaces older):
- State changed → keep only current
- Contradiction → keep only new
- Resolved → delete entirely

CONSOLIDATE (tighten, don't accumulate):
- Same dynamic multiple ways → ONE best phrasing
- Redundant sentiments → pick the most specific
- Development history → just current state + essential context

KEEP (durable substance):
- Permanent changes (injury, title, transformation)
- Relationship dynamics that affect interactions
- Behavioral patterns (how to write them)
- Callbacks (exact words from pivotal moments, with context)
- Tensions (internal contradictions that create depth)

DROP:
- Transient conditions (tired, mood, temporary discomfort)
- Volatile state (current location, in-progress tasks) → belongs in recap
- Same meaning in different words → keep best one
- Other characters' info → belongs in THEIR entry

================================================================================
USER CHARACTER ({{user}})
================================================================================

If {{entry_name}} is {{user}}, apply MAXIMUM filtering:
- KEEP ONLY: stable physical state, titles, explicit commitments
- DROP: relationships, development, personality, internal state
- User plays their own character - minimal lorebook needed
- If result is mostly relationship content → output minimal or empty

================================================================================
OUTPUT FORMAT
================================================================================

{
  "content": [
    "discrete item 1",
    "discrete item 2"
  ],
  "canonicalName": "ProperName or null if no rename"
}

Content is array of discrete items (matches entity structure).
Output should have FEWER items than inputs combined.

Output JSON only.`;
