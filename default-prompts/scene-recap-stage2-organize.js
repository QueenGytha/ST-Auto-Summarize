// Stage 2: Condense and format
// MACROS: {{extracted_data}}, {{lorebook_entry_types_with_guidance}}

export const scene_recap_stage2_organize_prompt = `ROLE: Transform extracted facets into compact structured output.

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

RC (compact recap - FRAGMENTS, NOT PROSE):
- STYLE: Fragments; semicolons; no articles/filler words
- DEV: Outcomes and state changes only. No steps/process toward outcomes.
- PEND: Active goals as "Actor: goal"
- NO PROSE. NO "The". NO flowing narrative. TELEGRAPHIC.
Example: "DEV: Village destroyed; villagers kidnapped; Rance (40, headman) caused destruction via awakened Mage-Gift; Senta Chose Rance\\nPEND: Rance: reach Haven with evidence; Senta: stabilize Rance's Gift"

SL (entity entries - ONE per entity):
- Group ALL facets for same entity into ONE entry
- t = entity type from list above (NEVER "recap")
- n = entity name exactly as appears
- c = COMPACT combined content: state + appearance + stance + key voice quotes
- k = [entity name, aliases, key identifiers]

Output JSON only.`;
