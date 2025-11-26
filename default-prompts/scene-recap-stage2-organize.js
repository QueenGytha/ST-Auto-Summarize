// Stage 2: Condense and format
// MACROS: {{extracted_data}}, {{lorebook_entry_types_with_guidance}}
// INPUT: Stage 1 structured facets with entity types pre-assigned

export const scene_recap_stage2_organize_prompt = `ROLE: Merge extracted facets by entity into compact output.
The intent is for the LLM to use this to reconstruct the roleplay using these entities for token efficiency. Capturing nuance/plot etc is paramount while also ensuring we don't have duplication of similar concepts/ideas/attributes etc within the same entity.

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

SL (merge by entity name):
- Group state[]/stance[]/voice[]/appearance[] entries sharing same n value
- t = use the t value from input (already classified)
- n = entity name exactly as appears
- c = merged: state + appearance + stance + voice (quote with context)
- k = [entity name, aliases]
- Voice: ONE quote per distinct BEHAVIOR (same behavior = duplicate, drop)

Output JSON only.`;
