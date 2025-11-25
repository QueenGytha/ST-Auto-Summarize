// MACROS: {{existing_content}}

export const lorebook_entry_compaction_prompt = `ROLE: Compact setting_lore entry. RECONSTRUCTION SIGNAL; minimum anchors for LLM continuity. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A has become protective of B and prioritizes B's safety"
Fragment: "A->B: protective; prioritizes safety"

DEDUPLICATION PHILOSOPHY (critical):
ONE REPRESENTATIVE EXAMPLE per behavior/trait/outcome. NOT multiple examples.
Different wording expressing SAME THING = duplicate. Drop all but one.
Ask: "What CHARACTER INFORMATION does this convey?" Same info = duplicate.

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
ONE quote per CHARACTER BEHAVIOR. NOT one per wording variation.
Different words expressing SAME BEHAVIOR = duplicate. Keep ONE.

Ask for EACH quote: "What CHARACTER BEHAVIOR does this demonstrate?"
If another quote already demonstrates that behavior → DROP this one.

Before: "'Please don't go'; 'I'll do anything'; 'Don't leave me'"
All 3 demonstrate SAME BEHAVIOR (begging). After: "'Please don't go'"

Before: "'You're worthless'; 'Pathetic creature'; 'Know your place'"
All 3 demonstrate SAME BEHAVIOR (degrading). After: "'You're worthless'"

KEEP a quote ONLY if it reveals a DIFFERENT behavior not shown by other quotes.

STATE SUPERSESSION:
Before: "injured; recovering; healed"
After: "healed"

CROSS-FACET:
Each idea once in best facet.

CHECKLIST:
□ Fragments? (except quotes)
□ Relationships = stance + dynamics?
□ State = current only?
□ One quote per CHARACTER BEHAVIOR?
□ Cross-facet duplicates removed?
□ canonicalName = proper name or null (no titles)

Output JSON only.`;
