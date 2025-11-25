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
  "sl": [{ "t": "type", "n": "Name", "c": "content", "k": ["names/titles entity is called - NOT adjectives/states"], "u": "uid-if-known" }]
}

"k" FIELD = what the entity IS CALLED (names, titles, aliases, nicknames, species). These activate the lorebook entry when mentioned in chat.
WRONG: adjectives, emotional states, actions, traits (protective, exhausted, sleeping, fierce)
RIGHT: proper names, titles, what someone would call them (Senta, white mare, Companion, Captain Varis)

CATEGORIZATION:
- rc: plot outcomes; decisions; state changes; reveals. Fragments. No quotes/feelings/nuance.
  - DEV: what happened
  - PEND: active goals (who/what/condition)
- sl: entity nuance for tone. Stance; voice; relationships; triggers.
  - Types: {{lorebook_entry_types}}
  - NEVER CREATE ENTRY FOR {{user}}. Skip entirely. No exceptions. {{user}} info goes in rc or other entities' Relationships only.

DELTA CHECK:
- Compare against BASELINE (same type+name)
- Output ONLY new/changed facets
- Nothing new = omit entity
- UID: only if 100% certain match

FACETS (fragments; only when new):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics (debts/boundaries/pivots/promises/tension) | Voice: cadence cues | Notable dialogue: verbatim (full) | Secrets/Tension: if consequential

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
Duplicates = same behavior ABOUT the same thing. Different wording doesn't make it unique.

Before: "'Help me or leave me to die'; 'Refuse and I'll kick down the doors'; 'The healer, no one else'"
All 3 = demanding medical help. Same behavior, same subject. Duplicates.

NOT duplicates:
- "'I killed your father'" vs "'The treasure is under the church'" - both revealing, but different information

Ask: "Same action about the same thing?" YES → duplicate.

STATE SUPERSESSION:
Before: "injured; recovering; healed"
After: "healed"

CHECKLIST:
□ Fragments? (except quotes)
□ rc = plot only?
□ sl = delta-only? NO ENTRY FOR {{user}}?
□ Relationships = stance + dynamics?
□ Quotes = one per CHARACTER BEHAVIOR?
□ Keywords = entity references only (names/titles), NOT states/adjectives?
□ State = current only?

Output JSON only.`;
