// MACROS: {{existing_content}}, {{new_content}}, {{entry_name}}

export const auto_lorebook_recap_merge_prompt = `ROLE: Merge setting_lore entry. RECONSTRUCTION SIGNAL; minimum anchors for character/relationship continuity. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A has become protective of B and prioritizes B's safety"
Fragment: "A->B: protective; prioritizes safety"

DEDUPLICATION PHILOSOPHY (critical):
ONE REPRESENTATIVE EXAMPLE per behavior/trait/outcome. NOT multiple examples.
Different wording expressing SAME THING = duplicate. Drop all but one.
Ask: "What CHARACTER INFORMATION does this convey?" Same info = duplicate.

OUTPUT:
{
  "mergedContent": "fragment content",
  "canonicalName": "ProperName or null"
}

SUBJECT LOCK: Entry = {{entry_name}}. Other entities → Relationships only.

MERGE:
- Dedupe EXISTING; merge NEW
- Same idea = keep shortest
- Quotes: verbatim; one per intent

FACETS (fragments; only when shown):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics (debts/boundaries/pivots/promises/tension) | Voice: cadence cues | Notable dialogue: verbatim (full) | Secrets/Tension: if consequential | Keywords: 0-6 tokens

---------------- EXISTING ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- NEW ----------------
<NEW_CONTENT>
{{new_content}}
</NEW_CONTENT>

---------------- COMPRESS BEFORE OUTPUT ----------------

RELATIONSHIP COLLAPSING:
Collapse repetitive examples; preserve dynamics.
Before: "A->B: insisted rest; refused push; carried to safety; promised protection; insisted rest again"
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

CHECKLIST:
□ Fragments? (except quotes)
□ Relationships = net stance?
□ State = current only?
□ One quote per CHARACTER BEHAVIOR?
□ canonicalName = proper name or null (no titles)

Output JSON only.`;
