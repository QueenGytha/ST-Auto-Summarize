// Stage 2: Filtering/Formatting
// MACROS: {{extracted_data}}, {{active_setting_lore}}, {{lorebook_entry_types}}

export const scene_recap_stage2_filtering_prompt = `ROLE: Filter into recap + setting_lore. RECONSTRUCTION SIGNALS; minimum anchors, not exhaustive records. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A has developed protective attitude toward B and prioritizes B's safety"
Fragment: "A->B: protective; prioritizes safety"

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
Same INTENT = duplicate. Keep ONE per INTENT per entity.
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

CHECKLIST:
□ Fragments? (except quotes)
□ rc = plot only?
□ sl = delta-only?
□ Relationships = stance + dynamics?
□ One quote per INTENT per entity?
□ State = current only?

Output JSON only.`;
