// Stage 2: Condense and format
// MACROS: {{extracted_data}}, {{lorebook_entry_types_with_guidance}}

export const scene_recap_stage2_organize_prompt = `ROLE: Condense extracted content, then format to output structure.

ENTITY TYPES (use these as "t" values for sl entries):
{{lorebook_entry_types_with_guidance}}

OUTPUT FORMAT:
{
  "sn": "Scene title",
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

SN: Copy from extracted. Do not rewrite.

RC (recap content - narrative developments):
- DEV: condensed plot + reveals, semicolon-separated
- PEND: condensed goals
- Format: "DEV: ...\\nPEND: ..."
- ALL world facts, reveals, lore go in DEV (not in sl)

SL (setting_lore entries - entity-specific data):
- From state/stance/voice/appearance/verbatim facets
- t = entity type from list above
- n = entity name
- c = content
- k = keyword array for matching (include entity name)
- NEVER put reveals/world facts in sl - those belong in rc.DEV

Output JSON only.`;
