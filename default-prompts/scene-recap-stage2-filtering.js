// Stage 2: Filtering/Formatting
// MACROS: {{extracted_data}}, {{active_setting_lore}}, {{lorebook_entry_types}}

export const scene_recap_stage2_filtering_prompt = `ROLE: Filter extracted data into recap + setting_lore. Output ONLY what's new compared to CURRENT_SETTING_LORE. Output JSON only.

---------------- EXTRACTED_DATA (input to process) ----------------
<EXTRACTED_DATA>
{{extracted_data}}
</EXTRACTED_DATA>

---------------- CURRENT_SETTING_LORE (what already exists) ----------------
<CURRENT_SETTING_LORE>
{{active_setting_lore}}
</CURRENT_SETTING_LORE>

---------------- TASK: OUTPUT DELTA ONLY ----------------

For each entity in EXTRACTED_DATA:
1. Find matching entry in CURRENT_SETTING_LORE (same type+name)
2. Compare each facet - does CURRENT_SETTING_LORE already cover this?
3. Output ONLY facets NOT already in CURRENT_SETTING_LORE
4. Nothing new for an entity = omit that entity entirely

QUOTES = VOICE SIGNAL:
Purpose: Help LLM reconstruct HOW this character speaks (cadence, style, tone).
If CURRENT_SETTING_LORE already has a quote for this entity → only output a new quote if it shows a DIFFERENT voice pattern.
Voice patterns: commanding, pleading, philosophical, threatening, tender, formal, etc.
Same voice pattern in different words = skip the new quote.

APPEARANCE:
If CURRENT_SETTING_LORE already describes a physical trait → skip poetic rewordings of that trait.
Only add appearance if it's a genuinely NEW physical feature.

---------------- OUTPUT FORMAT ----------------

{
  "sn": "Title (max 5 words)",
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [{ "t": "type", "n": "Name", "c": "content", "k": ["keywords"] }]
}

UID FIELD: Only include "u" field if entity EXACTLY matches an entry in CURRENT_SETTING_LORE. Copy the uid from that entry (e.g., "u": "8"). For NEW entities not in CURRENT_SETTING_LORE, OMIT the "u" field entirely.

CATEGORIZATION:
- rc: plot outcomes; decisions; state changes; reveals. Fragments. No quotes/feelings/nuance.
  - DEV: what happened
  - PEND: active goals (who/what/condition)
- sl: entity nuance for tone. Stance; voice; relationships; triggers.
  - Types: {{lorebook_entry_types}}

{{user}} HANDLING (critical - do not lose information):
- {{user}} = the player character. NEVER create sl entry for {{user}}.
- {{user}} actions/plot decisions → go in rc (e.g., "{{user}} agreed to help")
- {{user}}'s stance toward others → store in THAT OTHER entity's Relationships as "{{user}}->Entity: stance"
  Example: If {{user}} is dismissive toward Senta, put "{{user}}->Senta: dismissive" in SENTA's entry, not a {{user}} entry.
- {{user}} voice/appearance/triggers → DO NOT CAPTURE (user controls their own character)

"k" FIELD = what the entity IS CALLED (names, titles, aliases). These activate the lorebook entry.
WRONG: adjectives, emotional states, traits (protective, exhausted, sleeping)
RIGHT: proper names, titles (Senta, white mare, Companion, Captain Varis)

FACETS (fragments; only when new):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics | Voice: cadence cues | Notable dialogue: verbatim | Secrets/Tension: if consequential

---------------- COMPRESS BEFORE OUTPUT ----------------

TOKEN CONSERVATION: Fragments; semicolons; no articles/filler.

RELATIONSHIP COLLAPSING:
Before: "A->B: insisted rest; refused push; carried to safety; promised protection"
After: "A->B: protective; promised safety"

STATE SUPERSESSION:
Before: "injured; recovering; healed"
After: "healed"

CHECKLIST:
□ Fragments? (except quotes)
□ rc = plot only (no feelings/nuance)?
□ sl = delta-only (nothing already in CURRENT_SETTING_LORE)?
□ NO sl entry for {{user}}? ({{user}} actions→rc, {{user}} stance→other entities' Relationships)
□ Keywords = entity references only (names/titles), NOT states/adjectives?

Output JSON only.`;
