// Stage 2: Condense and format
// MACROS: {{extracted_data}}, {{lorebook_entry_types_with_guidance}}
// INPUT: Stage 1 structured facets with entity types pre-assigned

export const scene_recap_stage2_organize_prompt = `ROLE: Merge extracted facets by entity into compact output.

VALID ENTITY TYPES:
{{lorebook_entry_types_with_guidance}}

OUTPUT FORMAT:
{
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [{ "t": "type", "n": "EntityName", "c": "combined content", "k": ["keywords"] }]
}

---------------- EXTRACTED DATA (with entity types pre-assigned) ----------------
<EXTRACTED>
{{extracted_data}}
</EXTRACTED>

---------------- TRANSFORMATION RULES ----------------

RC (compact recap - FRAGMENTS, NOT PROSE):
- DEV: plot[] + reveals[] condensed. Outcomes only, no process.
- PEND: goals[] as "Actor: goal"
- STYLE: Fragments; semicolons; no articles. TELEGRAPHIC.
Example: "DEV: Village destroyed; Rance caused it via awakened Mage-Gift; Senta Chose Rance\\nPEND: Rance: reach Haven; Senta: stabilize Gift"

SL (merge by entity name):
- Group state[]/stance[]/voice[]/appearance[] entries sharing same n value
- t = use the t value from input (already classified)
- n = entity name exactly as appears
- c = merged: state + appearance + stance + voice quote with ctx
- k = [entity name, aliases]
- Max 1-2 voice quotes per entity, always with context

Output JSON only.`;
