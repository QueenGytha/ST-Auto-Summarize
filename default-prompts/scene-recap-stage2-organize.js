// Stage 2: Hard filter + organize into rc/sl structure
// MACROS: {{extracted_data}}, {{lorebook_entry_types_with_guidance}}

export const scene_recap_stage2_organize_prompt = `ROLE: Editorial curator. Ruthlessly filter extracted content—most won't survive.

TASK: Filter Stage 1 output and organize into rc (recap) + sl (entity entries).

============ HARD FILTERING (DO THIS FIRST) ============

EXTRACTED over-extracts. Your job is aggressive filtering.

For EACH item, ask: "Does this REALLY earn its tokens?"
- If uncertain, DROP. Default is exclude, not include.

INTERNAL DEDUPLICATION (by priority):
- Arc: Only landmark moments survive. Temporary moods → DROP
- Stance: Multiple entries for same entity→target → consolidate into one
- Voice: Multiple quotes showing same speech pattern → keep best one only
- State: Redundant conditions → keep most current/relevant only

QUALITY GATE:
- Generic labels ("grew closer", "became stronger") → DROP, need specifics
- Plot-functional dialogue ("Let's go to the market") → DROP
- Temporary states that won't persist → DROP
- Anything that fails SIGNIFICANT/PERSISTENT/SPECIFIC → DROP

==========================================================================

OUTPUT FORMAT:
{
  "rc": "DEV: ...\\nPEND: ...\\nKNOWS: ...",
  "sl": [{ "t": "type", "n": "Name", "c": "bulleted content", "k": ["keywords"] }]
}

ENTITY TYPES:
{{lorebook_entry_types_with_guidance}}

---------------- RC (RECAP) ----------------

Format: TELEGRAPHIC. Fragments; semicolons; no articles.

- DEV: outcomes[] only. High-level results.
- PEND: threads[] as unresolved plot hooks.
- KNOWS: knows[] as "secret (who knows)" - drop if everyone knows

Omit empty sections.

---------------- SL (ENTITY ENTRIES) ----------------

Group all facets for same entity into ONE entry with LABELED BULLETS.
ALL entity types use this format (characters, locations, items, lore, etc.)

PRIORITY ORDER (cut lower priority first when filtering):
- Arc: development journey (from → to) — PROTECT
- Stance: [target] — shared history, dynamic, commitments — HIGH VALUE
- Voice: 'representative quote' — MEDIUM
- State: current conditions, belongings, status — LOWER
- Identity: background, role, position, appearance — CUT FIRST

For non-character entities (locations, items, lore):
- Use State for current conditions
- Use Identity for baseline facts/description

Rules:
- t = entity type from input
- n = entity name exactly as appears
- k = [name, aliases]
- c = bulleted content with labels (• State: ... • Identity: ...)
- Each bullet on new line
- OMIT empty bullets

ROUTING:
- arc[], stance[], voice[], state[], identity[] → entity's sl entry
- verbatim[] → relevant entity or lore entry

---------------- EXTRACTED DATA ----------------
<EXTRACTED>
{{extracted_data}}
</EXTRACTED>

Output JSON only.`;
