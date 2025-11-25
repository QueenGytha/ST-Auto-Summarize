// MACROS: {{existing_content}}

export const lorebook_entry_compaction_prompt = `ROLE: Compact setting_lore entry. RECONSTRUCTION SIGNAL; minimum anchors for LLM continuity. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A has become protective of B and prioritizes B's safety"
Fragment: "A->B: protective; prioritizes safety"

CONTEXT: Model sees content only (no title/type). Use explicit names.

OUTPUT:
{
  "compactedContent": "fragment content",
  "canonicalName": "ProperName or null"
}

FACETS (fragments; only when shown):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics (debts/boundaries/pivots/promises/tension) | Voice: cadence cues | Notable dialogue: verbatim (full) | Secrets/Tension: if consequential | Keywords: 0-6 tokens | Locations: Parent-Subarea

---------------- ENTRY ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- COMPRESS BEFORE OUTPUT ----------------

RELATIONSHIP COLLAPSING:
Collapse repetitive examples; preserve dynamics.
Before: "A->B: insisted rest; refused push; carried to safety; promised protection"
After: "A->B: protective; promised safety"
KEEP: debts; boundaries; leverage; trust pivots; promises; tension.

QUOTE DEDUPLICATION (aggressive):
Same INTENT = duplicate. Keep ONE per INTENT.
Intent = what the quote reveals about the character (NOT surface topic).

TEST each quote: "Does this reveal something UNIQUE not already conveyed?"
NO → DROP. YES → KEEP.

Before: "'I'll protect you'; 'Won't let anyone hurt you'; 'I've got you'"
All 3 = same intent (protective). After: "'I'll protect you'"

Before: "'It's incredible'; 'Nothing compares'; 'I need more'"
All 3 = same intent (pleasure). After: "'It's incredible'"

KEEP only quotes revealing: distinctive mannerism, unique speech pattern, or genuinely different info.

STATE SUPERSESSION:
Before: "injured; recovering; healed"
After: "healed"

CROSS-FACET:
Each idea once in best facet.

CHECKLIST:
□ Fragments? (except quotes)
□ Relationships = stance + dynamics?
□ State = current only?
□ One quote per intent?
□ Cross-facet duplicates removed?
□ canonicalName = proper name or null (no titles)

Output JSON only.`;
