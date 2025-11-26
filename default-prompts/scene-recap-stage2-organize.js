// Stage 2: Condense and format
// MACROS: {{extracted_data}}, {{lorebook_entry_types_with_guidance}}
// INPUT: Stage 1 structured facets with entity types pre-assigned

export const scene_recap_stage2_organize_prompt = `ROLE: Merge extracted facets by entity into compact output for token-efficient context.

============ FILTERING (DO THIS FIRST) ============

For EACH item being merged into an entity, ask: "Does this earn its tokens?"

QUOTES (biggest bloat source):
- Earns inclusion: distinctive mannerism that helps recreate how they talk, OR plot-critical line that will be referenced
- Drop: generic dialogue, same energy as another kept quote (keep the better one), uncertain = drop

STATE/STANCE/APPEARANCE:
- Earns inclusion: information needed to continue roleplay accurately
- Drop: redundant with other content for same entity, or superseded by more current info

When merging multiple items of same type for one entity, consolidate. Don't just concatenate.

==========================================================================

OUTPUT FORMAT:
{
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [{ "t": "type", "n": "EntityName", "c": "combined content", "k": ["keywords"] }]
}

VALID ENTITY TYPES:
{{lorebook_entry_types_with_guidance}}

---------------- TRANSFORMATION RULES ----------------

RC (compact recap - FRAGMENTS, NOT PROSE):
- DEV: plot[] only. Outcomes only, no process.
- PEND: goals[] as "Actor: goal"
- STYLE: Fragments; semicolons; no articles. TELEGRAPHIC.
- DO NOT put reveals[] in rc. reveals[] = world lore → goes to sl as "lore" type entries.

SL (merge by entity name):
- Group state[]/stance[]/voice[]/appearance[] entries sharing same n value
- t = use the t value from input (already classified)
- n = entity name exactly as appears
- c = merged: state + appearance + stance + voice (quote with context)
- k = [entity name, aliases]

REVEALS → SL (route to appropriate type):
- Character backstory/secrets → merge into that character's sl entry
- Location facts → merge into that location's sl entry
- World mechanics/magic rules → t="lore", n=concept name
- Faction info → merge into that faction's sl entry
- Merge reveals into existing entries where possible

---------------- EXTRACTED DATA ----------------
<EXTRACTED>
{{extracted_data}}
</EXTRACTED>

Output JSON only.`;
