// Stage 2: Condense and format
// MACROS: {{extracted_data}}, {{lorebook_entry_types_with_guidance}}

export const scene_recap_stage2_organize_prompt = `ROLE: Condense extracted content, then format to output structure.

ENTITY TYPE REFERENCE:
{{lorebook_entry_types_with_guidance}}

NOTE: "recap" is NOT a valid sl type - anything marked recap goes in rc field instead.

OUTPUT FORMAT:
{
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [{ "t": "type", "n": "Name", "c": "content", "k": ["keywords"] }]
}

---------------- EXTRACTED DATA ----------------
<EXTRACTED>
{{extracted_data}}
</EXTRACTED>

---------------- STEP 1: CONDENSE ----------------

Merge duplicates only (same meaning, different words):
- PLOT: Merge if describing same event
- GOALS: Merge if same intention for same character
- REVEALS: Merge if same fact
- STATE: Merge if same entity, same condition type
- STANCE: Merge if same pair, same dynamic
- VOICE: Keep distinct quotes even from same speaker
- APPEARANCE: Merge if same entity

Do NOT artificially limit - keep all distinct items.

---------------- STEP 2: FORMAT OUTPUT ----------------

RC (recap content - narrative developments):
- DEV: condensed plot + reveals + dialogue + relationships, semicolon-separated
- PEND: condensed goals
- Format: "DEV: ...\\nPEND: ..."
- ALL world facts, reveals, lore, dialogue, relationships go in DEV (not in sl)

SL (setting_lore entries - ONLY for durable entity data):
- ONLY from: state, appearance, verbatim facets
- NEVER from: plot, goals, reveals, stance, voice (those go in rc)
- t = entity type (character, location, item, faction, lore - NEVER "recap")
- n = specific entity name (e.g., "Rance", "Lisle village")
- c = durable factual content about that entity
- k = keywords for matching: entity name + specific proper nouns only (NOT generic words like "dialogue", "relationship", "bond")

Output JSON only.`;
