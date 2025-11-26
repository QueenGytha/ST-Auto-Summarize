// Stage 2: Condense and format
// MACROS: {{extracted_data}}, {{lorebook_entry_types_with_guidance}}

export const scene_recap_stage2_organize_prompt = `ROLE: Transform extracted facets into structured output.

ENTITY TYPES FOR SL ENTRIES:
{{lorebook_entry_types_with_guidance}}

OUTPUT FORMAT:
{
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [{ "t": "type", "n": "EntityName", "c": "combined content", "k": ["keywords"] }]
}

---------------- EXTRACTED DATA ----------------
<EXTRACTED>
{{extracted_data}}
</EXTRACTED>

---------------- TRANSFORMATION RULES ----------------

RC (narrative recap):
- DEV: Combine plot + reveals into flowing narrative
- PEND: List active goals as "Character: goal"
- Include dialogue context, relationship dynamics, emotional beats
- This is narrative summary, not structured data

SL (entity entries - ONE per entity, combining all facets):
- Group ALL information about each entity into ONE entry
- t = entity type from list above (character, location, item, etc. - NEVER "recap")
- n = entity name exactly as it appears
- c = COMBINE all facets for that entity: state + appearance + stance + voice quotes
- k = [entity name, plus any aliases or key identifiers]

KEY: One sl entry per entity. Combine state, appearance, stance, voice for same entity into single entry.

Output JSON only.`;
