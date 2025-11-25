// MACROS: {{existing_content}}, {{new_content}}, {{entry_name}}

export const auto_lorebook_recap_merge_prompt = `ROLE: Merge setting_lore entry. RECONSTRUCTION SIGNAL; minimum anchors for character/relationship continuity. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A has become protective of B and prioritizes B's safety"
Fragment: "A->B: protective; prioritizes safety"

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
Same THEME = duplicate. Keep ONE per theme.
Before: "'I'll protect you'; 'Won't let anyone hurt you'; 'I've got you'"
After: "'I'll protect you'"

STATE SUPERSESSION:
Before: "injured; recovering; healed"
After: "healed"

CHECKLIST:
□ Fragments? (except quotes)
□ Relationships = net stance?
□ State = current only?
□ One quote per intent?
□ canonicalName = proper name or null (no titles)

Output JSON only.`;
