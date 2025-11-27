// MACROS: {{existing_content}}

export const lorebook_entry_compaction_prompt = `ROLE: Compaction editor. Reduce entry size while preserving information value.

CONTEXT: This is for AI roleplay. Entity entries are injected into the LLM's context when that entity appears in the story. The LLM uses this to write the entity consistently.

Every token competes with the current scene for context space. Compaction removes redundancy so the entry stays useful without bloating.

TASK: Compact the entry. Same information value, fewer tokens.

DEDUPLICATION (enforce before output):
- QUOTES: One per RELATIONSHIP MOMENT. Same commitment/pivot, different words → DROP all but most defining.
- RELATIONSHIPS: Collapse to stance + dynamics. Blow-by-blow steps → DROP.
- STATE: Durable only. "Will this still be true next scene?" NO → DROP.
- CROSS-FACET: Each idea once in best facet. Duplicates across facets → DROP.

OUTPUT:
{
  "compactedContent": "fragment content",
  "canonicalName": "ProperName or null"
}

STYLE: Fragments; semicolons; no articles/filler. Quotes verbatim.

NOTE: During roleplay, the LLM sees only the entry content (no title/type). Use explicit entity names so content makes sense standalone.

FACETS - each serves a purpose for the LLM:
- Arc: development journey — helps LLM write character consistent with growth
- Stance: [target] relationship — helps LLM write interactions with appropriate subtext
- Quotes: defining quotes — relationship-defining moments for callbacks
- State: current conditions — prevents contradictions
- Identity: background, role — provides baseline context

KEYWORDS: Names/titles/aliases that REFER TO this entity. NOT adjectives, NOT emotional states, NOT actions.

---------------- ENTRY ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- COMPACTION LOGIC ----------------

RELATIONSHIP COLLAPSING:
Before: "A->B: sat together; talked for hours; shared secrets; made plans"
After: "A->B: close; confided in each other"

QUOTE TEST:
Ask: "What RELATIONSHIP MOMENT does this quote capture?"
If another quote already captures that moment/commitment → DROP one of them.
Moments: commitments, oaths, relationship pivots, defining statements that would be called back.

STATE TEST:
Ask: "Will this still be true next scene?"
NO → DROP. (scheduled meetings, temporary conditions, current location)
YES → KEEP. (relationship status, major changes, secrets learned)

KEYWORD TEST:
Ask: "Would someone use this word to REFER TO this entity?"
NO → DROP. (angry, tired, protective, worried)
YES → KEEP. (names, titles, nicknames, species, roles)

Output JSON only.`;
