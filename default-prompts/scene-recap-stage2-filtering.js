// Stage 2: Filtering/Formatting
// MACROS: {{extracted_data}}, {{active_setting_lore}}, {{lorebook_entry_types}}

export const scene_recap_stage2_filtering_prompt = `ROLE: Filter into recap + setting_lore. RECONSTRUCTION SIGNALS; minimum anchors, not exhaustive records. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A has developed protective attitude toward B and prioritizes B's safety"
Fragment: "A->B: protective; prioritizes safety"

DEDUPLICATION PHILOSOPHY (critical):
ONE REPRESENTATIVE EXAMPLE per behavior/trait/outcome. NOT multiple examples.
Different wording expressing SAME THING = duplicate. Drop all but one.
Ask: "What CHARACTER INFORMATION does this convey?" Same info = duplicate.

OUTPUT:
{
  "sn": "Title (max 5 words)",
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [{ "t": "type", "n": "Name", "c": "content", "k": ["keywords"], "u": "uid-if-known" }]
}

CATEGORIZATION:
- rc: plot outcomes; decisions; state changes; reveals. Fragments. No quotes/feelings/nuance.
  - DEV: what happened
  - PEND: active goals (who/what/condition)
- sl: entity nuance for tone. Stance; voice; relationships; triggers.
  - Types: {{lorebook_entry_types}}
  - Never for {{user}}

DELTA CHECK:
- Compare against BASELINE (same type+name)
- Output ONLY new/changed facets
- Nothing new = omit entity
- UID: only if 100% certain match

FACETS (fragments; only when new):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics (debts/boundaries/pivots/promises/tension) | Voice: cadence cues | Notable dialogue: verbatim (full) | Secrets/Tension: if consequential | Keywords: 0-6 tokens

---------------- BASELINE ----------------
<CURRENT_SETTING_LORE>
{{active_setting_lore}}
</CURRENT_SETTING_LORE>

---------------- INPUT ----------------
<EXTRACTED_DATA>
{{extracted_data}}
</EXTRACTED_DATA>

---------------- COMPRESS BEFORE OUTPUT ----------------

RELATIONSHIP COLLAPSING:
Collapse repetitive examples; preserve dynamics.
Before: "A->B: insisted rest; refused push; carried to safety; promised protection; insisted rest again"
After: "A->B: protective; promised safety"
KEEP: debts; boundaries; leverage; trust pivots; promises; tension.

QUOTE DEDUPLICATION (aggressive):
ONE quote per CHARACTER BEHAVIOR per entity. NOT one per wording variation.
Different words expressing SAME BEHAVIOR = duplicate. Keep ONE.

Ask for EACH quote: "What CHARACTER BEHAVIOR does this demonstrate?"
If another quote already demonstrates that behavior → DROP this one.

Before: "'Please don't go'; 'I'll do anything'; 'Don't leave me'; 'I'm begging you'"
All 4 demonstrate SAME BEHAVIOR (begging). After: "'Please don't go'"

Before: "'You're worthless'; 'Pathetic creature'; 'Know your place'"
All 3 demonstrate SAME BEHAVIOR (degrading). After: "'You're worthless'"

Before: "'It feels amazing'; 'Nothing compares'; 'Don't stop'; 'More'"
All 4 demonstrate SAME BEHAVIOR (pleasure). After: "'It feels amazing'"

KEEP a quote ONLY if it reveals a DIFFERENT behavior not shown by other quotes from same character.

STATE SUPERSESSION:
Before: "injured; recovering; healed"
After: "healed"

CHECKLIST:
□ Fragments? (except quotes)
□ rc = plot only?
□ sl = delta-only?
□ Relationships = stance + dynamics?
□ One quote per CHARACTER BEHAVIOR per entity?
□ State = current only?

Output JSON only.`;
