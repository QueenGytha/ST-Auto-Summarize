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

QUOTE DEDUPLICATION (critical - this is where bloat happens):
- ONE quote per BEHAVIOR per entity. BEHAVIOR = underlying character trait, NOT context/topic.
- Ask for each quote: "What CHARACTER TRAIT does this reveal?" (defiant, vulnerable, commanding, tender, sarcastic, desperate, begging, protective, etc.)
- TRAIT = personality pattern. NOT what the quote is about.
- Different words showing SAME TRAIT = duplicate → keep ONE, drop rest.

Examples of SAME TRAIT (= duplicate, keep only one):
- "Please don't" / "I'll do anything" / "Don't leave me" = all BEGGING
- "I don't care what you think" / "Try and stop me" = both DEFIANT
- "Oh, how delightful" / "What a pleasant surprise" = both SARCASTIC
- "You'll be safe now" / "I won't let anyone hurt you" = both PROTECTIVE

Map each quote to a trait. If another quote already shows that trait → DROP.

Output JSON only.`;
